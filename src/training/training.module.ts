import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { TrainingScheduler } from './training.scheduler';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [TrainingController],
  providers: [TrainingService, TrainingScheduler],
  exports: [TrainingService],
})
export class TrainingModule {}
