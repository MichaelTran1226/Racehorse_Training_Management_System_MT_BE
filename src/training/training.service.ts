import { HttpStatus, Injectable } from '@nestjs/common';
import {
  HorseStatus,
  PlanStatus,
  Prisma,
  Role,
  TrackSurface,
  UserStatus,
  WorkoutStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CounterService } from '../audit/counter.service';
import { apiError } from '../common/exceptions/api-error';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateTrainingPlanDto } from './dto/create-training-plan.dto';
import { UpdateTrainingPlanDto } from './dto/update-training-plan.dto';
import { QueryTrainingPlanDto } from './dto/query-training-plan.dto';
import { CreateWorkoutSessionDto, RepeatWorkoutDto } from './dto/create-workout-session.dto';
import { UpdateWorkoutSessionDto } from './dto/update-workout-session.dto';
import { RecordWorkoutResultDto } from './dto/record-result.dto';
import {
  AcknowledgeAlertDto,
  CancelWorkoutDto,
  ChangePlanStatusDto,
  ClonePlanDto,
  RestoreWorkoutDto,
} from './dto/workout-actions.dto';
import {
  addDays,
  clubDate,
  effectiveIntensity,
  effectiveSurface,
  isHeavy,
  LATE_RESULT_DAYS,
  LOAD_SPIKE_RATIO,
  MAX_PLAN_WEEKS,
  MAX_WORKOUTS_PER_DAY,
  NO_TIME_TYPES,
  PENDING_WORKOUT_STATUSES,
  PlanPhase,
  SPEED_TYPES,
  startOfClubDay,
  startOfClubWeek,
  TRIAL_SLOT_MINUTES,
  validatePhases,
  withinTrainingHours,
  workoutLoad,
} from './training-rules';

type Tx = Prisma.TransactionClient;

const MEDICAL_STATUSES: HorseStatus[] = [
  HorseStatus.UNDER_OBSERVATION,
  HorseStatus.INJURED,
  HorseStatus.ISOLATED,
];

const CANCEL_REASON_LABEL: Record<string, string> = {
  WEATHER: 'Thời tiết',
  TRACK_CONDITION: 'Mặt sân không đảm bảo',
  HORSE_HEALTH: 'Sức khỏe ngựa',
  PLAN_CHANGE: 'Thay đổi kế hoạch',
  OTHER: 'Khác',
};

const RESULT_EDIT_HOURS = 48; // Q-2.11
const MAX_REPEAT_WORKOUTS = 60; // DL-2.01
const HEAVY_GAP_HOURS = 48; // cảnh báo 2 bài nặng cách nhau < 48 giờ
const GROOM_OVERLAP_MINUTES = 30; // cảnh báo nhân viên chăm sóc trùng giờ

const PLAN_INCLUDE = {
  horse: {
    select: {
      id: true,
      name: true,
      horseCode: true,
      status: true,
      isMedicalLocked: true,
      avatarUrl: true,
      ownerId: true,
    },
  },
  trainer: { select: { id: true, fullName: true, email: true } },
  _count: { select: { workoutSessions: true } },
} satisfies Prisma.TrainingPlanInclude;

