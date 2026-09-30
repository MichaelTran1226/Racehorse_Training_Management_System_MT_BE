import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuditContextMiddleware } from './audit-context.middleware';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { CounterService } from './counter.service';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, CounterService],
  exports: [AuditService, CounterService],
})
export class AuditModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuditContextMiddleware).forRoutes('*');
  }
}
