import { HttpStatus, Injectable } from '@nestjs/common';
import { HorseStatus, PlanStatus, Prisma, Role, UserStatus, WorkoutStatus } from '@prisma/client';
import { apiError } from '../common/exceptions/api-error';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateWorkoutSessionDto, RepeatWorkoutDto } from './dto/create-workout-session.dto';
import { UpdateWorkoutSessionDto } from './dto/update-workout-session.dto';
import { RecordWorkoutResultDto } from './dto/record-result.dto';
import { CancelWorkoutDto, RestoreWorkoutDto } from './dto/workout-actions.dto';
import {
  addDays,
  clubDate,
  effectiveIntensity,
  effectiveSurface,
  isHeavy,
  LATE_RESULT_DAYS,
  MAX_WORKOUTS_PER_DAY,
  NO_TIME_TYPES,
  PENDING_WORKOUT_STATUSES,
  startOfClubDay,
  startOfClubWeek,
  TRIAL_SLOT_MINUTES,
  withinTrainingHours,
} from './training-rules';
import {
  Tx,
  MEDICAL_STATUSES,
  CANCEL_REASON_LABEL,
  RESULT_EDIT_HOURS,
  MAX_REPEAT_WORKOUTS,
  HEAVY_GAP_HOURS,
  GROOM_OVERLAP_MINUTES,
  WORKOUT_INCLUDE,
  WorkoutDraft,
  PlanForCheck,
  phasesOf,
  hideScoreForGroom,
} from './training-shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrainingCommonService } from './training-common.service';

/** P2-07, P2-08: buổi tập — xếp lịch, lặp hằng tuần, ghi kết quả, hủy / khôi phục, lịch của groom (FR-2.05, FR-2.09 → FR-2.13, FR-2.17, FR-2.20). */
@Injectable()
export class WorkoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
    private readonly common: TrainingCommonService,
  ) {}

  /** Báo groom được giao buổi tập (FR-2.12, blueprint FR-006). */
  private async notifyGroomAssigned(
    groomId: string | null | undefined,
    horseId: string,
    count: number,
    firstDate: Date,
    user: CurrentUserPayload,
  ) {
    if (!groomId || count === 0) return;
    const horse = await this.prisma.horse.findUnique({
      where: { id: horseId },
      select: { name: true },
    });
    const name = horse?.name ?? '';
    await this.notifications.notifyUsers(
      [groomId],
      {
        type: 'WORKOUT_ASSIGNED',
        category: 'TRAINING',
        title: 'New workout assigned to you',
        message: `${count} workout(s) for ${name}, first on ${clubDate(firstDate)}.`,
        params: { horse: name, count, date: clubDate(firstDate) },
        link: '/my-training',
        senderName: user.fullName,
      },
      user.userId,
    );
  }

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
    const session = await this.prisma.$transaction(async (tx) => {
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
    await this.notifyGroomAssigned(
      session.assignedStaffUserId,
      session.horseId,
      1,
      session.scheduledDate,
      user,
    );
    return session;
  }

  /**
   * DL-2.01 "Lặp lại hằng tuần": tạo buổi cùng giờ vào các thứ đã chọn tới ngày "Lặp đến".
   * Ngày vướng kiểm tra 1-4 thì bỏ qua và báo lại; cảnh báo (6) không chặn khi lặp.
   */
  async createRepeatWorkouts(planId: string, dto: RepeatWorkoutDto, user: CurrentUserPayload) {
    const result = await this.prisma.$transaction(async (tx) => {
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
      return {
        created: created.length,
        workoutIds: created,
        skipped,
        warnings: allWarnings,
        horseId: plan.horseId,
      };
    });
    const { horseId, ...response } = result;
    await this.notifyGroomAssigned(
      dto.assignedStaffUserId,
      horseId,
      result.created,
      new Date(dto.scheduledDate),
      user,
    );
    return response;
  }

  /** Sửa buổi tập Đã lên lịch chưa tới giờ (BTN-2.20): gộp với dữ liệu cũ rồi kiểm lại DL-2.01. */
  async updateWorkout(workoutId: string, dto: UpdateWorkoutSessionDto, user: CurrentUserPayload) {
    let previousGroomId: string | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.workoutSession.findUnique({
        where: { id: workoutId },
        include: { trainingPlan: true },
      });
      if (!existing) {
        throw apiError(HttpStatus.NOT_FOUND, 'WORKOUT_NOT_FOUND', 'Workout session not found.');
      }
      previousGroomId = existing.assignedStaffUserId;
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
    // Chỉ báo khi đổi sang groom khác (sửa giờ/cự ly không báo lại).
    if (updated.assignedStaffUserId !== previousGroomId) {
      await this.notifyGroomAssigned(
        updated.assignedStaffUserId,
        updated.horseId,
        1,
        updated.scheduledDate,
        user,
      );
    }
    return updated;
  }

  /**
   * SC-2.06 Ghi kết quả (HT): buổi Đã lên lịch đã tới giờ, buổi Bỏ lỡ trong 7 ngày,
   * hoặc sửa kết quả trong 48 giờ sau lần lưu đầu. Có dấu hiệu bất thường -> cảnh báo cho VET.
   */
  async recordResult(workoutId: string, dto: RecordWorkoutResultDto, user: CurrentUserPayload) {
    const updated = await this.prisma.$transaction(async (tx) => {
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

    // BR-2.19: dấu hiệu bất thường mới (VET chưa xem) -> báo VET. Cùng bộ dấu hiệu chỉ báo 1 lần.
    if (updated.abnormalSigns && !updated.vetAcknowledgedAt) {
      const signs = ((updated.abnormalSignTypes as string[]) || []).slice().sort();
      await this.notifications.notifyRoles(
        [Role.VETERINARIAN],
        {
          type: 'WORKOUT_ABNORMAL',
          category: 'TRAINING',
          title: 'Abnormal signs after a workout',
          message: `${updated.horse?.name ?? 'A horse'}: ${signs.join(', ')}. Please review.`,
          params: { horse: updated.horse?.name ?? '', signs: signs.join(', ') },
          link: '/alerts',
          senderName: user.fullName,
          dedupeKey: `WORKOUT_ABNORMAL:${workoutId}:${signs.join('+')}`,
        },
        user.userId,
      );
    }
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
    await this.common.sweepOverdue();
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
}
