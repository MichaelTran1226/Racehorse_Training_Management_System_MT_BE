import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { HorseStatus, PlanStatus, TrackSurface, WorkoutStatus } from '@prisma/client';
import { TrainingService } from './training.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CounterService } from '../audit/counter.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateWorkoutSessionDto } from './dto/create-workout-session.dto';
import {
  addDays,
  clubDate,
  clubTime,
  isHeavy,
  startOfClubDay,
  validatePhases,
  withinTrainingHours,
  workoutLoad,
} from './training-rules';
import { notificationsMock } from '../notifications/notifications.testing';

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
  const phase = {
    id: 'ph-1',
    name: 'Base',
    type: 'BASE',
    startDate: clubDate(addDays(today, -1)),
    endDate: clubDate(addDays(today, 30)),
    sessionsPerWeek: 5,
    maxWeeklyDistance: 9000,
    surface: 'TURF',
  };
  const draftPlan = {
    id: 'plan-1',
    phases: [phase],
    horseId: 'horse-1',
    phaseName: 'Base phase',
    status: PlanStatus.DRAFT,
    startDate: addDays(today, -1),
    endDate: addDays(today, 30),
  };
  const workoutDto: CreateWorkoutSessionDto = {
    scheduledDate: tomorrow0630.toISOString(),
    phaseId: 'ph-1',
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
        groupBy: jest.fn().mockResolvedValue([]),
      },
      medicalLock: { findMany: jest.fn().mockResolvedValue([]) },
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: CounterService, useValue: { next: jest.fn().mockResolvedValue(45) } },
        notificationsMock(),
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

  describe('phase rules (SC-2.03)', () => {
    const base = {
      name: 'Base',
      type: 'BASE',
      startDate: '2026-11-01',
      endDate: '2026-11-14',
      sessionsPerWeek: 5,
      maxWeeklyDistance: 9000,
      surface: 'TURF',
    };

    it('sorts phases and rejects overlap, out-of-plan dates and bad quotas', () => {
      const ok = validatePhases(
        [{ ...base, name: 'Speed', startDate: '2026-11-15', endDate: '2026-11-30' }, base],
        '2026-11-01',
        '2026-11-30',
      );
      expect('phases' in ok && ok.phases.map((p) => p.name)).toEqual(['Base', 'Speed']);
      const overlap = validatePhases(
        [base, { ...base, name: 'Speed', startDate: '2026-11-10' }],
        '2026-11-01',
        '2026-11-30',
      );
      expect('code' in overlap && overlap.code).toBe('PHASE_OVERLAP');
      const outside = validatePhases([base], '2026-11-05', '2026-11-30');
      expect('code' in outside && outside.code).toBe('INVALID_PHASE');
      const quota = validatePhases([{ ...base, sessionsPerWeek: 20 }], '2026-11-01', '2026-11-30');
      expect('code' in quota && quota.message).toContain('Số buổi mỗi tuần');
    });

    it('workout load = km × reps × intensity factor', () => {
      expect(workoutLoad({ distanceMeters: 1200, repetitions: 2, intensity: 'HEAVY' })).toBe(7.2);
      expect(
        workoutLoad({
          distanceMeters: 1200,
          repetitions: 2,
          actualDistanceMeters: 2000,
          intensity: 'LIGHT',
        }),
      ).toBe(2);
    });
  });

  describe('createPlan', () => {
    const dto = {
      horseId: 'horse-1',
      phaseName: 'Base phase',
      objective: 'Build the aerobic base before speed work',
      trackSurface: TrackSurface.TURF,
      startDate: clubDate(today),
      endDate: clubDate(addDays(today, 30)),
      phases: [{ ...phase, id: undefined, startDate: clubDate(today) }],
    };

    it('gives the plan a GA- code from the counter', async () => {
      prisma.horse.findUnique.mockResolvedValue(healthyHorse);
      prisma.trainingPlan.create.mockResolvedValue({ ...draftPlan, horse: healthyHorse });
      await service.createPlan(dto, trainer);
      expect(prisma.trainingPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ planCode: 'GA-000045' }) }),
      );
    });

    it('rejects a start date more than 7 days ago and plans longer than 52 weeks', async () => {
      prisma.horse.findUnique.mockResolvedValue(healthyHorse);
      expect(
        await codeOf(
          service.createPlan({ ...dto, startDate: clubDate(addDays(today, -10)) }, trainer),
        ),
      ).toBe('START_DATE_TOO_EARLY');
      expect(
        await codeOf(
          service.createPlan({ ...dto, endDate: clubDate(addDays(today, 400)) }, trainer),
        ),
      ).toBe('PLAN_TOO_LONG');
    });

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
        .createPlan({ ...dto, startDate: clubDate(addDays(today, 40)) }, trainer)
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

  describe('phases, warnings and weekly repeat (DL-2.01)', () => {
    beforeEach(() => {
      prisma.trainingPlan.findUnique.mockResolvedValue(draftPlan);
      prisma.horse.findUnique.mockResolvedValue(healthyHorse);
    });

    it('requires a phase and a date inside it', async () => {
      expect(
        await codeOf(service.createWorkout('plan-1', { ...workoutDto, phaseId: 'nope' }, trainer)),
      ).toBe('PHASE_REQUIRED');
      prisma.trainingPlan.findUnique.mockResolvedValue({
        ...draftPlan,
        phases: [{ ...phase, endDate: clubDate(today) }],
      });
      expect(await codeOf(service.createWorkout('plan-1', workoutDto, trainer))).toBe(
        'OUTSIDE_PHASE_DATES',
      );
    });

    it('asks to confirm warnings (weekly quota exceeded), then saves on the second click', async () => {
      prisma.workoutSession.findMany.mockResolvedValue([{ distanceMeters: 8500, repetitions: 1 }]);
      const error = await service.createWorkout('plan-1', workoutDto, trainer).catch((e) => e);
      expect(error.getResponse().code).toBe('WARNINGS_NEED_CONFIRMATION');
      expect(error.getResponse().data.warnings[0]).toContain('vượt định mức 9000 m');
      expect(prisma.workoutSession.create).not.toHaveBeenCalled();

      await service.createWorkout('plan-1', { ...workoutDto, acknowledgeWarnings: true }, trainer);
      expect(prisma.workoutSession.create).toHaveBeenCalled();
    });

    it('warns when the groom already has a workout at the same time', async () => {
      prisma.workoutSession.findFirst.mockResolvedValue({ id: 'w-other' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'groom-1',
        fullName: 'John',
        role: 'GROOM',
        status: 'ACTIVE',
      });
      const error = await service.createWorkout('plan-1', workoutDto, trainer).catch((e) => e);
      expect(error.getResponse().data.warnings).toContain(
        'Nhân viên John đã có buổi tập trùng giờ.',
      );
    });

    it('weekly repeat creates the matching days and reports skipped ones', async () => {
      // Ngày đầu đã có 3 buổi -> bị bỏ qua, các ngày còn lại tạo được
      prisma.workoutSession.count.mockResolvedValueOnce(3).mockResolvedValue(0);
      const res = await service.createRepeatWorkouts(
        'plan-1',
        { ...workoutDto, weekdays: [1, 2, 3, 4, 5, 6, 7], until: clubDate(addDays(today, 3)) },
        trainer,
      );
      expect(res.created).toBe(2);
      expect(res.skipped).toEqual([
        { date: clubDate(addDays(today, 1)), reason: 'Mỗi ngựa tối đa 3 buổi tập mỗi ngày.' },
      ]);
    });

    it('weekly repeat refuses more than 60 workouts', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue({
        ...draftPlan,
        endDate: addDays(today, 200),
        phases: [{ ...phase, endDate: clubDate(addDays(today, 200)) }],
      });
      expect(
        await codeOf(
          service.createRepeatWorkouts(
            'plan-1',
            {
              ...workoutDto,
              weekdays: [1, 2, 3, 4, 5, 6, 7],
              until: clubDate(addDays(today, 100)),
            },
            trainer,
          ),
        ),
      ).toBe('TOO_MANY_REPEATS');
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
        phaseId: 'ph-1',
        distanceMeters: 1000,
        repetitions: 1,
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
    const result = {
      actualDistanceMeters: 1200,
      actualTimeSeconds: 80,
      performanceScore: 8,
      completionLevel: 'ACHIEVED',
      trainerNotes: 'Strong finish, relaxed in the turn.',
    };
    const started = {
      id: 'w-1',
      status: WorkoutStatus.SCHEDULED,
      workoutType: 'CANTER',
      trackSurface: 'TURF',
      scheduledDate: new Date(Date.now() - 60 * 60 * 1000),
      resultRecordedAt: null,
      abnormalSigns: false,
    };

    it('only after the workout has started', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue({
        ...started,
        scheduledDate: tomorrow0630,
      });
      expect(await codeOf(service.recordResult('w-1', result, trainer))).toBe(
        'WORKOUT_NOT_STARTED',
      );
    });

    it('computes average speed and records who saved the result', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue(started);
      await service.recordResult('w-1', result, trainer);
      expect(prisma.workoutSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: WorkoutStatus.COMPLETED,
            averageSpeedKmh: 54, // 1200 m / 80 s × 3.6
            resultNotes: 'Strong finish, relaxed in the turn.',
            resultRecordedById: 'trainer-1',
            resultRecordedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('needs a running time except for walk / swim / treadmill', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue(started);
      const noTime = { ...result, actualTimeSeconds: undefined };
      expect(await codeOf(service.recordResult('w-1', noTime, trainer))).toBe('TIME_REQUIRED');
      prisma.workoutSession.findUnique.mockResolvedValue({ ...started, workoutType: 'WALK' });
      expect(await codeOf(service.recordResult('w-1', noTime, trainer))).toBe('OK');
    });

    it('recovery heart rate cannot exceed peak heart rate', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue(started);
      expect(
        await codeOf(
          service.recordResult(
            'w-1',
            { ...result, heartRatePeak: 150, heartRateRecovery: 160 },
            trainer,
          ),
        ),
      ).toBe('RECOVERY_ABOVE_PEAK');
    });

    it('abnormal signs need a description and become a VET alert', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue(started);
      expect(
        await codeOf(
          service.recordResult('w-1', { ...result, abnormalSignTypes: ['LAMENESS'] }, trainer),
        ),
      ).toBe('ABNORMAL_NOTES_REQUIRED');
      await service.recordResult(
        'w-1',
        {
          ...result,
          abnormalSignTypes: ['LAMENESS'],
          abnormalNotes: 'Đi khập khiễng chân trước trái',
        },
        trainer,
      );
      expect(prisma.workoutSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ abnormalSigns: true, abnormalSignTypes: ['LAMENESS'] }),
        }),
      );
    });

    it('editing within 48 hours stores who edited; after 48 hours it is refused', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue({
        ...started,
        status: WorkoutStatus.COMPLETED,
        resultRecordedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      });
      await service.recordResult('w-1', result, trainer);
      expect(prisma.workoutSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ resultUpdatedById: 'trainer-1' }),
        }),
      );
      prisma.workoutSession.findUnique.mockResolvedValue({
        ...started,
        status: WorkoutStatus.COMPLETED,
        resultRecordedAt: new Date(Date.now() - 50 * 60 * 60 * 1000),
      });
      expect(await codeOf(service.recordResult('w-1', result, trainer))).toBe(
        'RESULT_EDIT_EXPIRED',
      );
    });

    it('a MISSED workout can be recorded late within 7 days only', async () => {
      prisma.workoutSession.findUnique.mockResolvedValue({
        ...started,
        status: WorkoutStatus.MISSED,
        scheduledDate: addDays(today, -10),
      });
      expect(await codeOf(service.recordResult('w-1', result, trainer))).toBe(
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
      const res = await service.getFitnessMetrics('horse-1', trainer);
      expect(res.points).toEqual([]);
      expect(res.summary.bestAvgSpeed).toBeNull();
    });

    it('fitness: speed only for running workouts, load per workout and lock bands', async () => {
      prisma.horse.findUnique.mockResolvedValue(healthyHorse);
      prisma.workoutSession.findMany.mockResolvedValue([
        {
          id: 'w-a',
          scheduledDate: addDays(today, -3),
          workoutType: 'WALK',
          intensity: 'LIGHT',
          distanceMeters: 2000,
          repetitions: 1,
          actualDistanceMeters: 2000,
          averageSpeedKmh: 7,
          performanceScore: 7,
          abnormalSigns: false,
        },
        {
          id: 'w-b',
          scheduledDate: addDays(today, -2),
          workoutType: 'BREEZE',
          intensity: 'HEAVY',
          distanceMeters: 800,
          repetitions: 2,
          actualDistanceMeters: null,
          averageSpeedKmh: 55.2,
          performanceScore: 9,
          abnormalSigns: false,
        },
      ]);
      prisma.medicalLock.findMany.mockResolvedValue([
        { lockedAt: addDays(today, -20), unlockedAt: addDays(today, -15) },
      ]);
      const res = await service.getFitnessMetrics('horse-1', trainer, 4);
      expect(res.points.map((p: any) => p.avgSpeedKmh)).toEqual([null, 55.2]);
      expect(res.points.map((p: any) => p.load)).toEqual([2, 4.8]); // 2 km × 1; 0.8 km × 2 × 3
      expect(res.summary.bestAvgSpeed?.value).toBe(55.2);
      expect(res.lockPeriods).toHaveLength(1);
    });

    it('overview flags a sudden load increase (> 130% of the 4-week weekly average)', async () => {
      prisma.horse.findMany = jest.fn().mockResolvedValue([healthyHorse]);
      prisma.trainingPlan.findMany.mockResolvedValue([
        {
          id: 'plan-1',
          horseId: 'horse-1',
          planCode: 'GA-000001',
          phaseName: 'Base',
          phases: [phase],
        },
      ]);
      const done = (days: number, km: number) => ({
        horseId: 'horse-1',
        scheduledDate: addDays(new Date(), -days),
        distanceMeters: km * 1000,
        repetitions: 1,
        actualDistanceMeters: null,
        intensity: 'MEDIUM',
        performanceScore: 8,
      });
      // 4 tuần trước: mỗi tuần 2 km × 2 = 4 điểm; 7 ngày gần nhất: 10 km × 2 = 20 điểm
      prisma.workoutSession.findMany
        .mockResolvedValueOnce([done(30, 2), done(23, 2), done(16, 2), done(9, 2), done(2, 10)])
        .mockResolvedValueOnce([]);
      const res = await service.getOverview();
      expect(res.rows[0].load7d).toBe(20);
      expect(res.rows[0].loadSpike).toBe(true);
      expect(res.rows[0].currentPhase?.name).toBe('Base');
      expect(res.kpis.loadSpikeHorses).toBe(1);
    });
  });
});
