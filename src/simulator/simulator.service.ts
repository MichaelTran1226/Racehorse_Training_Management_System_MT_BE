import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import {
  RaceProgressPacketDto,
  SessionFinishedPacketDto,
  TelemetryTickPacketDto,
} from './dto/simulator-packet.dto';
import { LiveSimulatorSession, SimulatorSessionsResponse } from './simulator.types';
import { SimulatorSession, SimulatorSessionStatus, SimulatorSessionType } from '@prisma/client';

@Injectable()
export class SimulatorService {
  private readonly logger = new Logger(SimulatorService.name);
  private readonly active = new Map<string, LiveSimulatorSession>();

  constructor(private readonly prisma: PrismaService) {}

  async recordTelemetry(
    dto: TelemetryTickPacketDto,
    actor: CurrentUserPayload,
  ): Promise<LiveSimulatorSession> {
    const existing = this.active.get(dto.session_id);
    const horseId = dto.horse?.horse_id;
    const horseIds = horseId ? [horseId] : [];

    const live: LiveSimulatorSession = {
      sessionId: dto.session_id,
      type: SimulatorSessionType.WORKOUT,
      status: SimulatorSessionStatus.RUNNING,
      horseIds,
      actorUserId: actor.userId,
      startedAt: existing?.startedAt ?? new Date(),
      finishedAt: null,
      lastSnapshot: dto,
      updatedAt: new Date(),
    };
    this.active.set(dto.session_id, live);

    // Upsert session row once on first telemetry tick without storing tick-by-tick rows
    if (!existing) {
      await this.prisma.simulatorSession.upsert({
        where: { id: dto.session_id },
        update: {
          lastSnapshot: dto as any,
          updatedAt: new Date(),
        },
        create: {
          id: dto.session_id,
          type: SimulatorSessionType.WORKOUT,
          status: SimulatorSessionStatus.RUNNING,
          horseIds,
          actorUserId: actor.userId,
          startedAt: live.startedAt,
          lastSnapshot: dto as any,
        },
      });
    }

    return live;
  }

  async recordRaceProgress(
    dto: RaceProgressPacketDto,
    actor: CurrentUserPayload,
  ): Promise<LiveSimulatorSession> {
    const existing = this.active.get(dto.session_id);
    const horseIds = dto.positions?.map((p) => p.horse_id) || [];

    const live: LiveSimulatorSession = {
      sessionId: dto.session_id,
      type: SimulatorSessionType.RACE,
      status: SimulatorSessionStatus.RUNNING,
      horseIds,
      actorUserId: actor.userId,
      startedAt: existing?.startedAt ?? new Date(),
      finishedAt: null,
      lastSnapshot: dto,
      updatedAt: new Date(),
    };
    this.active.set(dto.session_id, live);

    if (!existing) {
      await this.prisma.simulatorSession.upsert({
        where: { id: dto.session_id },
        update: {
          lastSnapshot: dto as any,
          updatedAt: new Date(),
        },
        create: {
          id: dto.session_id,
          type: SimulatorSessionType.RACE,
          status: SimulatorSessionStatus.RUNNING,
          horseIds,
          actorUserId: actor.userId,
          startedAt: live.startedAt,
          lastSnapshot: dto as any,
        },
      });
    }

    return live;
  }

  async recordFinished(
    dto: SessionFinishedPacketDto,
    actor: CurrentUserPayload,
  ): Promise<SimulatorSession> {
    const status =
      dto.status === 'ABORTED_INJURY'
        ? SimulatorSessionStatus.ABORTED_INJURY
        : SimulatorSessionStatus.COMPLETED;

    const horseIds =
      dto.type === 'WORKOUT' && dto.horse?.horse_id
        ? [dto.horse.horse_id]
        : dto.results?.map((r) => r.horse_id) || [];

    const finishedAt = new Date();
    const resultPayload = dto.result ?? dto.results ?? null;

    const session = await this.prisma.simulatorSession.upsert({
      where: { id: dto.session_id },
      update: {
        status,
        finishedAt,
        result: resultPayload as any,
        ...(horseIds.length > 0 ? { horseIds } : {}),
      },
      create: {
        id: dto.session_id,
        type: dto.type === 'RACE' ? SimulatorSessionType.RACE : SimulatorSessionType.WORKOUT,
        status,
        horseIds,
        actorUserId: actor.userId,
        startedAt: new Date(),
        finishedAt,
        result: resultPayload as any,
      },
    });

    this.active.delete(dto.session_id);
    return session;
  }

  async listRecent(limit = 20): Promise<SimulatorSessionsResponse> {
    const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit) || 20));

    const recent = await this.prisma.simulatorSession.findMany({
      take: clampedLimit,
      orderBy: { updatedAt: 'desc' },
    });

    return {
      active: Array.from(this.active.values()),
      recent,
    };
  }

  activeSessions(): LiveSimulatorSession[] {
    return Array.from(this.active.values());
  }

  getActiveSession(sessionId: string): LiveSimulatorSession | undefined {
    return this.active.get(sessionId);
  }
}
