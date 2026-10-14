import { HttpStatus, Injectable } from '@nestjs/common';
import { HorseStatus, PlanStatus, WorkoutStatus } from '@prisma/client';
import { apiError } from '../common/exceptions/api-error';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AcknowledgeAlertDto } from './dto/workout-actions.dto';
import {
  addDays,
  clubDate,
  LOAD_SPIKE_RATIO,
  SPEED_TYPES,
  startOfClubDay,
  startOfClubWeek,
  workoutLoad,
} from './training-rules';
import { WORKOUT_INCLUDE, phasesOf } from './training-shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TrainingCommonService } from './training-common.service';

/** P2-09: tổng quan huấn luyện, biểu đồ thể lực, cảnh báo dấu hiệu bất thường (FR-2.01, FR-2.14, FR-2.15). */
@Injectable()
export class TrainingInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly common: TrainingCommonService,
  ) {}

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

    const load7d = this.common.sumLoad(workouts, addDays(now, -7), now);
    const avg4w = this.common.sumLoad(workouts, loadStart, addDays(now, -7)) / 4;
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

  /**
   * SC-2.01 Tổng quan huấn luyện (CM, HT, VET): 4 thẻ chỉ số và một dòng cho mỗi ngựa đang quản lý.
   * Tải 7 ngày "tăng đột ngột" khi > 130% trung bình tuần của 4 tuần trước (Q-2.10).
   */
  async getOverview() {
    await this.common.sweepOverdue();
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
    const progress = await this.common.progressOf(plans.map((p) => p.id));
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
      const load7d = this.common.sumLoad(mine, addDays(now, -7), now);
      const avg4w = this.common.sumLoad(mine, addDays(today, -35), addDays(now, -7)) / 4;
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
