import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import {
  RaceProgressPacketDto,
  SessionFinishedPacketDto,
  TelemetryTickPacketDto,
} from './dto/simulator-packet.dto';
import {
  LiveSimulatorSession,
  SimulatorSessionsResponse,
  WorkoutSimulationContext,
  WorkoutSimulationStartResponse,
} from './simulator.types';
import {
  SimulatorSession,
  SimulatorSessionStatus,
  SimulatorSessionType,
  WorkoutStatus,
} from '@prisma/client';
import { apiError } from '../common/exceptions/api-error';
import { UserRole } from '../common/enums/role.enum';
import { isHeavy } from '../training/training-rules';

@Injectable()
export class SimulatorService {
  private readonly logger = new Logger(SimulatorService.name);
  private readonly active = new Map<string, LiveSimulatorSession>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async startWorkout(
    workoutId: string,
    actor: CurrentUserPayload,
  ): Promise<WorkoutSimulationStartResponse> {
    if (actor.role !== UserRole.HEAD_TRAINER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'SIMULATOR_TRAINER_REQUIRED',
        'Only the assigned head trainer can start this simulation.',
      );
    }

    const session = await this.prisma.$transaction(async (tx) => {
      const workout = await tx.workoutSession.findUnique({
        where: { id: workoutId },
        include: {
          trainingPlan: { select: { id: true, trainerUserId: true } },
          horse: {
            select: {
              id: true,
              horseCode: true,
              name: true,
              microchipRfid: true,
              breed: true,
              dob: true,
              gender: true,
              color: true,
              status: true,
              isMedicalLocked: true,
              medicalLocks: { where: { isLocked: true }, take: 1, select: { id: true } },
            },
          },
        },
      });
      if (!workout) {
        throw apiError(HttpStatus.NOT_FOUND, 'WORKOUT_NOT_FOUND', 'Workout session not found.');
      }
      if (workout.trainingPlan.trainerUserId !== actor.userId) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          'WORKOUT_NOT_ASSIGNED',
          'This workout belongs to another trainer.',
        );
      }
      if (workout.status !== WorkoutStatus.SCHEDULED) {
        throw apiError(
          HttpStatus.CONFLICT,
          'WORKOUT_NOT_SIMULATABLE',
          'Only scheduled workouts can be simulated.',
        );
      }
      if (workout.scheduledDate > new Date()) {
        throw apiError(
          HttpStatus.CONFLICT,
          'WORKOUT_NOT_STARTED',
          'The workout has not reached its scheduled start time.',
        );
      }
      const locked = workout.horse.isMedicalLocked || workout.horse.medicalLocks.length > 0;
      if (locked && isHeavy(workout.workoutType ?? '', workout.intensity ?? '')) {
        throw apiError(
          HttpStatus.CONFLICT,
          'MEDICAL_LOCK_ACTIVE',
          'A medical lock prevents this high-intensity workout.',
        );
      }

