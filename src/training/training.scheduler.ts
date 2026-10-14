import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TrainingService } from './training.service';

/**
 * C-02: "Hệ thống tự làm" chạy theo giờ, không còn phụ thuộc người mở màn hình.
 * 00:05 giờ CLB mỗi đêm: buổi tập quá hạn -> Bỏ lỡ, giáo án quá ngày kết thúc -> Hoàn thành.
 * (Các màn hình vẫn gọi sweepOverdue() trước khi đọc để dữ liệu luôn mới trong ngày.)
 */
@Injectable()
export class TrainingScheduler {
  private readonly logger = new Logger(TrainingScheduler.name);

  constructor(private readonly training: TrainingService) {}

  @Cron('5 0 * * *', { name: 'training-sweep', timeZone: 'Asia/Ho_Chi_Minh' })
  async nightlySweep(): Promise<void> {
    try {
      await this.training.sweepOverdue();
    } catch (err) {
      this.logger.error(`Nightly training sweep failed: ${(err as Error).message}`);
    }
  }
}
