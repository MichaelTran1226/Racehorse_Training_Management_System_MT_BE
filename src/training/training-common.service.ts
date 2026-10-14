import { HttpStatus, Injectable } from '@nestjs/common';
import { PlanStatus, WorkoutStatus } from '@prisma/client';
import { apiError } from '../common/exceptions/api-error';
import { addDays, PENDING_WORKOUT_STATUSES, startOfClubDay, workoutLoad } from './training-rules';
import { PrismaService } from '../prisma/prisma.service';

/** Phần dùng chung của Flow 2: kiểm Khóa huấn luyện, dọn quá hạn (BR-2.02), tiến độ và điểm tải. */
@Injectable()
export class TrainingCommonService {
  constructor(private readonly prisma: PrismaService) {}

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

  /**
   * Tiến độ = số buổi Hoàn thành / số buổi đã đến hạn (không tính buổi đã hủy). Dùng cho SC-2.01, SC-2.02.
   */
  async progressOf(planIds: string[]) {
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

  sumLoad(
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
}
