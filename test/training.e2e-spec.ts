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

  it('a plan status change only accepts ACTIVE, COMPLETED or CANCELLED', async () => {
    await request(app.getHttpServer())
      .patch('/api/training/plans/p-1/status')
      .auth(token(), { type: 'bearer' })
      .send({ status: 'SUSPENDED' })
      .expect(400);
  });
});
