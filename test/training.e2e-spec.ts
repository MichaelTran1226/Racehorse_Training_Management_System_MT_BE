import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Flow 2 training HTTP contract (mock database, real JWT/guards)', () => {
  let app: INestApplication;
  const user = {
    id: 'actor',
    email: 'trainer@gmail.com',
    fullName: 'Head Trainer',
    role: Role.HEAD_TRAINER as Role,
    status: UserStatus.ACTIVE,
    permissions: null as unknown,
  };
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(user)),
      findFirst: jest.fn().mockResolvedValue(user),
    },
    trainingPlan: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
    },
    workoutSession: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn((arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    ),
  };
  const token = () =>
    app
      .get(JwtService)
      .sign({ sub: user.id, email: user.email, role: user.role, fullName: user.fullName });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    user.role = Role.HEAD_TRAINER;
    user.permissions = null;
  });
  afterAll(async () => {
    await app.close();
  });

  it.each([Role.CLUB_MANAGER, Role.VETERINARIAN, Role.GROOM, Role.HORSE_OWNER])(
    'only the Head Trainer creates plans (%s gets 403)',
    async (role) => {
      user.role = role;
      await request(app.getHttpServer())
        .post('/api/training/plans')
        .auth(token(), { type: 'bearer' })
        .send({})
        .expect(403);
      expect(prisma.trainingPlan.create).not.toHaveBeenCalled();
    },
  );

  it('a Groom can no longer write workout results', async () => {
    user.role = Role.GROOM;
    await request(app.getHttpServer())
      .post('/api/training/workouts/w-1/result')
      .auth(token(), { type: 'bearer' })
      .send({ performanceScore: 8 })
      .expect(403);
  });

  it('a Groom only sees workouts assigned to them', async () => {
    user.role = Role.GROOM;
    await request(app.getHttpServer())
      .get('/api/training/workouts')
      .auth(token(), { type: 'bearer' })
      .expect(200);
    expect(prisma.workoutSession.findMany.mock.calls[0][0].where.assignedStaffUserId).toBe('actor');
  });

  it('trial runs are not visible to a Horse Owner', async () => {
    user.role = Role.HORSE_OWNER;
    await request(app.getHttpServer())
      .get('/api/training/trial-runs')
      .auth(token(), { type: 'bearer' })
      .expect(403);
  });

  it('cancelling a workout requires a valid reason code', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/training/workouts/w-1/cancel')
      .auth(token(), { type: 'bearer' })
      .send({ reason: 'BORED' })
      .expect(400);
    expect(JSON.stringify(response.body)).toContain('Vui lòng chọn lý do');
    expect(prisma.workoutSession.findUnique).not.toHaveBeenCalled();
  });

  it.each([Role.GROOM, Role.HORSE_OWNER])(
    'the training overview is not shown to %s',
    async (role) => {
      user.role = role;
      await request(app.getHttpServer())
        .get('/api/training/overview')
        .auth(token(), { type: 'bearer' })
        .expect(403);
    },
  );

  it('weekly repeat needs at least one weekday', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/training/plans/p-1/workouts/repeat')
      .auth(token(), { type: 'bearer' })
      .send({
        scheduledDate: '2026-11-02T06:30:00+07:00',
        phaseId: 'ph-1',
        workoutType: 'WALK',
        intensity: 'LIGHT',
        distanceMeters: 1000,
        trackSurface: 'TURF',
        assignedStaffUserId: 'g-1',
        weekdays: [],
        until: '2026-11-30',
      })
      .expect(400);
    expect(JSON.stringify(response.body)).toContain('ít nhất 1 thứ');
  });

  it('a plan status change only accepts ACTIVE, COMPLETED or CANCELLED', async () => {
    await request(app.getHttpServer())
      .patch('/api/training/plans/p-1/status')
      .auth(token(), { type: 'bearer' })
      .send({ status: 'SUSPENDED' })
      .expect(400);
  });

  // Q-2.C: tắt công tắc quyền thì BE chặn thật, không chỉ ẩn menu.
  it('a Head Trainer whose createPlan switch is off cannot create a plan', async () => {
    user.permissions = {
      viewHorses: true,
      createPlan: false,
      assignSchedule: true,
      recordMetrics: true,
    };
    await request(app.getHttpServer())
      .post('/api/training/plans')
      .auth(token(), { type: 'bearer' })
      .send({})
      .expect(403);
  });

  it('a Head Trainer whose recordMetrics switch is off cannot record a result', async () => {
    user.permissions = {
      viewHorses: true,
      createPlan: true,
      assignSchedule: true,
      recordMetrics: false,
    };
    await request(app.getHttpServer())
      .post('/api/training/workouts/w-1/result')
      .auth(token(), { type: 'bearer' })
      .send({})
      .expect(403);
  });

  it('supports filtering plans by multiple comma-separated statuses', async () => {
    await request(app.getHttpServer())
      .get('/api/training/plans?status=DRAFT,ACTIVE')
      .auth(token(), { type: 'bearer' })
      .expect(200);
    expect(prisma.trainingPlan.findMany).toHaveBeenCalled();
    const calls = prisma.trainingPlan.findMany.mock.calls;
    const planListCall = calls[calls.length - 1][0];
    expect(planListCall.where.status).toEqual({ in: ['DRAFT', 'ACTIVE'] });
  });

  it('cloning a plan is restricted to Head Trainer (Groom gets 403)', async () => {
    user.role = Role.GROOM;
    await request(app.getHttpServer())
      .post('/api/training/plans/p-1/clone')
      .auth(token(), { type: 'bearer' })
      .send({ startDate: '2026-12-01' })
      .expect(403);
  });

  it('Club Manager can view training plans (read-only)', async () => {
    user.role = Role.CLUB_MANAGER;
    await request(app.getHttpServer())
      .get('/api/training/plans')
      .auth(token(), { type: 'bearer' })
      .expect(200);
    expect(prisma.trainingPlan.findMany).toHaveBeenCalled();
  });
});
