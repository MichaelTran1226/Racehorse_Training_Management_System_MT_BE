import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [AuthModule],
  controllers: [AccountsController, MeController],
  providers: [AccountsService, MeService],
})
export class AccountsModule {}
