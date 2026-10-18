import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ShiftRostersController } from './shift-rosters.controller';
import { ShiftRostersService } from './shift-rosters.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ShiftRostersController],
  providers: [ShiftRostersService],
  exports: [ShiftRostersService],
})
export class ShiftRostersModule {}
