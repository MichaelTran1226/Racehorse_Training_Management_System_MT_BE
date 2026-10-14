import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { HorseStatus, Role, UserStatus, WorkoutStatus } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// C-08: Flow 3 qua HTTP thật (JWT, guard vai trò/quyền, ValidationPipe), chỉ DB là giả.
const HORSE_ID = '11111111-1111-4111-8111-111111111111';

describe('Flow 3 medical HTTP contract (mock database, real JWT/guards)', () => {
  let app: INestApplication;
  const user = {
    id: 'actor',
    email: 'vet@gmail.com',
    fullName: 'Dr. Vet',
    role: Role.VETERINARIAN as Role,
    status: UserStatus.ACTIVE,
    permissions: null as unknown,
    createdAt: new Date('2026-09-01T00:00:00Z'),
  };
  const horse = { id: HORSE_ID, name: 'Thunder', status: HorseStatus.IN_TRAINING, deletedAt: null };
  const activeLock = {
    id: 'lock-1',
    lockCode: 'KH-000001',
    horseId: HORSE_ID,
    isLocked: true,
    horse: { ...horse, status: HorseStatus.INJURED, injuryLogs: [] },
  };
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(user)),
      findFirst: jest.fn().mockResolvedValue(user),
      findMany: jest.fn().mockResolvedValue([]),
    },
    horse: {
      findUnique: jest.fn().mockResolvedValue(horse),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(horse),
    },
    medicalLock: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'lock-new',
          ...data,
          horse,
          veterinarian: null,
          medicalRecord: null,
        }),
      ),
      update: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ ...activeLock, ...data })),
    },
    medicalRecord: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    workoutSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    notification: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn((arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    ),
  };
  const token = () =>
    app
      .get(JwtService)
      .sign({ sub: user.id, email: user.email, role: user.role, fullName: user.fullName });
  const lockBody = {
    horseId: HORSE_ID,
    lockReason: 'Tendon strain on the left foreleg',
    expectedRestDays: 14,
  };

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
    user.role = Role.VETERINARIAN;
    user.permissions = null;
    prisma.medicalLock.findFirst.mockResolvedValue(null);
    prisma.medicalLock.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.id === 'lock-1' ? activeLock : null),
    );
  });
  afterAll(async () => {
    await app.close();
  });

  it.each([Role.CLUB_MANAGER, Role.HEAD_TRAINER, Role.GROOM, Role.HORSE_OWNER])(
    'only a Veterinarian places a Training Lock (%s gets 403)',
    async (role) => {
      user.role = role;
      await request(app.getHttpServer())
        .post('/api/medical/locks')
        .auth(token(), { type: 'bearer' })
        .send(lockBody)
        .expect(403);
      expect(prisma.medicalLock.create).not.toHaveBeenCalled();
    },
  );

  it('placing a lock locks the horse and blocks its upcoming heavy workouts in one transaction', async () => {
    await request(app.getHttpServer())
      .post('/api/medical/locks')
      .auth(token(), { type: 'bearer' })
      .send(lockBody)
      .expect(201);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.horse.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isMedicalLocked: true, status: HorseStatus.INJURED } }),
    );
    const blocked = prisma.workoutSession.updateMany.mock.calls[0][0];
    expect(blocked.where.status).toBe(WorkoutStatus.SCHEDULED);
    expect(blocked.data.status).toBe(WorkoutStatus.BLOCKED);
  });

  it('a horse cannot have two active locks', async () => {
    prisma.medicalLock.findFirst.mockResolvedValue(activeLock);
    await request(app.getHttpServer())
      .post('/api/medical/locks')
      .auth(token(), { type: 'bearer' })
      .send(lockBody)
      .expect(400);
    expect(prisma.medicalLock.create).not.toHaveBeenCalled();
  });

  it('a lock reason shorter than 10 characters is refused', async () => {
    await request(app.getHttpServer())
      .post('/api/medical/locks')
      .auth(token(), { type: 'bearer' })
      .send({ ...lockBody, lockReason: 'sore' })
      .expect(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lifting a lock keeps the medical status unless the vet picks another one', async () => {
    await request(app.getHttpServer())
      .post('/api/medical/locks/lock-1/release')
      .auth(token(), { type: 'bearer' })
      .send({ unlockReason: 'Ultrasound shows full recovery' })
      .expect(200);
    expect(prisma.horse.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isMedicalLocked: false, status: HorseStatus.INJURED } }),
    );
  });

  it('a Head Trainer cannot lift a lock', async () => {
    user.role = Role.HEAD_TRAINER;
    await request(app.getHttpServer())
      .post('/api/medical/locks/lock-1/release')
      .auth(token(), { type: 'bearer' })
      .send({ unlockReason: 'Ultrasound shows full recovery' })
      .expect(403);
    expect(prisma.medicalLock.update).not.toHaveBeenCalled();
  });

  it('a Head Trainer can read medical data but not create a record', async () => {
    user.role = Role.HEAD_TRAINER;
    const res = await request(app.getHttpServer())
      .post('/api/medical/records')
      .auth(token(), { type: 'bearer' })
      .send({
        horseId: HORSE_ID,
        examinationType: 'Routine Clinical',
        reason: 'Swelling on the left fetlock',
      })
      .expect(403);
    expect(JSON.stringify(res.body)).toContain('VET_ONLY');
    expect(prisma.medicalRecord.create).not.toHaveBeenCalled();
  });

  it('an official medical record cannot be deleted', async () => {
    prisma.medicalRecord.findUnique.mockResolvedValue({
      id: 'r-1',
      status: 'OPEN',
      veterinarianUserId: 'actor',
    });
    await request(app.getHttpServer())
      .delete('/api/medical/records/r-1')
      .auth(token(), { type: 'bearer' })
      .expect(400);
    expect(prisma.medicalRecord.delete).not.toHaveBeenCalled();
  });

  it('the health board only shows a Groom the horses in their care (C-03)', async () => {
    user.role = Role.GROOM;
    await request(app.getHttpServer())
      .get('/api/medical/health-board')
      .auth(token(), { type: 'bearer' })
      .expect(200);
    expect(prisma.horse.findMany.mock.calls[0][0].where.stallAllocations).toEqual({
      some: { isActive: true, assignedGroomUserId: 'actor' },
    });
  });

  it('the health board only shows a Horse Owner their own horses (C-03)', async () => {
    user.role = Role.HORSE_OWNER;
    await request(app.getHttpServer())
      .get('/api/medical/health-board')
      .auth(token(), { type: 'bearer' })
      .expect(200);
    expect(prisma.horse.findMany.mock.calls[0][0].where.ownerId).toBe('actor');
  });
});
