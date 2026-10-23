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
  ExamSimulationContext,
  ExamSimulationResultResponse,
  LiveSimulatorSession,
  SimulatorSessionsResponse,
  WorkoutSimulationContext,
  WorkoutSimulationResultResponse,
  WorkoutSimulationStartResponse,
} from './simulator.types';
import { ExamFinishedPacketDto } from './dto/exam-packet.dto';
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

  async startExam(
    horseId: string,
    medicalRecordId: string | undefined,
    actor: CurrentUserPayload,
  ): Promise<WorkoutSimulationStartResponse> {
    if (actor.role !== UserRole.VETERINARIAN) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'SIMULATOR_VET_REQUIRED',
        'Only a veterinarian can start an examination simulation.',
      );
    }

    const session = await this.prisma.$transaction(async (tx) => {
      const horse = await tx.horse.findUnique({ where: { id: horseId, deletedAt: null } });
      if (!horse) throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Horse not found.');

      if (medicalRecordId) {
        const record = await tx.medicalRecord.findUnique({ where: { id: medicalRecordId } });
        if (!record || record.horseId !== horseId) {
          throw apiError(
            HttpStatus.CONFLICT,
            'MEDICAL_RECORD_HORSE_MISMATCH',
            'Medical record does not belong to this horse.',
          );
        }
      }

      const existing = await tx.simulatorSession.findFirst({
        where: {
          type: SimulatorSessionType.EXAM,
          actorUserId: actor.userId,
          horseIds: { has: horseId },
          status: { in: [SimulatorSessionStatus.PENDING, SimulatorSessionStatus.RUNNING] },
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (existing) return existing;

      return tx.simulatorSession.create({
        data: {
          id: randomUUID(),
          type: SimulatorSessionType.EXAM,
          status: SimulatorSessionStatus.PENDING,
          horseIds: [horseId],
          actorUserId: actor.userId,
          medicalRecordId,
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

  async getHorsesForSimulator() {
    const horses = await this.prisma.horse.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        horseCode: true,
        microchipRfid: true,
        microchip: true,
        breed: true,
        color: true,
        gender: true,
        dob: true,
        status: true,
        isMedicalLocked: true,
        stallAllocations: {
          where: { isActive: true },
          select: {
            id: true,
            stall: { select: { id: true, code: true, zone: true } },
          },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });
    return horses.map((h) => ({
      ...h,
      stallCode: h.stallAllocations[0]?.stall?.code || null,
      zone: h.stallAllocations[0]?.stall?.zone || null,
    }));
  }

  async getContext(
    sessionId: string,
    actor?: CurrentUserPayload,
  ): Promise<WorkoutSimulationContext | ExamSimulationContext> {
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
    if (session.type === SimulatorSessionType.EXAM) {
      if (actor && (actor.role !== UserRole.VETERINARIAN || session.actorUserId !== actor.userId)) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          'SIMULATOR_SESSION_FORBIDDEN',
          'This examination simulation belongs to another veterinarian.',
        );
      }
      const horse = await this.prisma.horse.findUnique({ where: { id: session.horseIds[0] } });
      if (!horse) {
        throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Horse not found.');
      }
      return {
        type: 'EXAM',
        sessionId: session.id,
        status: session.status,
        medicalRecordId: session.medicalRecordId,
        horse: {
          id: horse.id,
          horseCode: horse.horseCode,
          name: horse.name,
          microchipRfid: horse.microchipRfid,
          breed: horse.breed,
          dob: horse.dob,
          gender: horse.gender,
          color: horse.color,
          status: horse.status,
          isMedicalLocked: horse.isMedicalLocked,
        },
      };
    }
    if (actor && actor.role !== UserRole.HEAD_TRAINER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'SIMULATOR_TRAINER_REQUIRED',
        'Only the assigned head trainer can open this simulation.',
      );
    }
    if (
      actor &&
      (session.actorUserId !== actor.userId ||
        session.workoutSession?.trainingPlan.trainerUserId !== actor.userId)
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
      type: 'WORKOUT',
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

  async recordExamFinished(
    dto: ExamFinishedPacketDto,
    actor: CurrentUserPayload,
  ): Promise<SimulatorSession> {
    if (actor.role !== UserRole.VETERINARIAN) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'SIMULATOR_VET_REQUIRED',
        'Only a veterinarian can publish examination measurements.',
      );
    }
    const issued = await this.requireIssuedSession(
      dto.session_id,
      SimulatorSessionType.EXAM,
      [dto.horse_id],
      actor,
      true,
    );
    if (issued.status === SimulatorSessionStatus.COMPLETED) return issued;

    return this.prisma.simulatorSession.update({
      where: { id: dto.session_id },
      data: {
        status: SimulatorSessionStatus.COMPLETED,
        finishedAt: new Date(),
        result: {
          capturedAt: dto.captured_at,
          modelVersion: dto.model_version,
          source: dto.source,
          metrics: dto.metrics,
        } as any,
      },
    });
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
    const issued = await this.requireIssuedSession(
      dto.session_id,
      dto.type === 'RACE' ? SimulatorSessionType.RACE : SimulatorSessionType.WORKOUT,
      horseIds,
      actor,
      true,
    );

    if (
      issued.status === SimulatorSessionStatus.COMPLETED ||
      issued.status === SimulatorSessionStatus.ABORTED_INJURY
    ) {
      this.active.delete(dto.session_id);
      return issued;
    }

    const finishedAt = new Date();
    const resultPayload =
      dto.type === 'WORKOUT'
        ? {
            ...(typeof dto.result === 'object' && dto.result ? dto.result : {}),
            surface: dto.surface,
          }
        : (dto.results ?? null);

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
    allowFinished = false,
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
    if (
      !allowFinished &&
      (session.status === SimulatorSessionStatus.COMPLETED ||
        session.status === SimulatorSessionStatus.ABORTED_INJURY)
    ) {
      throw apiError(
        HttpStatus.CONFLICT,
        'SIMULATOR_SESSION_FINISHED',
        'Simulation session has already finished.',
      );
    }
    return session;
  }

  async getLatestWorkoutResult(
    workoutId: string,
    actor: CurrentUserPayload,
  ): Promise<WorkoutSimulationResultResponse> {
    if (actor.role !== UserRole.HEAD_TRAINER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'SIMULATOR_TRAINER_REQUIRED',
        'Only the assigned head trainer can review this simulation.',
      );
    }
    const workout = await this.prisma.workoutSession.findUnique({
      where: { id: workoutId },
      include: {
        trainingPlan: { select: { trainerUserId: true } },
        simulatorSession: { select: { id: true, status: true, result: true } },
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
    const session = workout.simulatorSession;
    if (!session) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'SIMULATOR_RESULT_NOT_FOUND',
        'No simulation result exists for this workout.',
      );
    }

    return {
      sessionId: session.id,
      status: session.status,
      resultDraft: session.result ? this.toWorkoutResultDraft(session.result) : null,
    };
  }

  async getLatestExamResult(
    horseId: string,
    actor: CurrentUserPayload,
  ): Promise<ExamSimulationResultResponse> {
    if (actor.role !== UserRole.VETERINARIAN && actor.role !== UserRole.CLUB_MANAGER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'SIMULATOR_MEDICAL_REVIEW_REQUIRED',
        'Only medical staff can review examination simulations.',
      );
    }
    const session = await this.prisma.simulatorSession.findFirst({
      where: {
        type: SimulatorSessionType.EXAM,
        horseIds: { has: horseId },
        status: SimulatorSessionStatus.COMPLETED,
      },
      orderBy: { finishedAt: 'desc' },
    });
    if (!session) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'SIMULATOR_EXAM_RESULT_NOT_FOUND',
        'No simulation examination result exists for this horse.',
      );
    }

    const value = session.result as any;
    return {
      sessionId: session.id,
      status: session.status,
      resultDraft: value
        ? {
            temperature: value.metrics.temperature.value,
            restingHeartRate: value.metrics.resting_heart_rate.value,
            respiratoryRate: value.metrics.respiratory_rate.value,
            weightKg: value.metrics.weight.value,
            capturedAt: value.capturedAt,
            modelVersion: value.modelVersion,
            source: value.source,
          }
        : null,
    };
  }

  private toWorkoutResultDraft(
    result: unknown,
  ): NonNullable<WorkoutSimulationResultResponse['resultDraft']> {
    const value =
      typeof result === 'object' && result !== null && !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : {};
    const number = (key: string) =>
      typeof value[key] === 'number' && Number.isFinite(value[key])
        ? (value[key] as number)
        : undefined;
    const surfaces = { GRASS: 'TURF', SAND: 'DIRT', MIXED: 'SYNTHETIC' } as const;
    const conditions = { GOOD: 'GOOD', WET: 'SOFT', HEAVY: 'HEAVY' } as const;
    return {
      actualTimeSeconds: number('durationS'),
      actualDistanceMeters: number('distanceCompletedM'),
      heartRatePeak: number('peakHr'),
      heartRateRecovery: number('hrRecovery10m'),
      topSpeedKmh: number('topSpeedKmh'),
      actualSurface: surfaces[value.surface as keyof typeof surfaces],
      trackCondition: conditions[value.condition as keyof typeof conditions],
    };
  }

  async listRecent(
    limit = 20,
    status?: SimulatorSessionStatus,
  ): Promise<SimulatorSessionsResponse> {
    const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit) || 20));

    const recent = await this.prisma.simulatorSession.findMany({
      ...(status ? { where: { status } } : {}),
      take: clampedLimit,
      orderBy: { updatedAt: 'desc' },
    });

    return {
      active: Array.from(this.active.values()).filter(
        (session) => !status || session.status === status,
      ),
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
