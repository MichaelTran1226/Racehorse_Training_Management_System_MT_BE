import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { HorseCatalogsController } from './horse-catalogs.controller';
import { HorseCatalogsService } from './horse-catalogs.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [HorseCatalogsController],
  providers: [HorseCatalogsService],
  exports: [HorseCatalogsService],
})
export class HorseCatalogsModule {}
