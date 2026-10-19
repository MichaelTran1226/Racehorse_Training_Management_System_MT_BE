import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { AuditModule } from './audit/audit.module';
import { AccountsModule } from './accounts/accounts.module';
import { MedicalModule } from './medical/medical.module';
import { HorsesModule } from './horses/horses.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { StallsModule } from './stalls/stalls.module';
import { HorseCatalogsModule } from './horse-catalogs/horse-catalogs.module';
import { TrainingModule } from './training/training.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { FinancialModule } from './financial/financial.module';
import { SuppliesModule } from './supplies/supplies.module';
import { ShiftsModule } from './shifts/shifts.module';
import { ShiftRostersModule } from './shift-rosters/shift-rosters.module';
import { NutritionModule } from './nutrition/nutrition.module';
import { DailyTasksModule } from './daily-tasks/daily-tasks.module';
import { IncidentsModule } from './incidents/incidents.module';
import { InventoryModule } from './inventory/inventory.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    ScheduleModule.forRoot(),
    // C-04: 10 lần gọi / phút / IP cho các API xác thực (gắn ở AuthController). Tắt khi chạy test.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 10 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    PrismaModule,
    HealthModule,
    MailModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    AccountsModule,
    MedicalModule,
    HorsesModule,
    StallsModule,
    HorseCatalogsModule,
    TrainingModule,
    TournamentsModule,
    FinancialModule,
    SuppliesModule,
    ShiftsModule,
    ShiftRostersModule,
    NutritionModule,
    DailyTasksModule,
    IncidentsModule,
    InventoryModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