const WORKOUT_INCLUDE = {
  horse: {
    select: {
      id: true,
      name: true,
      horseCode: true,
      isMedicalLocked: true,
      status: true,
      ownerId: true,
      // Ô chuồng đang ở: hiện trên "Lịch tập của tôi" của Groom (SC-2.08)
      stallAllocations: {
        where: { isActive: true },
        take: 1,
        select: { stall: { select: { code: true } } },
      },
    },
  },
  assignedStaff: { select: { id: true, fullName: true } },
  trainingPlan: { select: { id: true, phaseName: true, status: true, phases: true } },
  resultRecordedBy: { select: { id: true, fullName: true } },
  resultUpdatedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.WorkoutSessionInclude;

/** Dữ liệu buổi tập sau khi gộp bản cũ + thay đổi, dùng chung cho kiểm tra DL-2.01. */
interface WorkoutDraft {
  scheduledDate: Date;
  phaseId?: string | null;
  workoutType: string;
  intensity: string;
  trackSurface: string;
  distanceMeters: number;
  repetitions: number;
  targetSpeedKmh?: number | null;
  jockeyName?: string | null;
  assignedStaffUserId: string;
  vetConsulted?: boolean;
}

type PlanForCheck = {
  id: string;
  status: PlanStatus;
  horseId: string;
  startDate: Date;
  endDate: Date;
  phases: Prisma.JsonValue;
};

/** Đọc danh sách giai đoạn từ cột JSON (giáo án cũ có thể thiếu trường -> bỏ qua). */
function phasesOf(plan: { phases: Prisma.JsonValue }): PlanPhase[] {
  return Array.isArray(plan.phases) ? (plan.phases as unknown as PlanPhase[]) : [];
}

/** GROOM không thấy điểm phong độ (Q-2.09). */
function hideScoreForGroom<T extends { performanceScore: number | null }>(
  row: T,
  user: CurrentUserPayload,
): T {
  return user.role === UserRole.GROOM ? { ...row, performanceScore: null } : row;
}

@Injectable()
export class TrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly counter: CounterService,
  ) {}

  /**
   * Checks whether a horse is under an active Medical Lock (RULE-MED-01).
   */
  async checkMedicalLock(
    horseId: string,
  ): Promise<{ isLocked: boolean; reason?: string; lockCode?: string }> {
    const horse = await this.prisma.horse.findUnique({
      where: { id: horseId, deletedAt: null },
      include: {
        medicalLocks: {
          where: { isLocked: true },
          orderBy: { lockedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Target horse not found.');
    }

    const activeLock = horse.medicalLocks[0];
    const isLocked = horse.isMedicalLocked || !!activeLock;

    return {
      isLocked,
      reason:
        activeLock?.lockReason ||
        (horse.isMedicalLocked ? 'Active medical hold placed by veterinary staff' : undefined),
      lockCode: activeLock?.lockCode ?? undefined,
    };
  }

  /**
   * Việc "hệ thống tự làm" của Flow 2 (§4.1, §4.2), chạy mỗi lần đọc danh sách:
   * - Buổi Đã lên lịch quá hết ngày hôm sau mà chưa ghi kết quả -> Bỏ lỡ.
   * - Giáo án Đang áp dụng qua ngày kết thúc 1 ngày -> Hoàn thành, buổi chưa diễn ra -> Đã hủy.
   * Dự án chưa có bộ lập lịch (cron) nên làm "lười" ở đây; kết quả giống nhau dù chạy bao nhiêu lần.
   */
  async sweepOverdue(now = new Date()): Promise<void> {
    const today = startOfClubDay(now);
    await this.prisma.workoutSession.updateMany({
      where: { status: WorkoutStatus.SCHEDULED, scheduledDate: { lt: addDays(today, -1) } },
      data: { status: WorkoutStatus.MISSED },
    });

    const overdue = await this.prisma.trainingPlan.findMany({
      where: { status: PlanStatus.ACTIVE, endDate: { lt: addDays(today, -1) } },
      select: { id: true },
    });
    for (const plan of overdue) {
      await this.prisma.$transaction([
        this.prisma.trainingPlan.update({
          where: { id: plan.id },
          data: {
            status: PlanStatus.COMPLETED,
            completionSummary: 'Hệ thống tự hoàn thành vì đã quá ngày kết thúc.',
          },
        }),
        this.prisma.workoutSession.updateMany({
          where: { trainingPlanId: plan.id, status: { in: PENDING_WORKOUT_STATUSES } },
          data: { status: WorkoutStatus.CANCELLED, statusReason: 'Giáo án đã kết thúc' },
        }),
      ]);
    }
  }

  // ---------------------------------------------------------------- Giáo án

  /**
   * Tiến độ = số buổi Hoàn thành / số buổi đã đến hạn (không tính buổi đã hủy). Dùng cho SC-2.01, SC-2.02.
   */
  private async progressOf(planIds: string[]) {
    const now = new Date();
    const rows = await this.prisma.workoutSession.groupBy({
      by: ['trainingPlanId', 'status'],
      where: {
        trainingPlanId: { in: planIds },
        scheduledDate: { lte: now },
        status: { not: WorkoutStatus.CANCELLED },
      },
      _count: { _all: true },
    });
    const result = new Map<string, { completed: number; due: number }>();
    for (const r of rows) {
      const cur = result.get(r.trainingPlanId) ?? { completed: 0, due: 0 };
      cur.due += r._count._all;
      if (r.status === WorkoutStatus.COMPLETED) cur.completed += r._count._all;
      result.set(r.trainingPlanId, cur);
    }
    return result;
  }

  /** SC-2.02 Danh sách giáo án (CM, HT, VET tất cả; OWNER ngựa sở hữu). */
  async findAllPlans(query: QueryTrainingPlanDto, user: CurrentUserPayload) {
    await this.sweepOverdue();
    const { horseId, status, search, page = 1, pageSize = 20 } = query;

    const where: Prisma.TrainingPlanWhereInput = { horse: { deletedAt: null } };
    if (horseId) where.horseId = horseId;
    if (status) where.status = status;
    if (user.role === UserRole.HORSE_OWNER) {
      where.horse = { deletedAt: null, ownerId: user.userId };
    }
    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { phaseName: { contains: term, mode: 'insensitive' } },
        { planCode: { contains: term, mode: 'insensitive' } },
        { horse: { name: { contains: term, mode: 'insensitive' } } },
        { horse: { horseCode: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.trainingPlan.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { startDate: 'desc' },
        include: PLAN_INCLUDE,
      }),
      this.prisma.trainingPlan.count({ where }),
    ]);
    const progress = await this.progressOf(items.map((p) => p.id));

    return {
      items: items.map((p) => ({ ...p, progress: progress.get(p.id) ?? { completed: 0, due: 0 } })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** SC-2.04 Chi tiết giáo án kèm buổi tập và người ghi kết quả. Ngoài phạm vi -> 404. */
  async findPlanById(id: string, user: CurrentUserPayload) {
    const plan = await this.prisma.trainingPlan.findUnique({
      where: { id },
      include: {
        ...PLAN_INCLUDE,
        horse: {
          select: {
            ...PLAN_INCLUDE.horse.select,
            medicalLocks: {
              where: { isLocked: true },
              take: 1,
              select: { lockedAt: true, lockReason: true },
            },
          },
        },
        workoutSessions: {
          orderBy: { scheduledDate: 'asc' },
          include: {
            assignedStaff: { select: { id: true, fullName: true } },
            resultRecordedBy: { select: { id: true, fullName: true } },
            resultUpdatedBy: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    const outOfScope =
      !plan || (user.role === UserRole.HORSE_OWNER && plan.horse.ownerId !== user.userId);
    if (outOfScope) {
      throw apiError(HttpStatus.NOT_FOUND, 'PLAN_NOT_FOUND', 'Training plan not found.');
    }
    const progress = (await this.progressOf([plan.id])).get(plan.id) ?? { completed: 0, due: 0 };
    return { ...plan, progress };
  }

  /** Ngày bắt đầu / kết thúc hợp lệ (SC-2.03): kết thúc ≥ bắt đầu, tối đa 52 tuần. */
  private assertPlanDates(startDate: Date, endDate: Date) {
    if (startDate > endDate) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_DATE_RANGE',
        'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.',
      );
    }
    if (endDate.getTime() - startDate.getTime() > MAX_PLAN_WEEKS * 7 * 24 * 60 * 60 * 1000) {
      throw apiError(HttpStatus.BAD_REQUEST, 'PLAN_TOO_LONG', 'Giáo án tối đa 52 tuần.');
    }
  }

  private checkedPhases(raw: unknown, startDate: Date, endDate: Date): PlanPhase[] {
    const result = validatePhases(raw, clubDate(startDate), clubDate(endDate));
    if ('code' in result) {
      throw apiError(HttpStatus.BAD_REQUEST, result.code, result.message);
    }
    return result.phases;
  }

  /** SC-2.03 Tạo giáo án: luôn ở Nháp; mã GA-xxxxxx; giai đoạn hợp lệ; ngựa không Ngừng quản lý. */
  async createPlan(dto: CreateTrainingPlanDto, user: CurrentUserPayload) {
    const horse = await this.prisma.horse.findUnique({
      where: { id: dto.horseId, deletedAt: null },
    });
    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Target horse not found.');
    }
    if (horse.status === HorseStatus.RETIRED) {
      throw apiError(HttpStatus.BAD_REQUEST, 'HORSE_RETIRED', 'Ngựa đã ngừng quản lý.');
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (startDate < addDays(startOfClubDay(new Date()), -7)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'START_DATE_TOO_EARLY',
        'Ngày bắt đầu không được sớm hơn 7 ngày trước.',
      );
    }
    this.assertPlanDates(startDate, endDate);
    const phases = this.checkedPhases(dto.phases, startDate, endDate);

    const seq = await this.counter.next('training_plan');
    // Không tự đổi trạng thái ngựa ở đây: chỉ khi Kích hoạt và HT chọn (DL-2.02).
    const plan = await this.prisma.trainingPlan.create({
      data: {
        planCode: `GA-${String(seq).padStart(6, '0')}`,
        horseId: dto.horseId,
        trainerUserId: user.userId,
        phaseName: dto.phaseName.trim(),
        objective: dto.objective.trim(),
        notes: dto.notes?.trim() || null,
        phases: phases as unknown as Prisma.InputJsonValue,
        targetSpeed: dto.targetSpeed,
        targetDistance: dto.targetDistance,
        trackSurface: dto.trackSurface ?? TrackSurface.TURF,
        startDate,
        endDate,
        status: PlanStatus.DRAFT,
      },
      include: PLAN_INCLUDE,
    });

    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'CREATE_TRAINING_PLAN',
      `Created training plan ${plan.planCode} "${plan.phaseName}" for horse ${plan.horse.name}`,
      plan.id,
      {
        entityName: 'TrainingPlan',
        newValues: { phaseName: plan.phaseName, horseId: dto.horseId },
      },
    );

    return plan;
  }

  /**
   * Sửa giáo án Nháp hoặc Đang áp dụng (FR-2.04). Giai đoạn đã có buổi Hoàn thành không xóa được
   * và không đổi được Từ ngày; xóa giai đoạn thì xóa luôn các buổi chưa diễn ra trong đó (BTN-2.10).
   */
  async updatePlan(id: string, dto: UpdateTrainingPlanDto, user: CurrentUserPayload) {
    const existing = await this.prisma.trainingPlan.findUnique({ where: { id } });
    if (!existing) {
      throw apiError(HttpStatus.NOT_FOUND, 'PLAN_NOT_FOUND', 'Training plan not found.');
    }
    if (existing.status !== PlanStatus.DRAFT && existing.status !== PlanStatus.ACTIVE) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'PLAN_CLOSED',
        'Giáo án đã hoàn thành hoặc đã hủy nên không sửa được.',
      );
    }
    const startDate = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : existing.endDate;
    if (startDate < addDays(startOfClubDay(new Date()), -7)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'START_DATE_TOO_EARLY',
        'Ngày bắt đầu không được sớm hơn 7 ngày trước.',
      );
    }
    this.assertPlanDates(startDate, endDate);
    const phases = this.checkedPhases(dto.phases ?? existing.phases, startDate, endDate);

    // Giai đoạn đã có buổi Hoàn thành phải còn và giữ nguyên Từ ngày.
    const done = await this.prisma.workoutSession.findMany({
      where: { trainingPlanId: id, status: WorkoutStatus.COMPLETED, phaseId: { not: null } },
      select: { phaseId: true },
      distinct: ['phaseId'],
    });
    const oldPhases = phasesOf(existing);
    for (const { phaseId } of done) {
      const before = oldPhases.find((p) => p.id === phaseId);
      const after = phases.find((p) => p.id === phaseId);
      if (before && (!after || after.startDate !== before.startDate)) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'PHASE_HAS_COMPLETED_WORKOUTS',
          `Giai đoạn ${before.name} đã có buổi tập hoàn thành.`,
        );
      }
    }
    const removed = oldPhases.filter((p) => !phases.some((n) => n.id === p.id)).map((p) => p.id);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (removed.length > 0) {
        await tx.workoutSession.deleteMany({
          where: {
            trainingPlanId: id,
            phaseId: { in: removed },
            status: { in: PENDING_WORKOUT_STATUSES },
          },
        });
      }
      return tx.trainingPlan.update({
        where: { id },
        data: {
          ...(dto.phaseName && { phaseName: dto.phaseName.trim() }),
          ...(dto.objective !== undefined && { objective: dto.objective.trim() }),
          ...(dto.notes !== undefined && { notes: dto.notes.trim() || null }),
          phases: phases as unknown as Prisma.InputJsonValue,
          ...(dto.targetSpeed !== undefined && { targetSpeed: dto.targetSpeed }),
          ...(dto.targetDistance !== undefined && { targetDistance: dto.targetDistance }),
          ...(dto.trackSurface && { trackSurface: dto.trackSurface }),
          startDate,
          endDate,
        },
        include: PLAN_INCLUDE,
      });
    });

    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'UPDATE_TRAINING_PLAN',
      `Updated training plan "${updated.phaseName}" (${updated.id})`,
      updated.id,
      {
        entityName: 'TrainingPlan',
        oldValues: {
          phaseName: existing.phaseName,
          startDate: existing.startDate,
          endDate: existing.endDate,
        },
        newValues: { phaseName: updated.phaseName, startDate, endDate, removedPhases: removed },
      },
    );
    return updated;
  }

  /**
   * DL-2.02 Kích hoạt (Nháp -> Đang áp dụng), DL-2.04 Hoàn thành, DL-2.03 Hủy.
   * Khóa dòng giáo án và dòng ngựa: Khóa y tế đặt cùng lúc sẽ phải chờ, không lọt qua kiểm tra.
   */
  async changePlanStatus(id: string, dto: ChangePlanStatusDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "TrainingPlan" WHERE "id" = ${id} FOR UPDATE`;
      const plan = await tx.trainingPlan.findUnique({ where: { id } });
      if (!plan) {
        throw apiError(HttpStatus.NOT_FOUND, 'PLAN_NOT_FOUND', 'Training plan not found.');
      }
      await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id" = ${plan.horseId} FOR UPDATE`;
      const horse = await tx.horse.findUnique({ where: { id: plan.horseId } });

      let cancelledWorkouts = 0;
      const data: Prisma.TrainingPlanUpdateInput = { status: dto.status };

      if (dto.status === PlanStatus.ACTIVE) {
        if (plan.status !== PlanStatus.DRAFT) {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            'INVALID_PLAN_TRANSITION',
            'Chỉ kích hoạt được giáo án đang ở Nháp.',
          );
        }
        await this.assertCanActivate(tx, plan, horse, dto);
        if (dto.moveHorseToTraining && horse!.status === HorseStatus.RESTING) {
          await tx.horse.update({
            where: { id: horse!.id },
            data: { status: HorseStatus.IN_TRAINING },
          });
          await this.auditService.record(
            { id: user.userId, name: user.fullName || user.email },
            'HORSE_STATUS_CHANGED',
            `Changed status of horse ${horse!.name} from RESTING to IN_TRAINING. Reason: Kích hoạt giáo án ${plan.phaseName}`,
            horse!.id,
            {
              entityName: 'Horse',
              newValues: {
                oldStatus: 'RESTING',
                newStatus: 'IN_TRAINING',
                reason: 'Kích hoạt giáo án',
              },
            },
            tx,
          );
        }
      } else {
        const allowedFrom: PlanStatus[] =
          dto.status === PlanStatus.COMPLETED
            ? [PlanStatus.ACTIVE]
            : [PlanStatus.DRAFT, PlanStatus.ACTIVE];
        if (!allowedFrom.includes(plan.status)) {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            'INVALID_PLAN_TRANSITION',
            dto.status === PlanStatus.COMPLETED
              ? 'Chỉ hoàn thành được giáo án Đang áp dụng.'
              : 'Giáo án đã kết thúc.',
          );
        }
        if (dto.status === PlanStatus.COMPLETED) {
          if (!dto.summary) {
            throw apiError(
              HttpStatus.BAD_REQUEST,
              'SUMMARY_REQUIRED',
              'Nhận xét phải từ 10 đến 2000 ký tự.',
            );
          }
          data.completionSummary = dto.summary.trim();
        } else {
          if (!dto.reason) {
            throw apiError(
              HttpStatus.BAD_REQUEST,
              'REASON_REQUIRED',
              'Lý do phải từ 10 đến 500 ký tự.',
            );
          }
          data.cancelReason = dto.reason.trim();
        }
        const res = await tx.workoutSession.updateMany({
          where: { trainingPlanId: id, status: { in: PENDING_WORKOUT_STATUSES } },
          data: { status: WorkoutStatus.CANCELLED, statusReason: 'Giáo án đã kết thúc' },
        });
        cancelledWorkouts = res.count;
      }

      const updated = await tx.trainingPlan.update({ where: { id }, data, include: PLAN_INCLUDE });

      await this.auditService.record(
        { id: user.userId, name: user.fullName || user.email },
        `TRAINING_PLAN_${dto.status}`,
        `Training plan "${plan.phaseName}" ${plan.status} -> ${dto.status}`,
        id,
        {
          entityName: 'TrainingPlan',
          oldValues: { status: plan.status },
          newValues: { status: dto.status, reason: dto.reason, cancelledWorkouts },
        },
        tx,
      );

      return { ...updated, cancelledWorkouts };
    });
  }

  /** Các dòng ✖ của DL-2.02 (chặn) và dòng ⚠ (cần xác nhận đã trao đổi với VET). */
  private async assertCanActivate(
    tx: Tx,
    plan: { id: string; horseId: string; endDate: Date },
    horse: {
      id: string;
      isMedicalLocked: boolean;
      status: HorseStatus;
      deletedAt: Date | null;
    } | null,
    dto: ChangePlanStatusDto,
  ) {
    if (!horse || horse.deletedAt) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Target horse not found.');
    }
    if (horse.isMedicalLocked) {
      throw apiError(
        HttpStatus.CONFLICT,
        'MEDICAL_LOCK_ACTIVE',
        'Ngựa đang bị Khóa huấn luyện y tế. Không thể kích hoạt giáo án.',
      );
    }
    if (horse.status === HorseStatus.RETIRED) {
      throw apiError(HttpStatus.BAD_REQUEST, 'HORSE_RETIRED', 'Ngựa đã ngừng quản lý.');
    }
    const other = await tx.trainingPlan.findFirst({
      where: { horseId: horse.id, status: PlanStatus.ACTIVE, id: { not: plan.id } },
    });
    if (other) {
      throw apiError(
        HttpStatus.CONFLICT,
        'HORSE_HAS_ACTIVE_PLAN',
        `Ngựa đang áp dụng giáo án ${other.phaseName}. Hãy hoàn thành hoặc hủy giáo án đó trước.`,
        { planId: other.id },
      );
    }
    const workouts = await tx.workoutSession.count({
      where: { trainingPlanId: plan.id, status: { not: WorkoutStatus.CANCELLED } },
    });
    if (workouts === 0) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'PLAN_HAS_NO_WORKOUTS',
        'Giáo án phải có ít nhất 1 buổi tập trước khi kích hoạt.',
      );
    }
    if (plan.endDate < startOfClubDay(new Date())) {
      throw apiError(HttpStatus.BAD_REQUEST, 'PLAN_ENDED', 'Ngày kết thúc của giáo án đã qua.');
    }
    if (MEDICAL_STATUSES.includes(horse.status) && !dto.vetConsulted) {
      throw apiError(
        HttpStatus.CONFLICT,
        'VET_CONFIRMATION_REQUIRED',
        `Ngựa đang ở trạng thái ${horse.status}. Hãy xác nhận đã trao đổi với Bác sĩ thú y.`,
        { horseStatus: horse.status },
      );
    }
  }

  /** Xóa giáo án: chỉ giáo án Nháp chưa có buổi hoàn thành. Còn lại dùng Hủy giáo án. */
  async deletePlan(id: string, user: CurrentUserPayload) {
    const plan = await this.prisma.trainingPlan.findUnique({
      where: { id },
      include: { workoutSessions: { where: { status: WorkoutStatus.COMPLETED }, take: 1 } },
    });
    if (!plan) {
      throw apiError(HttpStatus.NOT_FOUND, 'PLAN_NOT_FOUND', 'Training plan not found.');
    }
    if (plan.status !== PlanStatus.DRAFT || plan.workoutSessions.length > 0) {
      throw apiError(
        HttpStatus.CONFLICT,
        'PLAN_NOT_DELETABLE',
        'Chỉ xóa được giáo án Nháp chưa có buổi tập hoàn thành. Hãy dùng Hủy giáo án.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.workoutSession.deleteMany({ where: { trainingPlanId: id } }),
      this.prisma.trainingPlan.delete({ where: { id } }),
    ]);

    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'DELETE_TRAINING_PLAN',
      `Deleted draft training plan "${plan.phaseName}" (${id})`,
      id,
      { entityName: 'TrainingPlan' },
    );
    return { message: 'Training plan deleted successfully.' };
  }

  /**
   * DL-2.08 Nhân bản giáo án sang ngựa khác: bản mới luôn Nháp; buổi tập dời theo độ lệch ngày
   * bắt đầu, không chép kết quả. Ngựa đích đang khóa thì buổi nặng được tạo ở trạng thái Bị chặn.
   */
  async clonePlan(id: string, dto: ClonePlanDto, user: CurrentUserPayload) {
    const source = await this.prisma.trainingPlan.findUnique({
      where: { id },
      include: { workoutSessions: { where: { status: { not: WorkoutStatus.CANCELLED } } } },
    });
    if (!source) {
      throw apiError(HttpStatus.NOT_FOUND, 'PLAN_NOT_FOUND', 'Training plan not found.');
    }
    const horse = await this.prisma.horse.findUnique({
      where: { id: dto.targetHorseId, deletedAt: null },
    });
    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Target horse not found.');
    }
    if (horse.status === HorseStatus.RETIRED) {
      throw apiError(HttpStatus.BAD_REQUEST, 'HORSE_RETIRED', 'Ngựa đã ngừng quản lý.');
    }

    const now = new Date();
    const startDate = dto.startDate ? new Date(dto.startDate) : startOfClubDay(now);
    if (startDate < startOfClubDay(now)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'START_DATE_IN_PAST',
        'Ngày bắt đầu không được trước ngày hiện tại.',
      );
    }
    const shift = startDate.getTime() - source.startDate.getTime();
    const copyWorkouts = dto.copyWorkouts !== false;

    const plan = await this.prisma.trainingPlan.create({
      data: {
        horseId: horse.id,
        trainerUserId: user.userId,
        planCode: `GA-${String(await this.counter.next('training_plan')).padStart(6, '0')}`,
        phaseName: dto.name ?? `${source.phaseName} (bản sao)`,
        objective: source.objective,
        notes: source.notes,
        // Giai đoạn dời ngày theo độ lệch ngày bắt đầu, giữ id để buổi tập vẫn thuộc đúng giai đoạn.
        phases: phasesOf(source).map((ph) => ({
          ...ph,
          startDate: clubDate(new Date(Date.parse(`${ph.startDate}T00:00:00+07:00`) + shift)),
          endDate: clubDate(new Date(Date.parse(`${ph.endDate}T00:00:00+07:00`) + shift)),
        })) as unknown as Prisma.InputJsonValue,
        targetSpeed: source.targetSpeed,
        targetDistance: source.targetDistance,
        trackSurface: source.trackSurface,
        startDate,
        endDate: new Date(source.endDate.getTime() + shift),
        status: PlanStatus.DRAFT,
        ...(copyWorkouts && {
          workoutSessions: {
            create: source.workoutSessions
              .map((w) => ({ w, date: new Date(w.scheduledDate.getTime() + shift) }))
              .filter(({ date }) => date >= now)
              .map(({ w, date }) => {
                const blocked = horse.isMedicalLocked && isHeavy(w.workoutType, w.intensity);
                return {
                  horseId: horse.id,
                  assignedStaffUserId: w.assignedStaffUserId,
                  phaseId: w.phaseId,
                  scheduledDate: date,
                  distanceMeters: w.distanceMeters,
                  repetitions: w.repetitions,
                  targetSpeedKmh: w.targetSpeedKmh,
                  targetDurationSeconds: w.targetDurationSeconds,
                  workoutType: w.workoutType,
                  intensity: w.intensity,
                  trackSurface: w.trackSurface,
                  jockeyName: w.jockeyName,
                  trainerNotes: w.trainerNotes,
                  status: blocked ? WorkoutStatus.BLOCKED : WorkoutStatus.SCHEDULED,
                  statusReason: blocked ? 'Ngựa đang bị Khóa huấn luyện y tế' : null,
                };
              }),
          },
        }),
      },
      include: PLAN_INCLUDE,
    });

    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'CLONE_TRAINING_PLAN',
      `Cloned training plan "${source.phaseName}" to horse ${horse.name}`,
      plan.id,
      { entityName: 'TrainingPlan', newValues: { sourcePlanId: source.id, horseId: horse.id } },
    );
    return plan;
  }

  // ---------------------------------------------------------------- Buổi tập

  /**
   * Kiểm tra DL-2.01 theo thứ tự ưu tiên của đặc tả. Gọi trong transaction đã khóa dòng ngựa.
   * - Ném lỗi khi bị chặn (1-5).
   * - Trả về medicalOverride (HT xếp bài nặng lúc ngựa ở trạng thái y tế, đã xác nhận)
   *   và warnings (6: chỉ cảnh báo, HT bấm Lưu lần 2 để xác nhận).
   */
  private async assertWorkoutAllowed(
    tx: Tx,
    plan: PlanForCheck,
    w: WorkoutDraft,
    excludeWorkoutId?: string,
  ): Promise<{ medicalOverride: boolean; warnings: string[] }> {
    if (plan.status !== PlanStatus.DRAFT && plan.status !== PlanStatus.ACTIVE) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'PLAN_CLOSED',
        'Giáo án đã hoàn thành hoặc đã hủy nên không xếp thêm buổi tập.',
      );
    }
    const horse = await tx.horse.findUnique({ where: { id: plan.horseId } });
    if (!horse || horse.deletedAt) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Target horse not found.');
    }
    const heavy = isHeavy(w.workoutType, w.intensity);

    // 1. Khóa y tế + bài nặng: chặn, không vai trò nào vượt qua (RULE-MED-01).
    if (horse.isMedicalLocked && heavy) {
      throw apiError(
        HttpStatus.CONFLICT,
        'MEDICAL_LOCK_ACTIVE',
        'Ngựa đang bị Khóa huấn luyện y tế. Không thể xếp bài tập nặng.',
      );
    }
    // 2. Ngựa ngừng quản lý.
    if (horse.status === HorseStatus.RETIRED) {
      throw apiError(HttpStatus.BAD_REQUEST, 'HORSE_RETIRED', 'Ngựa đã ngừng quản lý.');
    }

    // Kiểm tra ô nhập phụ thuộc nhau (DTO không tự kiểm được).
    if (w.scheduledDate < startOfClubDay(new Date())) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'DATE_IN_PAST',
        'Không thể xếp buổi tập vào ngày đã qua.',
      );
    }
    if (!withinTrainingHours(w.scheduledDate)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'OUTSIDE_TRAINING_HOURS',
        'Giờ bắt đầu phải từ 04:00 đến 20:00.',
      );
    }
    if (
      w.scheduledDate < startOfClubDay(plan.startDate) ||
      w.scheduledDate >= addDays(startOfClubDay(plan.endDate), 1)
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'OUTSIDE_PLAN_DATES',
        'Ngày tập phải nằm trong thời gian của giáo án.',
      );
    }
    // Giai đoạn: giáo án có giai đoạn thì buổi tập phải thuộc một giai đoạn và nằm trong ngày của nó.
    const phases = phasesOf(plan);
    const phase = phases.find((p) => p.id === w.phaseId);
    if (phases.length > 0) {
      if (!phase) {
        throw apiError(HttpStatus.BAD_REQUEST, 'PHASE_REQUIRED', 'Vui lòng chọn giai đoạn.');
      }
      const day = clubDate(w.scheduledDate);
      if (day < phase.startDate || day > phase.endDate) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'OUTSIDE_PHASE_DATES',
          `Ngày tập phải nằm trong giai đoạn ${phase.name} (${phase.startDate} – ${phase.endDate}).`,
        );
      }
    }
    if (['BREEZE', 'TRIAL'].includes(w.workoutType)) {
      if (w.targetSpeedKmh == null) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'TARGET_SPEED_REQUIRED',
          'Tốc độ mục tiêu là bắt buộc với bài chạy tốc độ và chạy thử.',
        );
      }
      if (!w.jockeyName) {
        throw apiError(HttpStatus.BAD_REQUEST, 'JOCKEY_REQUIRED', 'Vui lòng nhập tên nài ngựa.');
      }
    }
    const groom = await tx.user.findUnique({ where: { id: w.assignedStaffUserId } });
    if (!groom || groom.role !== Role.GROOM || groom.status !== UserStatus.ACTIVE) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_GROOM',
        'Vui lòng chọn nhân viên chăm sóc đang hoạt động.',
      );
    }

    const notSelf = excludeWorkoutId ? { id: { not: excludeWorkoutId } } : {};
    const live = { ...notSelf, status: { not: WorkoutStatus.CANCELLED } };

    // 3. Chạy thử trùng mặt sân trong cùng khung 15 phút.
    if (w.workoutType === 'TRIAL') {
      const slot = TRIAL_SLOT_MINUTES * 60 * 1000;
      const clash = await tx.workoutSession.findFirst({
        where: {
          ...live,
          workoutType: 'TRIAL',
          trackSurface: w.trackSurface,
          scheduledDate: {
            gt: new Date(w.scheduledDate.getTime() - slot),
            lt: new Date(w.scheduledDate.getTime() + slot),
          },
        },
        include: { horse: { select: { name: true } } },
      });
      if (clash) {
        throw apiError(
          HttpStatus.CONFLICT,
          'TRIAL_SLOT_TAKEN',
          `Mặt sân ${w.trackSurface} đã có lượt chạy thử của ${clash.horse.name} trong khung 15 phút này.`,
          { workoutId: clash.id },
        );
      }
    }

    // 4. Tối đa 3 buổi mỗi ngày cho 1 ngựa.
    const dayStart = startOfClubDay(w.scheduledDate);
    const sameDay = await tx.workoutSession.count({
      where: {
        ...live,
        horseId: plan.horseId,
        scheduledDate: { gte: dayStart, lt: addDays(dayStart, 1) },
      },
    });
    if (sameDay >= MAX_WORKOUTS_PER_DAY) {
      throw apiError(
        HttpStatus.CONFLICT,
        'MAX_WORKOUTS_PER_DAY',
        'Mỗi ngựa tối đa 3 buổi tập mỗi ngày.',
      );
    }

    // 5. Ngựa ở trạng thái y tế (không khóa) + bài nặng: HT phải xác nhận (DL-2.06).
    const medical = MEDICAL_STATUSES.includes(horse.status) && heavy;
    if (medical && !w.vetConsulted) {
      throw apiError(
        HttpStatus.CONFLICT,
        'VET_CONFIRMATION_REQUIRED',
        `Ngựa đang ở trạng thái ${horse.status}. Bài tập nặng có thể ảnh hưởng tới hồi phục.`,
        { horseStatus: horse.status },
      );
    }

    // 6. Cảnh báo (không chặn).
    const warnings: string[] = [];
    if (phase) {
      const weekStart = startOfClubWeek(w.scheduledDate);
      const week = await tx.workoutSession.findMany({
        where: {
          ...live,
          horseId: plan.horseId,
          scheduledDate: { gte: weekStart, lt: addDays(weekStart, 7) },
        },
        select: { distanceMeters: true, repetitions: true },
      });
      const total =
        week.reduce((sum, x) => sum + x.distanceMeters * x.repetitions, 0) +
        w.distanceMeters * w.repetitions;
      if (total > phase.maxWeeklyDistance) {
        warnings.push(`Tổng cự ly tuần ${total} m vượt định mức ${phase.maxWeeklyDistance} m.`);
      }
    }
    if (heavy) {
      const gap = HEAVY_GAP_HOURS * 60 * 60 * 1000;
      const near = await tx.workoutSession.findMany({
        where: {
          ...live,
          horseId: plan.horseId,
          scheduledDate: {
            gt: new Date(w.scheduledDate.getTime() - gap),
            lt: new Date(w.scheduledDate.getTime() + gap),
          },
        },
        select: { scheduledDate: true, workoutType: true, intensity: true },
      });
      const other = near.find((x) => isHeavy(x.workoutType, x.intensity));
      if (other) {
        warnings.push(
          `Ngựa có bài tập nặng khác lúc ${clubDate(other.scheduledDate)}, cách chưa đủ 48 giờ.`,
        );
      }
    }
    const overlap = GROOM_OVERLAP_MINUTES * 60 * 1000;
    const busy = await tx.workoutSession.findFirst({
      where: {
        ...live,
        assignedStaffUserId: w.assignedStaffUserId,
        scheduledDate: {
          gt: new Date(w.scheduledDate.getTime() - overlap),
          lt: new Date(w.scheduledDate.getTime() + overlap),
        },
      },
    });
    if (busy) {
      warnings.push(`Nhân viên ${groom.fullName} đã có buổi tập trùng giờ.`);
    }

    return { medicalOverride: medical, warnings };
  }

  /** Cảnh báo chưa được HT xác nhận -> trả 409 kèm danh sách để FE hiện khung vàng. */
  private assertWarningsAcknowledged(warnings: string[], acknowledged?: boolean) {
    if (warnings.length > 0 && !acknowledged) {
      throw apiError(HttpStatus.CONFLICT, 'WARNINGS_NEED_CONFIRMATION', warnings.join(' '), {
        warnings,
      });
    }
  }

  private draftFrom(dto: CreateWorkoutSessionDto, scheduledDate = new Date(dto.scheduledDate)) {
    return {
      scheduledDate,
      phaseId: dto.phaseId,
      workoutType: dto.workoutType,
      intensity: effectiveIntensity(dto.workoutType, dto.intensity),
      trackSurface: effectiveSurface(dto.workoutType, dto.trackSurface),
      distanceMeters: dto.distanceMeters,
      repetitions: dto.repetitions ?? 1,
      targetSpeedKmh: dto.targetSpeedKmh,
      jockeyName: dto.jockeyName,
      assignedStaffUserId: dto.assignedStaffUserId,
      vetConsulted: dto.vetConsulted,
    } satisfies WorkoutDraft;
  }

  private createData(
    plan: { id: string; horseId: string },
    draft: WorkoutDraft,
    dto: CreateWorkoutSessionDto,
    medicalOverride: boolean,
  ): Prisma.WorkoutSessionUncheckedCreateInput {
    return {
      trainingPlanId: plan.id,
      horseId: plan.horseId,
      phaseId: draft.phaseId,
      scheduledDate: draft.scheduledDate,
      workoutType: draft.workoutType,
      intensity: draft.intensity,
      trackSurface: draft.trackSurface,
      distanceMeters: draft.distanceMeters,
      repetitions: draft.repetitions,
      targetSpeedKmh: draft.targetSpeedKmh,
      jockeyName: draft.jockeyName,
      assignedStaffUserId: draft.assignedStaffUserId,
      trainerNotes: dto.trainerNotes,
      status: WorkoutStatus.SCHEDULED,
      medicalOverride,
    };
  }

  /** DL-2.01 Thêm buổi tập vào giáo án Nháp / Đang áp dụng (HT). */
  async createWorkout(planId: string, dto: CreateWorkoutSessionDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.trainingPlan.findUnique({ where: { id: planId } });
      if (!plan) {
        throw apiError(HttpStatus.NOT_FOUND, 'PLAN_NOT_FOUND', 'Training plan not found.');
      }
      await tx.$queryRaw`SELECT "id" FROM "TrainingPlan" WHERE "id" = ${planId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id" = ${plan.horseId} FOR UPDATE`;

      const draft = this.draftFrom(dto);
      const { medicalOverride, warnings } = await this.assertWorkoutAllowed(tx, plan, draft);
      this.assertWarningsAcknowledged(warnings, dto.acknowledgeWarnings);

      const session = await tx.workoutSession.create({
        data: this.createData(plan, draft, dto, medicalOverride),
        include: WORKOUT_INCLUDE,
      });

      await this.auditService.record(
        { id: user.userId, name: user.fullName || user.email },
        'CREATE_WORKOUT_SESSION',
        `Scheduled ${session.workoutType} (${session.distanceMeters}m) for plan "${plan.phaseName}"`,
        session.id,
        { entityName: 'WorkoutSession', newValues: { medicalOverride, warnings } },
        tx,
      );
      return session;
    });
  }

  /**
   * DL-2.01 "Lặp lại hằng tuần": tạo buổi cùng giờ vào các thứ đã chọn tới ngày "Lặp đến".
   * Ngày vướng kiểm tra 1-4 thì bỏ qua và báo lại; cảnh báo (6) không chặn khi lặp.
   */
  async createRepeatWorkouts(planId: string, dto: RepeatWorkoutDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.trainingPlan.findUnique({ where: { id: planId } });
      if (!plan) {
        throw apiError(HttpStatus.NOT_FOUND, 'PLAN_NOT_FOUND', 'Training plan not found.');
      }
      await tx.$queryRaw`SELECT "id" FROM "TrainingPlan" WHERE "id" = ${planId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id" = ${plan.horseId} FOR UPDATE`;

      const first = new Date(dto.scheduledDate);
      const timeOfDay = first.getTime() - startOfClubDay(first).getTime();
      const until = dto.until.slice(0, 10);
      const phase = phasesOf(plan).find((p) => p.id === dto.phaseId);
      if (phase && until > phase.endDate) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'REPEAT_BEYOND_PHASE',
          'Lặp đến ngày không được sau ngày kết thúc giai đoạn.',
        );
      }

      const dates: Date[] = [];
      for (let day = startOfClubDay(first); clubDate(day) <= until; day = addDays(day, 1)) {
        const weekday = new Date(day.getTime() + 7 * 60 * 60 * 1000).getUTCDay() || 7; // 1..7
        if (dto.weekdays.includes(weekday)) dates.push(new Date(day.getTime() + timeOfDay));
      }
      if (dates.length === 0) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'NO_REPEAT_DATES',
          'Không có ngày nào khớp các thứ đã chọn.',
        );
      }
      if (dates.length > MAX_REPEAT_WORKOUTS) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'TOO_MANY_REPEATS',
          'Mỗi lần chỉ tạo tối đa 60 buổi tập.',
        );
      }

      const skippable = [
        'MEDICAL_LOCK_ACTIVE',
        'HORSE_RETIRED',
        'TRIAL_SLOT_TAKEN',
        'MAX_WORKOUTS_PER_DAY',
        'DATE_IN_PAST',
        'OUTSIDE_PHASE_DATES',
        'OUTSIDE_PLAN_DATES',
      ];
      const created: string[] = [];
      const skipped: { date: string; reason: string }[] = [];
      const allWarnings: { date: string; warnings: string[] }[] = [];
      for (const date of dates) {
        const draft = this.draftFrom(dto, date);
        try {
          const { medicalOverride, warnings } = await this.assertWorkoutAllowed(tx, plan, draft);
          if (warnings && warnings.length > 0) {
            allWarnings.push({ date: clubDate(date), warnings });
          }
          const row = await tx.workoutSession.create({
            data: this.createData(plan, draft, dto, medicalOverride),
          });
          created.push(row.id);
        } catch (e: any) {
          const body = typeof e?.getResponse === 'function' ? e.getResponse() : null;
          if (!body || !skippable.includes(body.code)) throw e;
          skipped.push({ date: clubDate(date), reason: body.message });
        }
      }

      await this.auditService.record(
        { id: user.userId, name: user.fullName || user.email },
        'CREATE_WORKOUT_SERIES',
        `Scheduled ${created.length} weekly workouts for plan "${plan.phaseName}" (${skipped.length} skipped)`,
        plan.id,
        {
          entityName: 'TrainingPlan',
          newValues: { created: created.length, skipped, warnings: allWarnings },
        },
        tx,
      );
      return { created: created.length, workoutIds: created, skipped, warnings: allWarnings };
    });
  }

  /** Sửa buổi tập Đã lên lịch chưa tới giờ (BTN-2.20): gộp với dữ liệu cũ rồi kiểm lại DL-2.01. */
  async updateWorkout(workoutId: string, dto: UpdateWorkoutSessionDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.workoutSession.findUnique({
        where: { id: workoutId },
        include: { trainingPlan: true },
      });
      if (!existing) {
        throw apiError(HttpStatus.NOT_FOUND, 'WORKOUT_NOT_FOUND', 'Workout session not found.');
      }
      if (existing.status !== WorkoutStatus.SCHEDULED || existing.scheduledDate <= new Date()) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'WORKOUT_NOT_EDITABLE',
          'Chỉ sửa được buổi tập Đã lên lịch và chưa tới giờ bắt đầu.',
        );
      }
      await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id" = ${existing.horseId} FOR UPDATE`;

      const workoutType = dto.workoutType ?? existing.workoutType ?? 'CANTER';
      const draft: WorkoutDraft = {
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : existing.scheduledDate,
        phaseId: dto.phaseId ?? existing.phaseId,
        workoutType,
        intensity: effectiveIntensity(workoutType, dto.intensity ?? existing.intensity ?? 'MEDIUM'),
        trackSurface: effectiveSurface(
          workoutType,
          dto.trackSurface ?? existing.trackSurface ?? 'TURF',
        ),
        distanceMeters: dto.distanceMeters ?? existing.distanceMeters,
        repetitions: dto.repetitions ?? existing.repetitions,
        targetSpeedKmh: dto.targetSpeedKmh ?? existing.targetSpeedKmh,
        jockeyName: dto.jockeyName ?? existing.jockeyName,
        assignedStaffUserId: dto.assignedStaffUserId ?? existing.assignedStaffUserId ?? '',
        vetConsulted: dto.vetConsulted ?? existing.medicalOverride,
      };
      const { medicalOverride, warnings } = await this.assertWorkoutAllowed(
        tx,
        existing.trainingPlan,
        draft,
        workoutId,
      );
      this.assertWarningsAcknowledged(warnings, dto.acknowledgeWarnings);

      const updated = await tx.workoutSession.update({
        where: { id: workoutId },
        data: {
          scheduledDate: draft.scheduledDate,
          phaseId: draft.phaseId,
          workoutType: draft.workoutType,
          intensity: draft.intensity,
          trackSurface: draft.trackSurface,
          distanceMeters: draft.distanceMeters,
          repetitions: draft.repetitions,
          targetSpeedKmh: draft.targetSpeedKmh,
          jockeyName: draft.jockeyName,
          assignedStaffUserId: draft.assignedStaffUserId,
          medicalOverride,
          ...(dto.trainerNotes !== undefined && { trainerNotes: dto.trainerNotes }),
        },
        include: WORKOUT_INCLUDE,
      });

      await this.auditService.record(
        { id: user.userId, name: user.fullName || user.email },
        'UPDATE_WORKOUT_SESSION',
        `Updated workout session (${workoutId})`,
        workoutId,
        { entityName: 'WorkoutSession' },
        tx,
      );
      return updated;
    });
  }

  /**
   * SC-2.06 Ghi kết quả (HT): buổi Đã lên lịch đã tới giờ, buổi Bỏ lỡ trong 7 ngày,
   * hoặc sửa kết quả trong 48 giờ sau lần lưu đầu. Có dấu hiệu bất thường -> cảnh báo cho VET.
   */
  async recordResult(workoutId: string, dto: RecordWorkoutResultDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.workoutSession.findUnique({ where: { id: workoutId } });
      if (!existing) {
        throw apiError(HttpStatus.NOT_FOUND, 'WORKOUT_NOT_FOUND', 'Workout session not found.');
      }
      await tx.$queryRaw`SELECT "id" FROM "WorkoutSession" WHERE "id" = ${workoutId} FOR UPDATE`;
      const now = new Date();
      const editing = existing.status === WorkoutStatus.COMPLETED;

      if (existing.status === WorkoutStatus.SCHEDULED) {
        if (existing.scheduledDate > now) {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            'WORKOUT_NOT_STARTED',
            'Buổi tập chưa đến giờ bắt đầu.',
          );
        }
      } else if (existing.status === WorkoutStatus.MISSED) {
        const deadline = addDays(startOfClubDay(existing.scheduledDate), LATE_RESULT_DAYS + 1);
        if (now >= deadline) {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            'LATE_RESULT_EXPIRED',
            'Đã quá 7 ngày, không thể ghi kết quả cho buổi tập bỏ lỡ.',
          );
        }
      } else if (editing) {
        const first = existing.resultRecordedAt ?? existing.updatedAt;
        if (now.getTime() - first.getTime() > RESULT_EDIT_HOURS * 60 * 60 * 1000) {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            'RESULT_EDIT_EXPIRED',
            'Chỉ sửa được kết quả trong 48 giờ sau khi ghi.',
          );
        }
      } else {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'WORKOUT_NOT_RECORDABLE',
          'Buổi tập bị chặn hoặc đã hủy nên không ghi kết quả.',
        );
      }

      if (dto.actualTimeSeconds == null && !NO_TIME_TYPES.includes(existing.workoutType ?? '')) {
        throw apiError(HttpStatus.BAD_REQUEST, 'TIME_REQUIRED', 'Thời gian chạy là bắt buộc.');
      }
      if (
        dto.heartRatePeak != null &&
        dto.heartRateRecovery != null &&
        dto.heartRateRecovery > dto.heartRatePeak
      ) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'RECOVERY_ABOVE_PEAK',
          'Nhịp tim sau 10 phút không được lớn hơn nhịp tim tối đa.',
        );
      }
      const signs = [...new Set(dto.abnormalSignTypes ?? [])];
      if (signs.length > 0 && !dto.abnormalNotes) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'ABNORMAL_NOTES_REQUIRED',
          'Vui lòng mô tả dấu hiệu bất thường.',
        );
      }
      const averageSpeedKmh = dto.actualTimeSeconds
        ? Math.round((dto.actualDistanceMeters / dto.actualTimeSeconds) * 3.6 * 10) / 10
        : null;
      const abnormal = signs.length > 0;

      const updated = await tx.workoutSession.update({
        where: { id: workoutId },
        data: {
          status: WorkoutStatus.COMPLETED,
          actualDistanceMeters: dto.actualDistanceMeters,
          actualTimeSeconds: dto.actualTimeSeconds ?? null,
          averageSpeedKmh,
          actualSurface: dto.actualSurface ?? existing.trackSurface,
          trackCondition: dto.trackCondition ?? null,
          heartRatePeak: dto.heartRatePeak ?? null,
          heartRateRecovery: dto.heartRateRecovery ?? null,
          topSpeedKmh: dto.topSpeedKmh ?? null,
          performanceScore: dto.performanceScore,
          completionLevel: dto.completionLevel,
          resultNotes: dto.trainerNotes.trim(),
          abnormalSignTypes: signs,
          abnormalSigns: abnormal,
          abnormalNotes: abnormal ? dto.abnormalNotes : null,
          // Dấu hiệu mới xuất hiện hoặc thay đổi khi sửa -> VET phải xem lại (Bug #60).
          ...(abnormal &&
            (!existing.abnormalSigns ||
              JSON.stringify(signs.slice().sort()) !==
                JSON.stringify(
                  ((existing.abnormalSignTypes as string[]) || []).slice().sort(),
                )) && {
              vetAcknowledgedAt: null,
              vetNotes: null,
            }),
          ...(editing
            ? { resultUpdatedAt: now, resultUpdatedById: user.userId }
            : { resultRecordedAt: now, resultRecordedById: user.userId }),
        },
        include: WORKOUT_INCLUDE,
      });

      await this.auditService.record(
        { id: user.userId, name: user.fullName || user.email },
        editing ? 'UPDATE_WORKOUT_RESULT' : 'RECORD_WORKOUT_RESULT',
        `${editing ? 'Edited' : 'Recorded'} result for workout ${workoutId}${abnormal ? ' (abnormal signs reported)' : ''}`,
        workoutId,
        { entityName: 'WorkoutSession', newValues: { abnormalSigns: abnormal, signs } },
        tx,
      );
      return updated;
    });
  }

  /** DL-2.05 Hủy buổi tập Đã lên lịch / Bị chặn / Bỏ lỡ (HT). */
  async cancelWorkout(workoutId: string, dto: CancelWorkoutDto, user: CurrentUserPayload) {
    const existing = await this.prisma.workoutSession.findUnique({ where: { id: workoutId } });
    if (!existing) {
      throw apiError(HttpStatus.NOT_FOUND, 'WORKOUT_NOT_FOUND', 'Workout session not found.');
    }
    if (!PENDING_WORKOUT_STATUSES.includes(existing.status)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'WORKOUT_NOT_CANCELLABLE',
        'Buổi tập đã hoàn thành hoặc đã hủy.',
      );
    }
    if (dto.reason === 'OTHER' && !dto.note) {
      throw apiError(HttpStatus.BAD_REQUEST, 'NOTE_REQUIRED', 'Ghi chú phải từ 10 đến 500 ký tự.');
    }
    const reason = [CANCEL_REASON_LABEL[dto.reason], dto.note].filter(Boolean).join(': ');

    const updated = await this.prisma.workoutSession.update({
      where: { id: workoutId },
      data: { status: WorkoutStatus.CANCELLED, statusReason: reason },
      include: WORKOUT_INCLUDE,
    });
    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'CANCEL_WORKOUT_SESSION',
      `Cancelled workout ${workoutId}. Reason: ${reason}`,
      workoutId,
      { entityName: 'WorkoutSession', oldValues: { status: existing.status } },
    );
    return updated;
  }

  /** DL-2.07 Khôi phục buổi bị chặn sau khi gỡ Khóa y tế (HT), áp lại toàn bộ kiểm tra DL-2.01. */
  async restoreWorkout(workoutId: string, dto: RestoreWorkoutDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.workoutSession.findUnique({
        where: { id: workoutId },
        include: { trainingPlan: true },
      });
      if (!existing) {
        throw apiError(HttpStatus.NOT_FOUND, 'WORKOUT_NOT_FOUND', 'Workout session not found.');
      }
      if (existing.status !== WorkoutStatus.BLOCKED) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'WORKOUT_NOT_BLOCKED',
          'Chỉ khôi phục được buổi tập Bị chặn.',
        );
      }
      await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id" = ${existing.horseId} FOR UPDATE`;

      const workoutType = existing.workoutType ?? 'CANTER';
      const draft: WorkoutDraft = {
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : existing.scheduledDate,
        phaseId: existing.phaseId,
        workoutType,
        intensity: existing.intensity ?? 'MEDIUM',
        trackSurface: existing.trackSurface ?? 'TURF',
        distanceMeters: existing.distanceMeters,
        repetitions: existing.repetitions,
        targetSpeedKmh: existing.targetSpeedKmh,
        jockeyName: existing.jockeyName,
        assignedStaffUserId: existing.assignedStaffUserId ?? '',
        vetConsulted: existing.medicalOverride,
      };
      await this.assertWorkoutAllowed(tx, existing.trainingPlan, draft, workoutId);

      const restored = await tx.workoutSession.update({
        where: { id: workoutId },
        data: {
          status: WorkoutStatus.SCHEDULED,
          scheduledDate: draft.scheduledDate,
          statusReason: null,
        },
        include: WORKOUT_INCLUDE,
      });
      await this.auditService.record(
        { id: user.userId, name: user.fullName || user.email },
        'RESTORE_WORKOUT_SESSION',
        `Restored blocked workout ${workoutId}`,
        workoutId,
        { entityName: 'WorkoutSession' },
        tx,
      );
      return restored;
    });
  }

  /**
   * Lịch tập (SC-2.05) và các danh sách buổi tập. OWNER: ngựa sở hữu; GROOM: buổi được giao
   * và không thấy điểm phong độ (Q-2.09).
   */
  async findAllWorkouts(
    query: {
      planId?: string;
      horseId?: string;
      date?: string;
      from?: string;
      to?: string;
      status?: WorkoutStatus;
      workoutType?: string;
    },
    user: CurrentUserPayload,
  ) {
    await this.sweepOverdue();
    const where: Prisma.WorkoutSessionWhereInput = { horse: { deletedAt: null } };

    if (query.planId) where.trainingPlanId = query.planId;
    if (query.horseId) where.horseId = query.horseId;
    if (query.status) where.status = query.status;
    if (query.workoutType) where.workoutType = query.workoutType;
    if (query.date && !isNaN(new Date(query.date).getTime())) {
      const start = startOfClubDay(new Date(query.date));
      where.scheduledDate = { gte: start, lt: addDays(start, 1) };
    } else if (query.from || query.to) {
      where.scheduledDate = {
        ...(query.from &&
          !isNaN(new Date(query.from).getTime()) && { gte: startOfClubDay(new Date(query.from)) }),
        ...(query.to &&
          !isNaN(new Date(query.to).getTime()) && {
            lt: addDays(startOfClubDay(new Date(query.to)), 1),
          }),
      };
    }

    if (user.role === UserRole.HORSE_OWNER) {
      where.horse = { deletedAt: null, ownerId: user.userId };
    } else if (user.role === UserRole.GROOM) {
      where.assignedStaffUserId = user.userId;
    }

    const rows = await this.prisma.workoutSession.findMany({
      where,
      orderBy: { scheduledDate: 'asc' },
      take: 200,
      include: WORKOUT_INCLUDE,
    });
    return rows.map((r) => hideScoreForGroom(r, user));
  }

  /** Chi tiết buổi tập; ngoài phạm vi -> 404. */
  async findWorkoutById(id: string, user: CurrentUserPayload) {
    const workout = await this.prisma.workoutSession.findUnique({
      where: { id },
      include: WORKOUT_INCLUDE,
    });
    const outOfScope =
      !workout ||
      (user.role === UserRole.HORSE_OWNER && workout.horse.ownerId !== user.userId) ||
      (user.role === UserRole.GROOM && workout.assignedStaffUserId !== user.userId);
    if (outOfScope) {
      throw apiError(HttpStatus.NOT_FOUND, 'WORKOUT_NOT_FOUND', 'Workout session not found.');
    }
    return hideScoreForGroom(workout, user);
  }

  /** Lượt chạy thử (tab của SC-2.05): buổi tập loại TRIAL, sắp theo giờ. */
  async findTrialRuns(query: { from?: string; to?: string }, user: CurrentUserPayload) {
    return this.findAllWorkouts({ ...query, workoutType: 'TRIAL' }, user);
  }

  /** Nhân viên chăm sóc đang hoạt động, để HT chọn khi xếp buổi tập. */
  async findGrooms() {
    return this.prisma.user.findMany({
      where: { role: Role.GROOM, status: UserStatus.ACTIVE },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: 'asc' },
    });
  }

  // ---------------------------------------------------------------- Cảnh báo (FR-2.14)

  /** Buổi tập có dấu hiệu bất thường, mới nhất trước (HT, VET). */
  async findAlerts() {
    return this.prisma.workoutSession.findMany({
      where: { abnormalSigns: true, horse: { deletedAt: null } },
      orderBy: { resultRecordedAt: 'desc' },
      include: WORKOUT_INCLUDE,
    });
  }

  /** VET ghi nhận cảnh báo. */
  async acknowledgeAlert(workoutId: string, dto: AcknowledgeAlertDto, user: CurrentUserPayload) {
    const existing = await this.prisma.workoutSession.findUnique({ where: { id: workoutId } });
    if (!existing || !existing.abnormalSigns) {
      throw apiError(HttpStatus.NOT_FOUND, 'ALERT_NOT_FOUND', 'Training alert not found.');
    }
    const updated = await this.prisma.workoutSession.update({
      where: { id: workoutId },
      data: { vetAcknowledgedAt: new Date(), vetNotes: dto.vetNotes.trim() },
      include: WORKOUT_INCLUDE,
    });
    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'ACKNOWLEDGE_TRAINING_ALERT',
      `Veterinarian acknowledged abnormal signs on workout ${workoutId}`,
      workoutId,
      { entityName: 'WorkoutSession' },
    );
    return updated;
  }

  /**
   * SC-2.07 Biểu đồ thể lực: điểm cho mỗi buổi Hoàn thành trong `weeks` tuần gần nhất, tải theo tuần,
   * các khoảng bị Khóa huấn luyện (vẽ dải nền) và 4 thẻ số liệu. Không có buổi nào -> mảng rỗng.
   */
  async getFitnessMetrics(horseId: string, user: CurrentUserPayload, weeks = 12) {
    const horse = await this.prisma.horse.findUnique({
      where: { id: horseId, deletedAt: null },
      select: {
        id: true,
        name: true,
        horseCode: true,
        status: true,
        isMedicalLocked: true,
        ownerId: true,
      },
    });
    if (!horse || (user.role === UserRole.HORSE_OWNER && horse.ownerId !== user.userId)) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Target horse not found.');
    }

    const now = new Date();
    const today = startOfClubDay(now);
    const rangeStart = addDays(today, -weeks * 7);
    const loadStart = addDays(today, -35); // 7 ngày + 4 tuần trước đó
    const [workouts, locks] = await Promise.all([
      this.prisma.workoutSession.findMany({
        where: {
          horseId,
          status: WorkoutStatus.COMPLETED,
          scheduledDate: { gte: rangeStart < loadStart ? rangeStart : loadStart, lte: now },
        },
        orderBy: { scheduledDate: 'asc' },
      }),
      this.prisma.medicalLock.findMany({
        where: { horseId, OR: [{ unlockedAt: null }, { unlockedAt: { gte: rangeStart } }] },
        select: { lockedAt: true, unlockedAt: true },
        orderBy: { lockedAt: 'asc' },
      }),
    ]);

    const points = workouts
      .filter((w) => w.scheduledDate >= rangeStart)
      .map((w) => ({
        workoutId: w.id,
        date: w.scheduledDate.toISOString(),
        workoutType: w.workoutType,
        distanceMeters: w.actualDistanceMeters ?? w.distanceMeters * w.repetitions,
        timeSeconds: w.actualTimeSeconds,
        avgSpeedKmh: SPEED_TYPES.includes(w.workoutType ?? '') ? w.averageSpeedKmh : null,
        maxHeartRate: w.heartRatePeak,
        recoveryHeartRate: w.heartRateRecovery,
        performanceScore: user.role === UserRole.GROOM ? null : w.performanceScore,
        load: workoutLoad(w),
        hasAlert: w.abnormalSigns,
      }));

    const weekly = new Map<string, number>();
    for (const p of points) {
      const key = clubDate(startOfClubWeek(new Date(p.date)));
      weekly.set(key, Math.round(((weekly.get(key) ?? 0) + p.load) * 10) / 10);
    }

    const load7d = this.sumLoad(workouts, addDays(now, -7), now);
    const avg4w = this.sumLoad(workouts, loadStart, addDays(now, -7)) / 4;
    const last4 = points.slice(-4);
    const avg = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => x != null);
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
    };
    const best = points.reduce<{ value: number; date: string } | null>(
      (m, p) =>
        p.avgSpeedKmh != null && (!m || p.avgSpeedKmh > m.value)
          ? { value: p.avgSpeedKmh, date: p.date }
          : m,
      null,
    );

    return {
      horse,
      points,
      weeklyLoad: [...weekly.entries()].map(([weekStart, load]) => ({ weekStart, load })),
      lockPeriods: locks.map((l) => ({
        from: l.lockedAt.toISOString(),
        to: l.unlockedAt ? l.unlockedAt.toISOString() : null,
      })),
      summary: {
        bestAvgSpeed: best,
        avgScoreLast4:
          user.role === UserRole.GROOM ? null : avg(last4.map((p) => p.performanceScore)),
        avgRecoveryLast4: avg(last4.map((p) => p.recoveryHeartRate)),
        load7d,
        loadChangePct: avg4w > 0 ? Math.round(((load7d - avg4w) / avg4w) * 100) : null,
      },
    };
  }

  private sumLoad(
    rows: {
      scheduledDate: Date;
      distanceMeters: number;
      actualDistanceMeters: number | null;
      repetitions: number;
      intensity: string | null;
    }[],
    from: Date,
    to: Date,
  ): number {
    const total = rows
      .filter((w) => w.scheduledDate > from && w.scheduledDate <= to)
      .reduce((sum, w) => sum + workoutLoad(w), 0);
    return Math.round(total * 10) / 10;
  }

  /**
   * SC-2.01 Tổng quan huấn luyện (CM, HT, VET): 4 thẻ chỉ số và một dòng cho mỗi ngựa đang quản lý.
   * Tải 7 ngày "tăng đột ngột" khi > 130% trung bình tuần của 4 tuần trước (Q-2.10).
   */
  async getOverview() {
    await this.sweepOverdue();
    const now = new Date();
    const today = startOfClubDay(now);
    const horses = await this.prisma.horse.findMany({
      where: { deletedAt: null, status: { not: HorseStatus.RETIRED } },
      select: { id: true, name: true, horseCode: true, status: true, isMedicalLocked: true },
      orderBy: { name: 'asc' },
    });
    const horseIds = horses.map((h) => h.id);
    const [plans, recent, upcoming, todayRows, blocked] = await Promise.all([
      this.prisma.trainingPlan.findMany({
        where: { horseId: { in: horseIds }, status: PlanStatus.ACTIVE },
        select: { id: true, horseId: true, planCode: true, phaseName: true, phases: true },
      }),
      this.prisma.workoutSession.findMany({
        where: {
          horseId: { in: horseIds },
          status: WorkoutStatus.COMPLETED,
          scheduledDate: { gte: addDays(today, -60), lte: now },
        },
        orderBy: { scheduledDate: 'asc' },
      }),
      this.prisma.workoutSession.findMany({
        where: {
          horseId: { in: horseIds },
          status: WorkoutStatus.SCHEDULED,
          scheduledDate: { gte: now },
        },
        orderBy: { scheduledDate: 'asc' },
        select: { horseId: true, scheduledDate: true, workoutType: true },
      }),
      this.prisma.workoutSession.groupBy({
        by: ['status'],
        where: {
          horseId: { in: horseIds },
          scheduledDate: { gte: today, lt: addDays(today, 1) },
          status: { not: WorkoutStatus.CANCELLED },
        },
        _count: { _all: true },
      }),
      this.prisma.workoutSession.count({
        where: {
          horseId: { in: horseIds },
          status: WorkoutStatus.BLOCKED,
          scheduledDate: { gte: today, lt: addDays(today, 8) },
        },
      }),
    ]);
    const progress = await this.progressOf(plans.map((p) => p.id));
    const todayClub = clubDate(now);

    const rows = horses.map((horse) => {
      const plan = plans.find((p) => p.horseId === horse.id);
      const phase = plan
        ? phasesOf(plan).find((p) => p.startDate <= todayClub && todayClub <= p.endDate)
        : undefined;
      const mine = recent.filter((w) => w.horseId === horse.id);
      const scored = mine.filter((w) => w.performanceScore != null);
      const latest = scored[scored.length - 1];
      const prev3 = scored.slice(-4, -1).map((w) => w.performanceScore as number);
      const load7d = this.sumLoad(mine, addDays(now, -7), now);
      const avg4w = this.sumLoad(mine, addDays(today, -35), addDays(now, -7)) / 4;
      const next = upcoming.find((w) => w.horseId === horse.id);
      const dayMs = 24 * 60 * 60 * 1000;
      return {
        horse,
        plan: plan ? { id: plan.id, planCode: plan.planCode, name: plan.phaseName } : null,
        currentPhase: phase
          ? {
              name: phase.name,
              week:
                Math.floor((Date.parse(todayClub) - Date.parse(phase.startDate)) / (7 * dayMs)) + 1,
              weeks: Math.ceil(
                (Date.parse(phase.endDate) - Date.parse(phase.startDate) + dayMs) / (7 * dayMs),
              ),
            }
          : null,
        progress: plan ? (progress.get(plan.id) ?? { completed: 0, due: 0 }) : null,
        latestScore: latest?.performanceScore ?? null,
        previousAvgScore: prev3.length
          ? Math.round((prev3.reduce((a, b) => a + b, 0) / prev3.length) * 10) / 10
          : null,
        load7d,
        loadSpike: avg4w > 0 && load7d > avg4w * LOAD_SPIKE_RATIO,
        nextWorkout: next
          ? { date: next.scheduledDate.toISOString(), workoutType: next.workoutType }
          : null,
      };
    });

    const todayTotal = todayRows.reduce((sum, r) => sum + r._count._all, 0);
    const todayDone = todayRows
      .filter((r) => r.status === WorkoutStatus.COMPLETED)
      .reduce((sum, r) => sum + r._count._all, 0);

    return {
      kpis: {
        activePlans: plans.length,
        managedHorses: horses.length,
        todayCompleted: todayDone,
        todayTotal,
        blockedNext7Days: blocked,
        loadSpikeHorses: rows.filter((r) => r.loadSpike).length,
      },
      rows,
    };
  }
}
