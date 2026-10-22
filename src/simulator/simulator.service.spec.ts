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
    const telemetryTick = {
      event: 'sim:telemetry_tick' as const,
      session_id: 'WRK-20261021-001',
      timestamp_ms: 1729520000000,
      sim_time_s: 1.0,
      sim_speed_multiplier: 1.0,
      horse: {
        horse_id: 'horse-uuid-1',
        microchip_id: '985141000000001',
        lifecycle_status: 'IN_TRAINING',
        medical_lock: false,
      },
      track: {
        surface: 'TURF',
        target_distance_m: 1200,
        covered_distance_m: 15.2,
        track_condition: 'FAST',
        obstacles_cleared: 0,
        obstacles_total: 0,
      },
      metrics: {
        velocity_mps: 15.2,
        heart_rate_bpm: 120,
        stamina_pct: 98.5,
        body_temp_c: 38.0,
        stride_length_m: 6.2,
        stride_freq_spm: 130,
        calories_kcal: 25.4,
      },
      alerts: [],
    };

    const snapshot = await service.recordTelemetry(telemetryTick, mockActor);

    expect(snapshot).toBeDefined();
    expect(snapshot.sessionId).toBe('WRK-20261021-001');
    expect(snapshot.horseIds).toEqual(['horse-uuid-1']);
    // Telemetry tick updates memory snapshot and upserts session metadata, but stores no per-tick DB rows
    expect(prisma.simulatorSession.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.medicalLock.create).not.toHaveBeenCalled();
    expect(prisma.medicalRecord.create).not.toHaveBeenCalled();
  });

  it('upserts one finished session when the packet is retried', async () => {
    const finishedWorkout = {
      event: 'sim:session_finished' as const,
      session_id: 'WRK-20261021-001',
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
    prisma.simulatorSession.upsert.mockResolvedValue({
      id: 'WRK-20261021-001',
      type: 'WORKOUT',
      status: 'COMPLETED',
      horseIds: ['horse-uuid-1'],
      actorUserId: mockActor.userId,
      finishedAt: now,
      result: finishedWorkout.result,
    });

    // Send packet twice (retry scenario)
    await service.recordFinished(finishedWorkout, mockActor);
    await service.recordFinished(finishedWorkout, mockActor);

    expect(prisma.simulatorSession.upsert).toHaveBeenCalledTimes(2);
    // Both calls target the exact same session_id primary key
    const firstCallArg = prisma.simulatorSession.upsert.mock.calls[0][0];
    const secondCallArg = prisma.simulatorSession.upsert.mock.calls[1][0];
    expect(firstCallArg.where.id).toBe('WRK-20261021-001');
    expect(secondCallArg.where.id).toBe('WRK-20261021-001');

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
});
