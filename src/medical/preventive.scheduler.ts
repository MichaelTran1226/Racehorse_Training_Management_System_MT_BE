import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PreventiveStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const DAY_MS = 24 * 60 * 60 * 1000;
// Lịch không gắn danh mục: nhắc trước 3 ngày (blueprint FR-012).
const DEFAULT_NOTICE_DAYS = 3;

/**
 * C-02 / FR-3.15: 06:00 giờ CLB mỗi ngày, nhắc lịch tiêm phòng / tẩy giun / móng sắp đến hạn hoặc quá hạn
 * cho Bác sĩ thú y và groom đang chăm ngựa. Mỗi lịch × mỗi hạn × mỗi người chỉ nhắc 1 lần (dedupeKey).
 */
@Injectable()
export class PreventiveScheduler {
  private readonly logger = new Logger(PreventiveScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 6 * * *', { name: 'preventive-reminders', timeZone: 'Asia/Ho_Chi_Minh' })
  async dailyReminders(now = new Date()): Promise<number> {
    try {
      const horizon = new Date(now.getTime() + 30 * DAY_MS);
      const schedules = await this.prisma.preventiveSchedule.findMany({
        where: {
          status: { not: PreventiveStatus.COMPLETED },
          dueDate: { lte: horizon },
          horse: { deletedAt: null },
        },
        include: {
          horse: { select: { id: true, name: true } },
          typeCatalog: { select: { name: true, advanceNoticeDays: true } },
        },
      });

      let sent = 0;
      for (const s of schedules) {
        const noticeDays = s.typeCatalog?.advanceNoticeDays ?? DEFAULT_NOTICE_DAYS;
        const daysLeft = Math.ceil((s.dueDate.getTime() - now.getTime()) / DAY_MS);
        if (daysLeft > noticeDays) continue;
        const overdue = daysLeft < 0;
        const due = s.dueDate.toISOString().slice(0, 10);
        const task = s.typeCatalog?.name ?? s.scheduleType;
        await this.notifications.notifyHorse(
          s.horseId,
          { roles: [Role.VETERINARIAN], groom: true },
          {
            type: overdue ? 'PREVENTIVE_OVERDUE' : 'PREVENTIVE_DUE',
            category: 'MEDICAL',
            title: overdue ? 'Preventive care overdue' : 'Preventive care due soon',
            message: `${s.horse.name}: ${task} ${overdue ? 'was due' : 'is due'} on ${due}.`,
            params: { horse: s.horse.name, task, date: due },
            link: '/vaccine',
            senderName: 'EquiFlow',
            // Quá hạn nhắc thêm 1 lần riêng, sau đó không nhắc lại cho tới khi có hạn mới.
            dedupeKey: `${overdue ? 'PREVENTIVE_OVERDUE' : 'PREVENTIVE_DUE'}:${s.id}:${due}`,
          },
        );
        sent += 1;
      }
      return sent;
    } catch (err) {
      this.logger.error(`Preventive reminders failed: ${(err as Error).message}`);
      return 0;
    }
  }
}
