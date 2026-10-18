import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DailyTasksService } from './daily-tasks.service';

/**
 * TASK F4-04-BE: Cron Job tự động chạy lúc 00:05 mỗi ngày
 * Sinh danh sách công việc chăm sóc hàng ngày cho tất cả các con ngựa đang quản lý.
 */
@Injectable()
export class DailyTasksScheduler {
  private readonly logger = new Logger(DailyTasksScheduler.name);

  constructor(private readonly service: DailyTasksService) {}

  @Cron('5 0 * * *', { name: 'daily-care-tasks-sweep', timeZone: 'Asia/Ho_Chi_Minh' })
  async handleNightlyTaskGeneration() {
    this.logger.log('[DailyTasksScheduler] Running nightly task generation cron job at 00:05...');
    try {
      const result = await this.service.generateDailyTasksForDate(new Date());
      this.logger.log(
        `[DailyTasksScheduler] Nightly generation complete: ${result.totalGenerated} tasks for ${result.horsesProcessed} horses on ${result.date}`,
      );
    } catch (err: any) {
      this.logger.error(
        `[DailyTasksScheduler] Nightly task generation failed: ${err.message}`,
        err.stack,
      );
    }
  }
}
