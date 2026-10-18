import { Module } from '@nestjs/common';
import { DailyTasksController } from './daily-tasks.controller';
import { DailyTasksService } from './daily-tasks.service';
import { DailyTasksScheduler } from './daily-tasks.scheduler';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [DailyTasksController],
  providers: [DailyTasksService, DailyTasksScheduler],
  exports: [DailyTasksService],
})
export class DailyTasksModule {}
