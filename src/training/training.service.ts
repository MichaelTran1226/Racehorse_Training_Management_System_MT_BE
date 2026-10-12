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
import { apiError } from '../common/exceptions/api-error';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateTrainingPlanDto } from './dto/create-training-plan.dto';
import { UpdateTrainingPlanDto } from './dto/update-training-plan.dto';
import { QueryTrainingPlanDto } from './dto/query-training-plan.dto';
import { CreateWorkoutSessionDto } from './dto/create-workout-session.dto';
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
  effectiveIntensity,
  effectiveSurface,
  isHeavy,
  LATE_RESULT_DAYS,
  MAX_WORKOUTS_PER_DAY,
  PENDING_WORKOUT_STATUSES,
  startOfClubDay,
  TRIAL_SLOT_MINUTES,
  withinTrainingHours,
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
  horse: { select: { id: true, name: true, horseCode: true, isMedicalLocked: true, status: true } },
  assignedStaff: { select: { id: true, fullName: true } },
  trainingPlan: { select: { id: true, phaseName: true, status: true } },
} satisfies Prisma.WorkoutSessionInclude;

/** Dữ liệu buổi tập sau khi gộp bản cũ + thay đổi, dùng chung cho kiểm tra DL-2.01. */
interface WorkoutDraft {
  scheduledDate: Date;
  workoutType: string;
  intensity: string;
  trackSurface: string;
  targetSpeedKmh?: number | null;
  jockeyName?: string | null;
  assignedStaffUserId: string;
  vetConsulted?: boolean;
}

