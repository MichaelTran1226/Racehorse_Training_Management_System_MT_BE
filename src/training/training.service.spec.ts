import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { HorseStatus, PlanStatus, TrackSurface, WorkoutStatus } from '@prisma/client';
import { TrainingService } from './training.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateWorkoutSessionDto } from './dto/create-workout-session.dto';
import { addDays, clubTime, isHeavy, startOfClubDay, withinTrainingHours } from './training-rules';

/** Mã lỗi (code) của lời hứa bị từ chối. */
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e: any) {
    return e.getResponse?.().code ?? e.message;
  }
}

describe('TrainingService (Flow 2 & RULE-MED-01)', () => {
  let service: TrainingService;
  let prisma: any;
  let audit: any;

  const trainer: CurrentUserPayload = {
    userId: 'trainer-1',
    email: 'trainer@gmail.com',
    fullName: 'Head Trainer David',
    role: UserRole.HEAD_TRAINER,
  };
  const owner: CurrentUserPayload = {
    userId: 'owner-1',
    email: 'owner@gmail.com',
    fullName: 'Robert Sterling',
    role: UserRole.HORSE_OWNER,
  };

  const today = startOfClubDay(new Date());
  // 06:30 sáng mai theo giờ câu lạc bộ
  const tomorrow0630 = new Date(addDays(today, 1).getTime() + 6.5 * 60 * 60 * 1000);

  const healthyHorse = {
    id: 'horse-1',
    name: 'Thunder',
    horseCode: 'HR-000001',
    status: HorseStatus.RESTING,
    isMedicalLocked: false,
    deletedAt: null,
  };
  const draftPlan = {
    id: 'plan-1',
    horseId: 'horse-1',
    phaseName: 'Base phase',
    status: PlanStatus.DRAFT,
    startDate: addDays(today, -1),
    endDate: addDays(today, 30),
  };
  const workoutDto: CreateWorkoutSessionDto = {
    scheduledDate: tomorrow0630.toISOString(),
    workoutType: 'CANTER',
    intensity: 'MEDIUM',
    distanceMeters: 1200,
    trackSurface: 'TURF',
    assignedStaffUserId: 'groom-1',
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
      ),
      $queryRaw: jest.fn().mockResolvedValue([]),
      horse: { findUnique: jest.fn(), update: jest.fn() },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'groom-1', role: 'GROOM', status: 'ACTIVE' }),
        findMany: jest.fn(),
      },
      trainingPlan: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn().mockImplementation(({ data }: any) => ({ ...draftPlan, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      workoutSession: {
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'w-new', ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => ({ id: 'w-1', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get<TrainingService>(TrainingService);
  });

  describe('training-rules', () => {
    it('BREEZE and TRIAL are always heavy; LIGHT walk is not', () => {
      expect(isHeavy('BREEZE', 'LIGHT')).toBe(true);
      expect(isHeavy('TRIAL', 'MEDIUM')).toBe(true);
      expect(isHeavy('CANTER', 'HEAVY')).toBe(true);
      expect(isHeavy('WALK', 'LIGHT')).toBe(false);
    });

    it('uses club time (UTC+7) for the 04:00-20:00 window', () => {
      expect(clubTime(new Date('2026-10-15T00:00:00Z'))).toEqual({ hour: 7, minute: 0 });
      expect(withinTrainingHours(new Date('2026-10-14T21:00:00Z'))).toBe(true); // 04:00
      expect(withinTrainingHours(new Date('2026-10-14T20:59:00Z'))).toBe(false); // 03:59
      expect(withinTrainingHours(new Date('2026-10-15T13:00:00Z'))).toBe(true); // 20:00
      expect(withinTrainingHours(new Date('2026-10-15T13:15:00Z'))).toBe(false); // 20:15
      expect(startOfClubDay(new Date('2026-10-15T18:00:00Z')).toISOString()).toBe(
        '2026-10-15T17:00:00.000Z',
      );
    });
  });

  describe('createPlan', () => {
    const dto = {
      horseId: 'horse-1',
      phaseName: 'Base phase',
      trackSurface: TrackSurface.TURF,
      startDate: '2026-10-01',
      endDate: '2026-11-01',
      phases: [{ order: 1, name: 'Phase 1' }],
    };

    it('always creates a DRAFT and does not touch the horse status', async () => {
      prisma.horse.findUnique.mockResolvedValue({ ...healthyHorse, isMedicalLocked: true });
      prisma.trainingPlan.create.mockResolvedValue({ ...draftPlan, horse: healthyHorse });

      await service.createPlan(dto, trainer);

      expect(prisma.trainingPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: PlanStatus.DRAFT }) }),
      );
      expect(prisma.horse.update).not.toHaveBeenCalled();
    });

    it('rejects a retired horse and a plan without phases', async () => {
      prisma.horse.findUnique.mockResolvedValue({ ...healthyHorse, status: HorseStatus.RETIRED });
      expect(await codeOf(service.createPlan(dto, trainer))).toBe('HORSE_RETIRED');

      prisma.horse.findUnique.mockResolvedValue(healthyHorse);
      expect(await codeOf(service.createPlan({ ...dto, phases: [] }, trainer))).toBe(
        'PHASES_REQUIRED',
      );
    });

    it('rejects start date after end date', async () => {
      prisma.horse.findUnique.mockResolvedValue(healthyHorse);
      const error = await service
        .createPlan({ ...dto, startDate: '2026-12-01' }, trainer)
        .catch((e) => e);
      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.getResponse().code).toBe('INVALID_DATE_RANGE');
    });
  });

  describe('changePlanStatus - activate (DL-2.02)', () => {
    beforeEach(() => {
      prisma.trainingPlan.findUnique.mockResolvedValue(draftPlan);
      prisma.horse.findUnique.mockResolvedValue(healthyHorse);
      prisma.workoutSession.count.mockResolvedValue(2);
    });

    it('blocks activation while the horse is under a training lock', async () => {
      prisma.horse.findUnique.mockResolvedValue({ ...healthyHorse, isMedicalLocked: true });
      expect(await codeOf(service.changePlanStatus('plan-1', { status: 'ACTIVE' }, trainer))).toBe(
        'MEDICAL_LOCK_ACTIVE',
      );
      expect(prisma.trainingPlan.update).not.toHaveBeenCalled();
    });

    it('needs at least one workout', async () => {
      prisma.workoutSession.count.mockResolvedValue(0);
      expect(await codeOf(service.changePlanStatus('plan-1', { status: 'ACTIVE' }, trainer))).toBe(
        'PLAN_HAS_NO_WORKOUTS',
      );
    });

    it('allows only one active plan per horse', async () => {
      prisma.trainingPlan.findFirst.mockResolvedValue({ id: 'plan-2', phaseName: 'Other' });
      expect(await codeOf(service.changePlanStatus('plan-1', { status: 'ACTIVE' }, trainer))).toBe(
        'HORSE_HAS_ACTIVE_PLAN',
      );
    });

    it('asks for VET confirmation when the horse is in a medical status', async () => {
      prisma.horse.findUnique.mockResolvedValue({ ...healthyHorse, status: HorseStatus.INJURED });
      expect(await codeOf(service.changePlanStatus('plan-1', { status: 'ACTIVE' }, trainer))).toBe(
        'VET_CONFIRMATION_REQUIRED',
      );
      expect(
        await codeOf(
          service.changePlanStatus('plan-1', { status: 'ACTIVE', vetConsulted: true }, trainer),
        ),
      ).toBe('OK');
    });

    it('activates and optionally moves a resting horse to IN_TRAINING', async () => {
      await service.changePlanStatus(
        'plan-1',
        { status: 'ACTIVE', moveHorseToTraining: true },
        trainer,
      );
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2); // khóa dòng giáo án + ngựa
      expect(prisma.trainingPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ACTIVE' } }),
      );
      expect(prisma.horse.update).toHaveBeenCalledWith({
        where: { id: 'horse-1' },
        data: { status: HorseStatus.IN_TRAINING },
      });
    });
  });

  describe('changePlanStatus - cancel / complete', () => {
    it('cancel needs a reason and cancels pending workouts', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue({ ...draftPlan, status: PlanStatus.ACTIVE });
      prisma.horse.findUnique.mockResolvedValue(healthyHorse);
      expect(
        await codeOf(service.changePlanStatus('plan-1', { status: 'CANCELLED' }, trainer)),
      ).toBe('REASON_REQUIRED');

      prisma.workoutSession.updateMany.mockResolvedValue({ count: 3 });
      const res = await service.changePlanStatus(
        'plan-1',
        { status: 'CANCELLED', reason: 'Ngựa chuyển sang giáo án khác' },
        trainer,
      );
      expect(res.cancelledWorkouts).toBe(3);
      expect(prisma.workoutSession.updateMany).toHaveBeenCalledWith({
        where: {
          trainingPlanId: 'plan-1',
          status: { in: [WorkoutStatus.SCHEDULED, WorkoutStatus.BLOCKED, WorkoutStatus.MISSED] },
        },
        data: { status: WorkoutStatus.CANCELLED, statusReason: 'Giáo án đã kết thúc' },
      });
    });

    it('only an ACTIVE plan can be completed', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue(draftPlan);
      prisma.horse.findUnique.mockResolvedValue(healthyHorse);
      expect(
        await codeOf(
          service.changePlanStatus(
            'plan-1',
            { status: 'COMPLETED', summary: 'Hoàn thành tốt mục tiêu' },
            trainer,
          ),
        ),
      ).toBe('INVALID_PLAN_TRANSITION');
    });
  });

  describe('createWorkout (DL-2.01, RULE-MED-01)', () => {
    beforeEach(() => {
      prisma.trainingPlan.findUnique.mockResolvedValue(draftPlan);
      prisma.horse.findUnique.mockResolvedValue(healthyHorse);
    });

    it('blocks a heavy workout while locked, but allows a light walk', async () => {
      prisma.horse.findUnique.mockResolvedValue({ ...healthyHorse, isMedicalLocked: true });
      expect(
        await codeOf(
          service.createWorkout(
            'plan-1',
            { ...workoutDto, workoutType: 'BREEZE', targetSpeedKmh: 55, jockeyName: 'An' },
            trainer,
          ),
        ),
      ).toBe('MEDICAL_LOCK_ACTIVE');

      const ok = await service.createWorkout(
        'plan-1',
        { ...workoutDto, workoutType: 'WALK', intensity: 'LIGHT' },
        trainer,
      );
      expect(ok.status).toBe(WorkoutStatus.SCHEDULED);
      expect(prisma.$queryRaw).toHaveBeenCalled(); // khóa dòng ngựa trước khi kiểm
    });

    it('forces BREEZE / TRIAL to HEAVY and needs speed + jockey', async () => {
      expect(
        await codeOf(
          service.createWorkout('plan-1', { ...workoutDto, workoutType: 'TRIAL' }, trainer),
        ),
      ).toBe('TARGET_SPEED_REQUIRED');

      const w = await service.createWorkout(
        'plan-1',
        {
          ...workoutDto,
          workoutType: 'BREEZE',
          intensity: 'LIGHT',
          targetSpeedKmh: 55,
          jockeyName: 'An',
        },
        trainer,
      );
      expect(w.intensity).toBe('HEAVY');
    });

    it('rejects times outside 04:00-20:00 and past dates', async () => {
      const night = new Date(addDays(today, 1).getTime() + 22 * 60 * 60 * 1000).toISOString();
      expect(
        await codeOf(
          service.createWorkout('plan-1', { ...workoutDto, scheduledDate: night }, trainer),
        ),
      ).toBe('OUTSIDE_TRAINING_HOURS');

      const past = new Date(addDays(today, -1).getTime() + 7 * 60 * 60 * 1000).toISOString();
      expect(
        await codeOf(
          service.createWorkout('plan-1', { ...workoutDto, scheduledDate: past }, trainer),
        ),
      ).toBe('DATE_IN_PAST');
    });

    it('allows at most 3 workouts per horse per day', async () => {
      prisma.workoutSession.count.mockResolvedValue(3);
      expect(await codeOf(service.createWorkout('plan-1', workoutDto, trainer))).toBe(
        'MAX_WORKOUTS_PER_DAY',
      );
    });

    it('rejects a trial on the same surface within 15 minutes', async () => {
      prisma.workoutSession.findFirst.mockResolvedValue({ id: 'w-x', horse: { name: 'Bolt' } });
      expect(
        await codeOf(
          service.createWorkout(
            'plan-1',
            { ...workoutDto, workoutType: 'TRIAL', targetSpeedKmh: 60, jockeyName: 'An' },
            trainer,
          ),
        ),
      ).toBe('TRIAL_SLOT_TAKEN');
    });

    it('needs VET confirmation for a heavy workout when the horse is in a medical status', async () => {
      prisma.horse.findUnique.mockResolvedValue({
        ...healthyHorse,
        status: HorseStatus.UNDER_OBSERVATION,
      });
      const heavy = { ...workoutDto, intensity: 'HEAVY' };
      expect(await codeOf(service.createWorkout('plan-1', heavy, trainer))).toBe(
        'VET_CONFIRMATION_REQUIRED',
      );
      const w = await service.createWorkout('plan-1', { ...heavy, vetConsulted: true }, trainer);
      expect(w.medicalOverride).toBe(true);
    });

    it('rejects a closed plan and a non-groom assignee', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue({
        ...draftPlan,
        status: PlanStatus.COMPLETED,
      });
      expect(await codeOf(service.createWorkout('plan-1', workoutDto, trainer))).toBe(
        'PLAN_CLOSED',
      );

      prisma.trainingPlan.findUnique.mockResolvedValue(draftPlan);
      prisma.user.findUnique.mockResolvedValue({ id: 'x', role: 'VETERINARIAN', status: 'ACTIVE' });
      expect(await codeOf(service.createWorkout('plan-1', workoutDto, trainer))).toBe(
        'INVALID_GROOM',
      );
    });
  });

  describe('restoreWorkout (DL-2.07)', () => {
    it('cannot restore a heavy workout while the lock is still on', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue({
        id: 'w-1',
        horseId: 'horse-1',
        status: WorkoutStatus.BLOCKED,
        scheduledDate: tomorrow0630,
        workoutType: 'BREEZE',
        intensity: 'HEAVY',
        trackSurface: 'TURF',
        targetSpeedKmh: 55,
        jockeyName: 'An',
        assignedStaffUserId: 'groom-1',
        medicalOverride: false,
        trainingPlan: { ...draftPlan, status: PlanStatus.ACTIVE },
      });
      prisma.horse.findUnique.mockResolvedValue({ ...healthyHorse, isMedicalLocked: true });
      expect(await codeOf(service.restoreWorkout('w-1', {}, trainer))).toBe('MEDICAL_LOCK_ACTIVE');

      prisma.horse.findUnique.mockResolvedValue(healthyHorse);
      const restored = await service.restoreWorkout('w-1', {}, trainer);
      expect(restored.status).toBe(WorkoutStatus.SCHEDULED);
    });
  });

  describe('recordResult (SC-2.06)', () => {
    it('only after the workout has started', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue({
        id: 'w-1',
        status: WorkoutStatus.SCHEDULED,
        scheduledDate: tomorrow0630,
      });
      expect(await codeOf(service.recordResult('w-1', { performanceScore: 8 }, trainer))).toBe(
        'WORKOUT_NOT_STARTED',
      );
    });

    it('abnormal signs need a description and become a VET alert', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue({
        id: 'w-1',
        status: WorkoutStatus.SCHEDULED,
        scheduledDate: new Date(Date.now() - 60 * 60 * 1000),
        resultRecordedAt: null,
      });
      expect(await codeOf(service.recordResult('w-1', { abnormalSigns: true }, trainer))).toBe(
        'ABNORMAL_NOTES_REQUIRED',
      );
      await service.recordResult(
        'w-1',
        { abnormalSigns: true, abnormalNotes: 'Đi khập khiễng chân trước trái' },
        trainer,
      );
      expect(prisma.workoutSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: WorkoutStatus.COMPLETED,
            abnormalSigns: true,
            resultRecordedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('a MISSED workout can be recorded late within 7 days only', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue({
        id: 'w-1',
        status: WorkoutStatus.MISSED,
        scheduledDate: addDays(today, -10),
      });
      expect(await codeOf(service.recordResult('w-1', { performanceScore: 7 }, trainer))).toBe(
        'LATE_RESULT_EXPIRED',
      );
    });
  });

  describe('scoping and automatic jobs', () => {
    it('scopes plans to owned horses for a HORSE_OWNER', async () => {
      await service.findAllPlans({}, owner);
      expect(prisma.trainingPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ horse: { deletedAt: null, ownerId: 'owner-1' } }),
        }),
      );
    });

    it('marks overdue scheduled workouts as MISSED', async () => {
      await service.sweepOverdue();
      expect(prisma.workoutSession.updateMany).toHaveBeenCalledWith({
        where: { status: WorkoutStatus.SCHEDULED, scheduledDate: { lt: addDays(today, -1) } },
        data: { status: WorkoutStatus.MISSED },
      });
    });

    it('returns no fitness points (instead of made-up data) when nothing is completed', async () => {
      prisma.horse.findUnique.mockResolvedValue(healthyHorse);
      prisma.workoutSession.findMany.mockResolvedValue([]);
      expect(await service.getFitnessMetrics('horse-1', trainer)).toEqual([]);
    });
  });
});
