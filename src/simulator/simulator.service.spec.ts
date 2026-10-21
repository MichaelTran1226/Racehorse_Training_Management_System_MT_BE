import { Test, TestingModule } from '@nestjs/testing';
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
      ],
    }).compile();

    service = module.get<SimulatorService>(SimulatorService);
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
