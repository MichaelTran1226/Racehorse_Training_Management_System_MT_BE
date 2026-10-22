import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SimulatorService } from './simulator.service';
import { Role } from '@prisma/client';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('SimulatorService', () => {
  let service: SimulatorService;
  let prisma: any;

  const mockActor: CurrentUserPayload = {
    userId: 'user-head-trainer-1',
    email: 'trainer@equiflow.com',
    role: Role.HEAD_TRAINER,
    fullName: 'Head Trainer',
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
      workoutSession: {
        findUnique: jest.fn(),
      },
      simulatorSession: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      medicalLock: {
        create: jest.fn(),
        update: jest.fn(),
      },
      medicalRecord: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulatorService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'http://localhost:5175') } },
      ],
    }).compile();

    service = module.get<SimulatorService>(SimulatorService);
  });

  const eligibleWorkout = () => ({
    id: 'workout-1',
    status: 'SCHEDULED',
    scheduledDate: new Date(Date.now() - 60_000),
    workoutType: 'TRIAL',
    intensity: 'MODERATE',
    distanceMeters: 1200,
    repetitions: 1,
    targetSpeedKmh: 45,
    targetDurationSeconds: 100,
    trackSurface: 'TURF',
    simulatorSession: null,
    trainingPlan: { id: 'plan-1', trainerUserId: mockActor.userId },
    horse: {
      id: 'horse-uuid-1',
      horseCode: 'NG-000001',
      name: 'Thunder',
      microchipRfid: '985141000000001',
      breed: 'Thoroughbred',
      dob: new Date('2020-01-01'),
      gender: 'MALE',
      color: 'Bay',
      status: 'IN_TRAINING',
      isMedicalLocked: false,
      medicalLocks: [],
    },
  });

  const telemetryTick = () => ({
    event: 'sim:telemetry_tick' as const,
    session_id: 'server-session-1',
    timestamp_ms: 1729520000000,
    sim_time_s: 1,
    sim_speed_multiplier: 1,
    horse: {
      horse_id: 'horse-uuid-1',
      microchip_id: '985141000000001',
      lifecycle_status: 'IN_TRAINING',
      medical_lock: false,
    },
    track: {
      surface: 'GRASS',
      target_distance_m: 1200,
      covered_distance_m: 15.2,
      track_condition: 'GOOD',
      obstacles_cleared: 0,
      obstacles_total: 0,
    },
    metrics: {
      velocity_mps: 15.2,
      heart_rate_bpm: 120,
      stamina_pct: 98.5,
      body_temp_c: 38,
      stride_length_m: 6.2,
      stride_freq_spm: 130,
      calories_kcal: 25.4,
    },
    alerts: {
      overload_warning: false,
      limp_detected: false,
      heat_stress: false,
    },
  });

  const issuedSession = (overrides: Record<string, unknown> = {}) => ({
    id: 'server-session-1',
    type: 'WORKOUT',
    status: 'PENDING',
    horseIds: ['horse-uuid-1'],
    actorUserId: mockActor.userId,
    startedAt: new Date(),
    workoutSession: eligibleWorkout(),
    ...overrides,
  });

  describe('backend-issued workout sessions', () => {
    it('creates one pending session and returns a simulator launch URL', async () => {
      const workout = eligibleWorkout();
      prisma.workoutSession.findUnique.mockResolvedValue(workout);
      prisma.simulatorSession.upsert.mockResolvedValue({
        id: 'server-session-1',
        status: 'PENDING',
        workoutSessionId: workout.id,
      });

      const result = await service.startWorkout(workout.id, mockActor);

      expect(result).toEqual({
        sessionId: 'server-session-1',
        status: 'PENDING',
        launchUrl: 'http://localhost:5175/?sessionId=server-session-1',
      });
      expect(prisma.simulatorSession.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workoutSessionId: workout.id },
          create: expect.objectContaining({
            id: expect.any(String),
            workoutSessionId: workout.id,
            actorUserId: mockActor.userId,
            horseIds: [workout.horse.id],
            status: 'PENDING',
          }),
        }),
      );
    });

    it('returns the same session when start is retried', async () => {
      const workout = eligibleWorkout();
      prisma.workoutSession.findUnique.mockResolvedValue(workout);
      prisma.simulatorSession.upsert.mockResolvedValue({
        id: 'server-session-1',
        status: 'PENDING',
        workoutSessionId: workout.id,
      });

      const first = await service.startWorkout(workout.id, mockActor);
      const retried = await service.startWorkout(workout.id, mockActor);

      expect(retried.sessionId).toBe(first.sessionId);
      expect(prisma.simulatorSession.upsert).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['missing workout', null, mockActor, 'WORKOUT_NOT_FOUND'],
      [
        'wrong role',
        eligibleWorkout(),
        { ...mockActor, role: Role.VETERINARIAN },
        'SIMULATOR_TRAINER_REQUIRED',
      ],
      [
        'another trainer workout',
        { ...eligibleWorkout(), trainingPlan: { id: 'plan-1', trainerUserId: 'trainer-2' } },
        mockActor,
        'WORKOUT_NOT_ASSIGNED',
      ],
      [
        'future workout',
        { ...eligibleWorkout(), scheduledDate: new Date(Date.now() + 60_000) },
        mockActor,
        'WORKOUT_NOT_STARTED',
      ],
      [
        'completed workout',
        { ...eligibleWorkout(), status: 'COMPLETED' },
        mockActor,
        'WORKOUT_NOT_SIMULATABLE',
      ],
      [
        'medical lock on heavy workout',
        {
          ...eligibleWorkout(),
          intensity: 'HIGH',
          horse: { ...eligibleWorkout().horse, isMedicalLocked: true },
        },
        mockActor,
        'MEDICAL_LOCK_ACTIVE',
      ],
    ])('rejects %s with a stable code', async (_name, workout, actor, code) => {
      prisma.workoutSession.findUnique.mockResolvedValue(workout);

      await expect(
        service.startWorkout('workout-1', actor as CurrentUserPayload),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code }),
      });
      expect(prisma.simulatorSession.upsert).not.toHaveBeenCalled();
    });

    it('returns only the assigned horse and workout context', async () => {
      const workout = eligibleWorkout();
      prisma.simulatorSession.findUnique.mockResolvedValue({
        id: 'server-session-1',
        status: 'PENDING',
        actorUserId: mockActor.userId,
        workoutSessionId: workout.id,
        workoutSession: workout,
      });

      const result = await service.getContext('server-session-1', mockActor);

      expect(result.sessionId).toBe('server-session-1');
      expect(result.horse.id).toBe(workout.horse.id);
      expect(result.workout).toEqual(
        expect.objectContaining({ id: workout.id, distanceMeters: 1200, trackSurface: 'TURF' }),
      );
    });
  });

  it('records one active snapshot without a telemetry DB row', async () => {
    prisma.simulatorSession.findUnique.mockResolvedValue(issuedSession());
    prisma.simulatorSession.update.mockResolvedValue({ ...issuedSession(), status: 'RUNNING' });

    const snapshot = await service.recordTelemetry(telemetryTick(), mockActor);

    expect(snapshot).toBeDefined();
    expect(snapshot.sessionId).toBe('server-session-1');
    expect(snapshot.horseIds).toEqual(['horse-uuid-1']);
    expect(prisma.simulatorSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'server-session-1' },
        data: expect.objectContaining({ status: 'RUNNING' }),
      }),
    );
    expect(prisma.simulatorSession.upsert).not.toHaveBeenCalled();
    expect(prisma.medicalLock.create).not.toHaveBeenCalled();
    expect(prisma.medicalRecord.create).not.toHaveBeenCalled();
  });

  it.each([
    ['missing session', null, telemetryTick(), mockActor, 'SIMULATOR_SESSION_NOT_FOUND'],
    [
      'different actor',
      issuedSession({ actorUserId: 'trainer-2' }),
      telemetryTick(),
      mockActor,
      'SIMULATOR_SESSION_FORBIDDEN',
    ],
    [
      'different horse',
      issuedSession(),
      { ...telemetryTick(), horse: { ...telemetryTick().horse, horse_id: 'horse-2' } },
      mockActor,
      'SIMULATOR_HORSE_MISMATCH',
    ],
    [
      'finished session',
      issuedSession({ status: 'COMPLETED' }),
      telemetryTick(),
      mockActor,
      'SIMULATOR_SESSION_FINISHED',
    ],
  ])('rejects telemetry for %s', async (_name, session, packet, actor, code) => {
    prisma.simulatorSession.findUnique.mockResolvedValue(session);

    await expect(service.recordTelemetry(packet, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code }),
    });
    expect(prisma.simulatorSession.update).not.toHaveBeenCalled();
    expect(prisma.simulatorSession.upsert).not.toHaveBeenCalled();
  });

  it('rechecks the medical lock before the first tick', async () => {
    const workout = eligibleWorkout();
    prisma.simulatorSession.findUnique.mockResolvedValue(
      issuedSession({
        workoutSession: {
          ...workout,
          intensity: 'HEAVY',
          horse: { ...workout.horse, isMedicalLocked: true },
        },
      }),
    );

    await expect(service.recordTelemetry(telemetryTick(), mockActor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MEDICAL_LOCK_ACTIVE' }),
    });
    expect(prisma.simulatorSession.update).not.toHaveBeenCalled();
  });

  it('finishes an issued session once and rejects a retry', async () => {
    const finishedWorkout = {
      event: 'sim:session_finished' as const,
      session_id: 'server-session-1',
      type: 'WORKOUT' as const,
      status: 'COMPLETED' as const,
      horse: {
        horse_id: 'horse-uuid-1',
        microchip_id: '985141000000001',
        lifecycle_status: 'IN_TRAINING',
        medical_lock: false,
      },
      surface: 'TURF',
      distance_planned_m: 1200,
      result: {
        finish_time_s: 72.4,
        avg_speed_mps: 16.5,
        top_speed_mps: 18.2,
        avg_heart_rate_bpm: 175,
        peak_heart_rate_bpm: 195,
        calories_total_kcal: 420,
      },
    };

    const now = new Date();
    const completedSession = {
      ...issuedSession(),
      type: 'WORKOUT',
      status: 'COMPLETED',
      finishedAt: now,
      result: finishedWorkout.result,
    };
    prisma.simulatorSession.findUnique
      .mockResolvedValueOnce(issuedSession({ status: 'RUNNING' }))
      .mockResolvedValueOnce(completedSession);
    prisma.simulatorSession.update.mockResolvedValue(completedSession);

    await service.recordFinished(finishedWorkout, mockActor);
    await expect(service.recordFinished(finishedWorkout, mockActor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SIMULATOR_SESSION_FINISHED' }),
    });

    expect(prisma.simulatorSession.update).toHaveBeenCalledTimes(1);
    expect(prisma.simulatorSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'server-session-1' } }),
    );
    expect(prisma.simulatorSession.upsert).not.toHaveBeenCalled();

    // Neither call touches medical locks or records
    expect(prisma.medicalLock.create).not.toHaveBeenCalled();
    expect(prisma.medicalRecord.create).not.toHaveBeenCalled();
  });

  it('lists newest persisted sessions with active memory snapshots', async () => {
    prisma.simulatorSession.findMany.mockResolvedValue([
      {
        id: 'WRK-20261021-001',
        type: 'WORKOUT',
        status: 'COMPLETED',
        horseIds: ['horse-uuid-1'],
        lastSnapshot: null,
        result: { finish_time_s: 72.4 },
        actorUserId: mockActor.userId,
        startedAt: new Date(Date.now() - 60000),
        finishedAt: new Date(),
        createdAt: new Date(Date.now() - 60000),
        updatedAt: new Date(),
      },
    ]);

    const result = await service.listRecent(20);

    expect(result).toHaveProperty('active');
    expect(result).toHaveProperty('recent');
    expect(Array.isArray(result.active)).toBe(true);
    expect(Array.isArray(result.recent)).toBe(true);
    expect(result.recent.length).toBe(1);
    expect(prisma.simulatorSession.findMany).toHaveBeenCalledWith({
      take: 20,
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('queries only running sessions for live monitoring', async () => {
    prisma.simulatorSession.findMany.mockResolvedValue([]);

    await service.listRecent(20, 'RUNNING');

    expect(prisma.simulatorSession.findMany).toHaveBeenCalledWith({
      where: { status: 'RUNNING' },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    });
  });
});
