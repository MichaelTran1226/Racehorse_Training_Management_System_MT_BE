import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { CounterService } from './counter.service';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, CounterService],
  exports: [AuditService, CounterService],
})
export class AuditModule {}
