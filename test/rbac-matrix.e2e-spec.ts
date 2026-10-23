import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('5-Role Parameterized Matrix: Scope & Permission Enforcement (RULE-RBAC-01)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const users: Record<Role, { id: string; email: string; fullName: string; role: Role; status: UserStatus; permissions: any }> = {
    [Role.CLUB_MANAGER]: {
      id: 'u-cm',
      email: 'manager@gmail.com',
      fullName: 'Club Manager',
      role: Role.CLUB_MANAGER,
      status: UserStatus.ACTIVE,
      permissions: { manageAccounts: true },
    },
    [Role.HEAD_TRAINER]: {
      id: 'u-ht',
      email: 'trainer@gmail.com',
      fullName: 'Head Trainer',
      role: Role.HEAD_TRAINER,
      status: UserStatus.ACTIVE,
      permissions: null,
    },
    [Role.VETERINARIAN]: {
      id: 'u-vet',
      email: 'vet@gmail.com',
      fullName: 'Veterinarian',
      role: Role.VETERINARIAN,
      status: UserStatus.ACTIVE,
      permissions: null,
    },
    [Role.GROOM]: {
      id: 'u-groom',
      email: 'groom@gmail.com',
      fullName: 'Groom',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
      permissions: null,
    },
    [Role.HORSE_OWNER]: {
      id: 'u-owner',
      email: 'owner@gmail.com',
      fullName: 'Horse Owner',
      role: Role.HORSE_OWNER,
      status: UserStatus.ACTIVE,
      permissions: null,
    },
  };

  const tokens: Record<Role, string> = {} as any;
  let lastFindManyWhere: any = null;

  const prisma: any = {
    user: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id?: string; email?: string } }) => {
        const found = Object.values(users).find(
          (u) => (where.id && u.id === where.id) || (where.email && u.email === where.email),
        );
        return Promise.resolve(found || null);
      }),
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        const found = Object.values(users).find(
          (u) => (where.id && u.id === where.id) || (where.email && u.email === where.email),
        );
        return Promise.resolve(found || null);
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    horse: {
      findMany: jest.fn().mockImplementation(({ where }: any) => {
        lastFindManyWhere = where;
        return Promise.resolve([]);
      }),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    stall: { findMany: jest.fn().mockResolvedValue([]) },
    trainingPlan: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'p-1', name: 'Plan 1' }),
    },
    trainingLock: {
      create: jest.fn().mockResolvedValue({ id: 'l-1', status: 'ACTIVE' }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
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

    jwtService = app.get(JwtService);
    // Cache access token cho cả 5 roles 1 lần duy nhất trong bộ nhớ
    for (const [role, u] of Object.entries(users)) {
      tokens[role as Role] = jwtService.sign({
        sub: u.id,
        email: u.email,
        role: u.role,
        fullName: u.fullName,
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    lastFindManyWhere = null;
  });

  // DATA-DRIVEN PARAMETERIZED MATRIX (5 ROLES): DATA ISOLATION
  describe.each([
    { role: Role.CLUB_MANAGER, expectedScope: 'UNSCOPED' },
    { role: Role.HEAD_TRAINER, expectedScope: 'UNSCOPED' },
    { role: Role.VETERINARIAN, expectedScope: 'UNSCOPED' },
    { role: Role.GROOM, expectedScope: 'ASSIGNED_ONLY' },
    { role: Role.HORSE_OWNER, expectedScope: 'OWNED_ONLY' },
  ])('Horse Data Scope: $role', ({ role, expectedScope }) => {
    it(`enforces correct horse listing scope (${expectedScope})`, async () => {
      const res = await request(app.getHttpServer())
        .get('/api/horses')
        .set('Authorization', `Bearer ${tokens[role]}`);

      expect(res.status).toBe(200);

      if (expectedScope === 'UNSCOPED') {
        expect(lastFindManyWhere?.ownerId).toBeUndefined();
        expect(lastFindManyWhere?.stallAllocations).toBeUndefined();
      } else if (expectedScope === 'ASSIGNED_ONLY') {
        expect(lastFindManyWhere?.stallAllocations?.some?.assignedGroomUserId).toBe('u-groom');
      } else if (expectedScope === 'OWNED_ONLY') {
        expect(lastFindManyWhere?.ownerId).toBe('u-owner');
      }
    });
  });

  // DATA-DRIVEN PARAMETERIZED MATRIX: ACTION PERMISSIONS
  describe.each([
    {
      role: Role.CLUB_MANAGER,
      canCreateTrainingPlan: false,
      canPlaceMedicalLock: false,
      canManageAccounts: true,
    },
    {
      role: Role.HEAD_TRAINER,
      canCreateTrainingPlan: true,
      canPlaceMedicalLock: false,
      canManageAccounts: false,
    },
    {
      role: Role.VETERINARIAN,
      canCreateTrainingPlan: false,
      canPlaceMedicalLock: true,
      canManageAccounts: false,
    },
    {
      role: Role.GROOM,
      canCreateTrainingPlan: false,
      canPlaceMedicalLock: false,
      canManageAccounts: false,
    },
    {
      role: Role.HORSE_OWNER,
      canCreateTrainingPlan: false,
      canPlaceMedicalLock: false,
      canManageAccounts: false,
    },
  ])(
    'Action Permissions: $role',
    ({ role, canCreateTrainingPlan, canPlaceMedicalLock, canManageAccounts }) => {
      it(`enforces accounts management permission (expected: ${canManageAccounts})`, async () => {
        const res = await request(app.getHttpServer())
          .get('/api/accounts')
          .set('Authorization', `Bearer ${tokens[role]}`);

        if (canManageAccounts) {
          expect(res.status).toBe(200);
        } else {
          expect(res.status).toBe(403);
        }
      });

      it(`enforces training plan creation permission (expected: ${canCreateTrainingPlan})`, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/training/plans')
          .set('Authorization', `Bearer ${tokens[role]}`)
          .send({ horseId: 'h-1', name: 'Speed Plan' });

        if (canCreateTrainingPlan) {
          expect(res.status).not.toBe(403);
        } else {
          expect(res.status).toBe(403);
        }
      });

      it(`enforces training/medical lock creation permission (expected: ${canPlaceMedicalLock})`, async () => {
        const res = await request(app.getHttpServer())
          .post('/api/medical/locks')
          .set('Authorization', `Bearer ${tokens[role]}`)
          .send({ horseId: 'h-1', reason: 'Injury' });

        if (canPlaceMedicalLock) {
          expect(res.status).not.toBe(403);
        } else {
          expect(res.status).toBe(403);
        }
      });
    },
  );
});
