import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { SimulatorService } from './simulator.service';
import { SimulatorController } from './simulator.controller';
import { SimulatorGateway } from './simulator.gateway';
import { SimulatorRealtimeService } from './simulator-realtime.service';

@Module({
  imports: [PrismaModule, AuthModule, IncidentsModule],
  controllers: [SimulatorController],
  providers: [SimulatorService, SimulatorGateway, SimulatorRealtimeService],
  exports: [SimulatorService, SimulatorRealtimeService],
})
export class SimulatorModule {}