@Injectable()
export class TrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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
        { horse: { name: { contains: term, mode: 'insensitive' } } },
        { horse: { horseCode: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.trainingPlan.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: PLAN_INCLUDE,
      }),
      this.prisma.trainingPlan.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /** SC-2.04 Chi tiết giáo án kèm buổi tập. Ngoài phạm vi -> 404. */
  async findPlanById(id: string, user: CurrentUserPayload) {
    const plan = await this.prisma.trainingPlan.findUnique({
      where: { id },
      include: {
        ...PLAN_INCLUDE,
        workoutSessions: {
          orderBy: { scheduledDate: 'asc' },
          include: { assignedStaff: { select: { id: true, fullName: true, email: true } } },
        },
      },
    });

    const outOfScope =
      !plan || (user.role === UserRole.HORSE_OWNER && plan.horse.ownerId !== user.userId);
    if (outOfScope) {
      throw apiError(HttpStatus.NOT_FOUND, 'PLAN_NOT_FOUND', 'Training plan not found.');
    }
    return plan;
  }

  /** SC-2.03 Tạo giáo án: luôn ở Nháp; cần ≥ 1 giai đoạn; ngựa không Ngừng quản lý. */
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
    if (!Array.isArray(dto.phases) || dto.phases.length === 0) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'PHASES_REQUIRED',
        'Giáo án phải có ít nhất 1 giai đoạn.',
      );
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (startDate > endDate) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_DATE_RANGE',
        'Plan start date cannot be later than end date.',
      );
    }

    // Không tự đổi trạng thái ngựa ở đây: chỉ khi Kích hoạt và HT chọn (DL-2.02).
    const plan = await this.prisma.trainingPlan.create({
      data: {
        horseId: dto.horseId,
        trainerUserId: user.userId,
        phaseName: dto.phaseName,
        phases: dto.phases,
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
      `Created training plan "${plan.phaseName}" for horse ${plan.horse.name} (${plan.horse.horseCode})`,
      plan.id,
      {
        entityName: 'TrainingPlan',
        newValues: { phaseName: plan.phaseName, horseId: dto.horseId },
      },
    );

    return plan;
  }

  /** Sửa giáo án Nháp hoặc Đang áp dụng (FR-2.04). Trạng thái đổi qua changePlanStatus. */
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
    if (startDate > endDate) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_DATE_RANGE',
        'Start date cannot be after end date.',
      );
    }
    if (dto.phases !== undefined && (!Array.isArray(dto.phases) || dto.phases.length === 0)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'PHASES_REQUIRED',
        'Giáo án phải có ít nhất 1 giai đoạn.',
      );
    }

    const updated = await this.prisma.trainingPlan.update({
      where: { id },
      data: {
        ...(dto.phaseName && { phaseName: dto.phaseName }),
        ...(dto.phases !== undefined && { phases: dto.phases }),
        ...(dto.targetSpeed !== undefined && { targetSpeed: dto.targetSpeed }),
        ...(dto.targetDistance !== undefined && { targetDistance: dto.targetDistance }),
        ...(dto.trackSurface && { trackSurface: dto.trackSurface }),
        startDate,
        endDate,
      },
      include: PLAN_INCLUDE,
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
        newValues: { phaseName: updated.phaseName, startDate, endDate },
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
        phaseName: dto.name ?? `${source.phaseName} (bản sao)`,
        phases: source.phases ?? undefined,
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
   * Trả về medicalOverride = true khi HT xếp bài nặng lúc ngựa ở trạng thái y tế (đã xác nhận).
   */
  private async assertWorkoutAllowed(
    tx: Tx,
    plan: { id: string; status: PlanStatus; horseId: string; startDate: Date; endDate: Date },
    w: WorkoutDraft,
    excludeWorkoutId?: string,
  ): Promise<{ medicalOverride: boolean }> {
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

    // 3. Chạy thử trùng mặt sân trong cùng khung 15 phút.
    if (w.workoutType === 'TRIAL') {
      const slot = TRIAL_SLOT_MINUTES * 60 * 1000;
      const clash = await tx.workoutSession.findFirst({
        where: {
          ...notSelf,
          workoutType: 'TRIAL',
          trackSurface: w.trackSurface,
          status: { not: WorkoutStatus.CANCELLED },
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
        ...notSelf,
        horseId: plan.horseId,
        status: { not: WorkoutStatus.CANCELLED },
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
    return { medicalOverride: medical };
  }

  /** DL-2.01 Thêm buổi tập vào giáo án Nháp / Đang áp dụng (HT). */
  async createWorkout(planId: string, dto: CreateWorkoutSessionDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.trainingPlan.findUnique({ where: { id: planId } });
      if (!plan) {
        throw apiError(HttpStatus.NOT_FOUND, 'PLAN_NOT_FOUND', 'Training plan not found.');
      }
      await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id" = ${plan.horseId} FOR UPDATE`;

      const draft: WorkoutDraft = {
        scheduledDate: new Date(dto.scheduledDate),
        workoutType: dto.workoutType,
        intensity: effectiveIntensity(dto.workoutType, dto.intensity),
        trackSurface: effectiveSurface(dto.workoutType, dto.trackSurface),
        targetSpeedKmh: dto.targetSpeedKmh,
        jockeyName: dto.jockeyName,
        assignedStaffUserId: dto.assignedStaffUserId,
        vetConsulted: dto.vetConsulted,
      };
      const { medicalOverride } = await this.assertWorkoutAllowed(tx, plan, draft);

      const session = await tx.workoutSession.create({
        data: {
          trainingPlanId: planId,
          horseId: plan.horseId,
          scheduledDate: draft.scheduledDate,
          workoutType: draft.workoutType,
          intensity: draft.intensity,
          trackSurface: draft.trackSurface,
          distanceMeters: dto.distanceMeters,
          repetitions: dto.repetitions ?? 1,
          targetSpeedKmh: dto.targetSpeedKmh,
          jockeyName: dto.jockeyName,
          assignedStaffUserId: dto.assignedStaffUserId,
          trainerNotes: dto.trainerNotes,
          status: WorkoutStatus.SCHEDULED,
          medicalOverride,
        },
        include: WORKOUT_INCLUDE,
      });

      await this.auditService.record(
        { id: user.userId, name: user.fullName || user.email },
        'CREATE_WORKOUT_SESSION',
        `Scheduled ${session.workoutType} (${session.distanceMeters}m) for plan "${plan.phaseName}"`,
        session.id,
        { entityName: 'WorkoutSession', newValues: { medicalOverride } },
        tx,
      );
      return session;
    });
  }

  /** Sửa buổi tập Đã lên lịch (HT): gộp với dữ liệu cũ rồi kiểm lại toàn bộ DL-2.01. */
  async updateWorkout(workoutId: string, dto: UpdateWorkoutSessionDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.workoutSession.findUnique({
        where: { id: workoutId },
        include: { trainingPlan: true },
      });
      if (!existing) {
        throw apiError(HttpStatus.NOT_FOUND, 'WORKOUT_NOT_FOUND', 'Workout session not found.');
      }
      if (existing.status !== WorkoutStatus.SCHEDULED) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'WORKOUT_NOT_EDITABLE',
          'Chỉ sửa được buổi tập Đã lên lịch.',
        );
      }
      await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id" = ${existing.horseId} FOR UPDATE`;

      const workoutType = dto.workoutType ?? existing.workoutType ?? 'CANTER';
      const draft: WorkoutDraft = {
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : existing.scheduledDate,
        workoutType,
        intensity: effectiveIntensity(workoutType, dto.intensity ?? existing.intensity ?? 'MEDIUM'),
        trackSurface: effectiveSurface(
          workoutType,
          dto.trackSurface ?? existing.trackSurface ?? 'TURF',
        ),
        targetSpeedKmh: dto.targetSpeedKmh ?? existing.targetSpeedKmh,
        jockeyName: dto.jockeyName ?? existing.jockeyName,
        assignedStaffUserId: dto.assignedStaffUserId ?? existing.assignedStaffUserId ?? '',
        vetConsulted: dto.vetConsulted ?? existing.medicalOverride,
      };
      const { medicalOverride } = await this.assertWorkoutAllowed(
        tx,
        existing.trainingPlan,
        draft,
        workoutId,
      );

      const updated = await tx.workoutSession.update({
        where: { id: workoutId },
        data: {
          scheduledDate: draft.scheduledDate,
          workoutType: draft.workoutType,
          intensity: draft.intensity,
          trackSurface: draft.trackSurface,
          targetSpeedKmh: draft.targetSpeedKmh,
          jockeyName: draft.jockeyName,
          assignedStaffUserId: draft.assignedStaffUserId,
          medicalOverride,
          ...(dto.distanceMeters !== undefined && { distanceMeters: dto.distanceMeters }),
          ...(dto.repetitions !== undefined && { repetitions: dto.repetitions }),
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
   * hoặc sửa kết quả trong 48 giờ sau lần lưu đầu. Có dấu hiệu bất thường -> thành cảnh báo cho VET.
   */
  async recordResult(workoutId: string, dto: RecordWorkoutResultDto, user: CurrentUserPayload) {
    const existing = await this.prisma.workoutSession.findUnique({ where: { id: workoutId } });
    if (!existing) {
      throw apiError(HttpStatus.NOT_FOUND, 'WORKOUT_NOT_FOUND', 'Workout session not found.');
    }
    const now = new Date();

    if (existing.status === WorkoutStatus.SCHEDULED) {
      if (existing.scheduledDate > now) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'WORKOUT_NOT_STARTED',
          'Chỉ ghi kết quả khi buổi tập đã tới giờ bắt đầu.',
        );
      }
    } else if (existing.status === WorkoutStatus.MISSED) {
      const deadline = addDays(startOfClubDay(existing.scheduledDate), LATE_RESULT_DAYS + 1);
      if (now >= deadline) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'LATE_RESULT_EXPIRED',
          'Chỉ ghi kết quả muộn trong 7 ngày kể từ ngày tập.',
        );
      }
    } else if (existing.status === WorkoutStatus.COMPLETED) {
      const first = existing.resultRecordedAt ?? existing.updatedAt;
      if (now.getTime() - first.getTime() > RESULT_EDIT_HOURS * 60 * 60 * 1000) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'RESULT_EDIT_EXPIRED',
          'Chỉ sửa kết quả trong 48 giờ sau lần lưu đầu.',
        );
      }
    } else {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'WORKOUT_NOT_RECORDABLE',
        'Buổi tập bị chặn hoặc đã hủy nên không ghi kết quả.',
      );
    }

    if (dto.abnormalSigns && !dto.abnormalNotes) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'ABNORMAL_NOTES_REQUIRED',
        'Vui lòng mô tả dấu hiệu bất thường.',
      );
    }

    const updated = await this.prisma.workoutSession.update({
      where: { id: workoutId },
      data: {
        status: WorkoutStatus.COMPLETED,
        resultRecordedAt: existing.resultRecordedAt ?? now,
        ...(dto.actualTimeSeconds !== undefined && { actualTimeSeconds: dto.actualTimeSeconds }),
        ...(dto.heartRatePeak !== undefined && { heartRatePeak: dto.heartRatePeak }),
        ...(dto.heartRateRecovery !== undefined && { heartRateRecovery: dto.heartRateRecovery }),
        ...(dto.averageSpeedKmh !== undefined && { averageSpeedKmh: dto.averageSpeedKmh }),
        ...(dto.topSpeedKmh !== undefined && { topSpeedKmh: dto.topSpeedKmh }),
        ...(dto.performanceScore !== undefined && { performanceScore: dto.performanceScore }),
        ...(dto.trainerNotes !== undefined && { trainerNotes: dto.trainerNotes }),
        abnormalSigns: Boolean(dto.abnormalSigns),
        abnormalNotes: dto.abnormalSigns ? dto.abnormalNotes : null,
      },
      include: WORKOUT_INCLUDE,
    });

    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'RECORD_WORKOUT_RESULT',
      `Recorded result for workout ${workoutId}${dto.abnormalSigns ? ' (abnormal signs reported)' : ''}`,
      workoutId,
      { entityName: 'WorkoutSession', newValues: { abnormalSigns: Boolean(dto.abnormalSigns) } },
    );
    return updated;
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
        workoutType,
        intensity: existing.intensity ?? 'MEDIUM',
        trackSurface: existing.trackSurface ?? 'TURF',
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
    if (query.date) {
      const start = startOfClubDay(new Date(query.date));
      where.scheduledDate = { gte: start, lt: addDays(start, 1) };
    } else if (query.from || query.to) {
      where.scheduledDate = {
        ...(query.from && { gte: startOfClubDay(new Date(query.from)) }),
        ...(query.to && { lt: addDays(startOfClubDay(new Date(query.to)), 1) }),
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
      include: WORKOUT_INCLUDE,
    });
    return user.role === UserRole.GROOM
      ? rows.map((r) => ({ ...r, performanceScore: null }))
      : rows;
  }

  /** Chi tiết buổi tập; ngoài phạm vi -> 404. */
  async findWorkoutById(id: string, user: CurrentUserPayload) {
    const workout = await this.prisma.workoutSession.findUnique({
      where: { id },
      include: {
        ...WORKOUT_INCLUDE,
        horse: {
          select: {
            id: true,
            name: true,
            horseCode: true,
            isMedicalLocked: true,
            status: true,
            ownerId: true,
          },
        },
      },
    });
    const outOfScope =
      !workout ||
      (user.role === UserRole.HORSE_OWNER && workout.horse.ownerId !== user.userId) ||
      (user.role === UserRole.GROOM && workout.assignedStaffUserId !== user.userId);
    if (outOfScope) {
      throw apiError(HttpStatus.NOT_FOUND, 'WORKOUT_NOT_FOUND', 'Workout session not found.');
    }
    return user.role === UserRole.GROOM ? { ...workout, performanceScore: null } : workout;
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
   * SC-2.07 Biểu đồ thể lực: một điểm cho mỗi buổi Hoàn thành. Chưa có buổi nào -> mảng rỗng
   * (trước đây trả số liệu bịa sẵn).
   */
  async getFitnessMetrics(horseId: string, user: CurrentUserPayload) {
    const horse = await this.prisma.horse.findUnique({
      where: { id: horseId, deletedAt: null },
    });
    if (!horse || (user.role === UserRole.HORSE_OWNER && horse.ownerId !== user.userId)) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Target horse not found.');
    }

    const workouts = await this.prisma.workoutSession.findMany({
      where: { horseId, status: WorkoutStatus.COMPLETED },
      orderBy: { scheduledDate: 'asc' },
    });

    return workouts.map((w) => {
      const avgSpeed =
        w.averageSpeedKmh ??
        (w.actualTimeSeconds
          ? Number((((w.distanceMeters * w.repetitions) / w.actualTimeSeconds) * 3.6).toFixed(1))
          : null);
      const recovery = w.recoveryTimeMinutes
        ? Math.min(100, Math.max(20, Math.round(100 - w.recoveryTimeMinutes * 3)))
        : w.heartRateRecovery
          ? Math.min(100, Math.max(20, 200 - w.heartRateRecovery))
          : null;
      return {
        workoutId: w.id,
        date: w.scheduledDate.toISOString(),
        sessionName: `${w.workoutType || 'Workout'} (${w.distanceMeters}m - ${w.trackSurface || 'TURF'})`,
        avgSpeedKmh: avgSpeed,
        maxSpeedKmh: w.topSpeedKmh,
        maxHeartRate: w.heartRatePeak,
        recoveryScore: recovery,
        staminaScore: w.staminaScore,
        performanceScore: user.role === UserRole.GROOM ? null : w.performanceScore,
        hasAlert: w.abnormalSigns,
      };
    });
  }
}
