import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { HorsesController } from './horses.controller';
import { HorsesService } from './horses.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [HorsesController],
  providers: [HorsesService],
  exports: [HorsesService],
})
export class HorsesModule {}
