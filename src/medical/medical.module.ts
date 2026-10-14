import { Module } from '@nestjs/common';
import { MedicalController } from './medical.controller';
import { MedicalService } from './medical.service';
import { PreventiveScheduler } from './preventive.scheduler';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [MedicalController],
  providers: [MedicalService, PreventiveScheduler],
  exports: [MedicalService],
})
export class MedicalModule {}
