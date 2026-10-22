import { Module } from '@nestjs/common';
import { MedicalController } from './medical.controller';
import { MedicalAccessService } from './medical-access.service';
import { InjuriesService } from './injuries.service';
import { MedicalLocksService } from './medical-locks.service';
import { HealthOverviewService } from './health-overview.service';
import { PreventiveCareService } from './preventive-care.service';
import { MedicalRecordsService } from './medical-records.service';
import { PreventiveScheduler } from './preventive.scheduler';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { SimulatorModule } from '../simulator/simulator.module';

@Module({
  imports: [PrismaModule, AuditModule, SimulatorModule],
  controllers: [MedicalController],
  providers: [
    MedicalAccessService,
    InjuriesService,
    MedicalLocksService,
    HealthOverviewService,
    PreventiveCareService,
    MedicalRecordsService,
    PreventiveScheduler,
  ],
  exports: [
    MedicalAccessService,
    InjuriesService,
    MedicalLocksService,
    HealthOverviewService,
    PreventiveCareService,
    MedicalRecordsService,
  ],
})
export class MedicalModule {}
