import { HttpStatus, Injectable } from '@nestjs/common';
import { HorseStatus, PlanStatus, Prisma, TrackSurface, WorkoutStatus } from '@prisma/client';
import { apiError } from '../common/exceptions/api-error';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateTrainingPlanDto } from './dto/create-training-plan.dto';
import { UpdateTrainingPlanDto } from './dto/update-training-plan.dto';
import { QueryTrainingPlanDto } from './dto/query-training-plan.dto';
import { ChangePlanStatusDto, ClonePlanDto } from './dto/workout-actions.dto';
import {
  addDays,
  clubDate,
  isHeavy,
  MAX_PLAN_WEEKS,
  PENDING_WORKOUT_STATUSES,
  PlanPhase,
  startOfClubDay,
  validatePhases,
} from './training-rules';
import { Tx, MEDICAL_STATUSES, PLAN_INCLUDE, phasesOf } from './training-shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CounterService } from '../audit/counter.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrainingCommonService } from './training-common.service';

/** P2-06: giáo án — danh sách, tạo, sửa, kích hoạt / hoàn thành / hủy, nhân bản, xóa (FR-2.02 → FR-2.08, FR-2.18, FR-2.19). */
@Injectable()
export class TrainingPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly counter: CounterService,
    private readonly notifications: NotificationsService,
    private readonly common: TrainingCommonService,
  ) {}

  /** SC-2.02 Danh sách giáo án (CM, HT, VET tất cả; OWNER ngựa sở hữu). */
  async findAllPlans(query: QueryTrainingPlanDto, user: CurrentUserPayload) {
    await this.common.sweepOverdue();
    const { horseId, status, search, page = 1, pageSize = 20 } = query;

    const where: Prisma.TrainingPlanWhereInput = { horse: { deletedAt: null } };
    if (horseId) where.horseId = horseId;
    if (status) {
      const parts = status
        .split(',')
        .map((s) => s.trim())
        .filter((s) => Object.values(PlanStatus).includes(s as PlanStatus)) as PlanStatus[];
      if (parts.length === 1) {
        where.status = parts[0];
      } else if (parts.length > 1) {
        where.status = { in: parts };
      }
    }
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
    const progress = await this.common.progressOf(items.map((p) => p.id));

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
    const progress = (await this.common.progressOf([plan.id])).get(plan.id) ?? {
      completed: 0,
      due: 0,
    };
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
    const result = await this.prisma.$transaction(async (tx) => {
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

    if (dto.status === PlanStatus.ACTIVE) {
      await this.notifications.notifyHorse(
        result.horseId,
        { owner: true },
        {
          type: 'PLAN_ACTIVATED',
          category: 'TRAINING',
          title: 'Training plan started',
          message: `Training plan "${result.phaseName}" is now active for ${result.horse?.name ?? 'your horse'}.`,
          params: { plan: result.phaseName, horse: result.horse?.name ?? '' },
          link: `/training/plans/${result.id}`,
          senderName: user.fullName,
        },
        user.userId,
      );
    }
    return result;
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
}