      return tx.simulatorSession.upsert({
        where: { workoutSessionId: workout.id },
        update: {},
        create: {
          id: randomUUID(),
          type: SimulatorSessionType.WORKOUT,
          status: SimulatorSessionStatus.PENDING,
          workoutSessionId: workout.id,
          horseIds: [workout.horse.id],
          actorUserId: actor.userId,
        },
      });
    });

    const baseUrl = this.config
      .get<string>('SIMULATOR_URL', 'http://localhost:5175')
      .replace(/\/$/, '');
    return {
      sessionId: session.id,
      status: session.status,
      launchUrl: `${baseUrl}/?sessionId=${encodeURIComponent(session.id)}`,
    };
  }

  async getContext(
    sessionId: string,
    actor: CurrentUserPayload,
  ): Promise<WorkoutSimulationContext> {
    if (actor.role !== UserRole.HEAD_TRAINER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'SIMULATOR_TRAINER_REQUIRED',
        'Only the assigned head trainer can open this simulation.',
      );
    }
    const session = await this.prisma.simulatorSession.findUnique({
      where: { id: sessionId },
      include: {
        workoutSession: {
          include: {
            horse: true,
            trainingPlan: { select: { trainerUserId: true } },
          },
        },
      },
    });
    if (!session) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'SIMULATOR_SESSION_NOT_FOUND',
        'Simulation session not found.',
      );
    }
    if (
      session.actorUserId !== actor.userId ||
      session.workoutSession?.trainingPlan.trainerUserId !== actor.userId
    ) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'SIMULATOR_SESSION_FORBIDDEN',
        'This simulation session belongs to another trainer.',
      );
    }
    const workout = session.workoutSession;
    if (!workout) {
      throw apiError(
        HttpStatus.CONFLICT,
        'SIMULATOR_CONTEXT_MISSING',
        'The simulation session is not linked to a workout.',
      );
    }

    return {
      sessionId: session.id,
      status: session.status,
      horse: {
        id: workout.horse.id,
        horseCode: workout.horse.horseCode,
        name: workout.horse.name,
        microchipRfid: workout.horse.microchipRfid,
        breed: workout.horse.breed,
        dob: workout.horse.dob,
        gender: workout.horse.gender,
        color: workout.horse.color,
        status: workout.horse.status,
        isMedicalLocked: workout.horse.isMedicalLocked,
      },
      workout: {
        id: workout.id,
        scheduledDate: workout.scheduledDate,
        workoutType: workout.workoutType,
        intensity: workout.intensity,
        distanceMeters: workout.distanceMeters,
        repetitions: workout.repetitions,
        targetSpeedKmh: workout.targetSpeedKmh,
        targetDurationSeconds: workout.targetDurationSeconds,
        trackSurface: workout.trackSurface,
      },
    };
  }

  async recordTelemetry(
    dto: TelemetryTickPacketDto,
    actor: CurrentUserPayload,
  ): Promise<LiveSimulatorSession> {
    const horseId = dto.horse?.horse_id;
    const horseIds = horseId ? [horseId] : [];
    const session = await this.requireIssuedSession(
      dto.session_id,
      SimulatorSessionType.WORKOUT,
      horseIds,
      actor,
    );
    const workout = session.workoutSession!;
    const locked = workout.horse.isMedicalLocked || workout.horse.medicalLocks.length > 0;
    if (
      session.status === SimulatorSessionStatus.PENDING &&
      locked &&
      isHeavy(workout.workoutType ?? '', workout.intensity ?? '')
    ) {
      throw apiError(
        HttpStatus.CONFLICT,
        'MEDICAL_LOCK_ACTIVE',
        'A medical lock prevents this high-intensity workout.',
      );
    }

    const live: LiveSimulatorSession = {
      sessionId: dto.session_id,
      type: SimulatorSessionType.WORKOUT,
      status: SimulatorSessionStatus.RUNNING,
      horseIds,
      actorUserId: actor.userId,
      startedAt: session.startedAt,
      finishedAt: null,
      lastSnapshot: dto,
      updatedAt: new Date(),
    };
    this.active.set(dto.session_id, live);

    await this.prisma.simulatorSession.update({
      where: { id: dto.session_id },
      data: {
        status: SimulatorSessionStatus.RUNNING,
        lastSnapshot: dto as any,
        updatedAt: new Date(),
      },
    });

    return live;
  }

  async recordRaceProgress(
    dto: RaceProgressPacketDto,
    actor: CurrentUserPayload,
  ): Promise<LiveSimulatorSession> {
    const horseIds = dto.positions?.map((p) => p.horse_id) || [];
    const session = await this.requireIssuedSession(
      dto.session_id,
      SimulatorSessionType.RACE,
      horseIds,
      actor,
    );

    const live: LiveSimulatorSession = {
      sessionId: dto.session_id,
      type: SimulatorSessionType.RACE,
      status: SimulatorSessionStatus.RUNNING,
      horseIds,
      actorUserId: actor.userId,
      startedAt: session.startedAt,
      finishedAt: null,
      lastSnapshot: dto,
      updatedAt: new Date(),
    };
    this.active.set(dto.session_id, live);

    await this.prisma.simulatorSession.update({
      where: { id: dto.session_id },
      data: {
        status: SimulatorSessionStatus.RUNNING,
        lastSnapshot: dto as any,
        updatedAt: new Date(),
      },
    });

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
    await this.requireIssuedSession(
      dto.session_id,
      dto.type === 'RACE' ? SimulatorSessionType.RACE : SimulatorSessionType.WORKOUT,
      horseIds,
      actor,
    );

    const finishedAt = new Date();
    const resultPayload = dto.result ?? dto.results ?? null;

    const session = await this.prisma.simulatorSession.update({
      where: { id: dto.session_id },
      data: {
        status,
        finishedAt,
        result: resultPayload as any,
        ...(horseIds.length > 0 ? { horseIds } : {}),
      },
    });

    this.active.delete(dto.session_id);
    return session;
  }

  private async requireIssuedSession(
    sessionId: string,
    type: SimulatorSessionType,
    horseIds: string[],
    actor: CurrentUserPayload,
  ) {
    const session = await this.prisma.simulatorSession.findUnique({
      where: { id: sessionId },
      include: {
        workoutSession: {
          include: {
            trainingPlan: { select: { trainerUserId: true } },
            horse: {
              select: {
                id: true,
                isMedicalLocked: true,
                medicalLocks: { where: { isLocked: true }, take: 1, select: { id: true } },
              },
            },
          },
        },
      },
    });
    if (!session) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'SIMULATOR_SESSION_NOT_FOUND',
        'Simulation session not found.',
      );
    }
    if (
      session.status === SimulatorSessionStatus.COMPLETED ||
      session.status === SimulatorSessionStatus.ABORTED_INJURY
    ) {
      throw apiError(
        HttpStatus.CONFLICT,
        'SIMULATOR_SESSION_FINISHED',
        'Simulation session has already finished.',
      );
    }
    if (session.actorUserId !== actor.userId) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'SIMULATOR_SESSION_FORBIDDEN',
        'This simulation session belongs to another trainer.',
      );
    }
    if (session.type !== type) {
      throw apiError(
        HttpStatus.CONFLICT,
        'SIMULATOR_SESSION_TYPE_MISMATCH',
        'Simulation packet type does not match the issued session.',
      );
    }
    if (horseIds.length === 0 || horseIds.some((horseId) => !session.horseIds.includes(horseId))) {
      throw apiError(
        HttpStatus.CONFLICT,
        'SIMULATOR_HORSE_MISMATCH',
        'Simulation horse does not match the issued session.',
      );
    }
    if (type === SimulatorSessionType.WORKOUT) {
      const workout = session.workoutSession;
      if (!workout) {
        throw apiError(
          HttpStatus.CONFLICT,
          'SIMULATOR_CONTEXT_MISSING',
          'The simulation session is not linked to a workout.',
        );
      }
      if (workout.trainingPlan.trainerUserId !== actor.userId) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          'SIMULATOR_SESSION_FORBIDDEN',
          'This simulation session belongs to another trainer.',
        );
      }
      if (workout.horse.id !== horseIds[0]) {
        throw apiError(
          HttpStatus.CONFLICT,
          'SIMULATOR_HORSE_MISMATCH',
          'Simulation horse does not match the issued workout.',
        );
      }
    }
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
