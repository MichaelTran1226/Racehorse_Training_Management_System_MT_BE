import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { HorseStatus, IncidentStatus, Role, SeverityLevel, TournamentStatus, UserStatus } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const HORSE_ID = '11111111-1111-4111-8111-111111111111';
const TOURNAMENT_ID = '22222222-2222-4222-8222-222222222222';

describe('End-to-End Operational Loop (Groom -> Vet -> Trainer -> Owner -> Manager)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const users: Record<Role, { id: string; email: string; fullName: string; role: Role; status: UserStatus; permissions: any }> = {
    [Role.CLUB_MANAGER]: {
      id: 'u-cm',
      email: 'manager@gmail.com',
      fullName: 'Club Manager',
      role: Role.CLUB_MANAGER,
      status: UserStatus.ACTIVE,
      permissions: null,
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

  let currentHorseState = {
    id: HORSE_ID,
    name: 'Thunderbolt',
    horseCode: 'HR-000001',
    status: HorseStatus.IN_TRAINING,
    isMedicalLocked: false,
    ownerId: 'u-owner',
    deletedAt: null,
    stallAllocations: [{ assignedGroomUserId: 'u-groom', isActive: true, stall: { zone: 'Zone A', code: 'A01' } }],
    medicalLocks: [] as any[],
  };

  const prisma: any = {
    user: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
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
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(currentHorseState)),
      findFirst: jest.fn().mockImplementation(() => Promise.resolve(currentHorseState)),
      findMany: jest.fn().mockImplementation(() => Promise.resolve([currentHorseState])),
      update: jest.fn().mockImplementation(({ data }: any) => {
        currentHorseState = { ...currentHorseState, ...data };
        return Promise.resolve(currentHorseState);
      }),
    },
    incidentReport: {
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 'inc-1',
          ...data,
          status: IncidentStatus.REPORTED,
          createdAt: new Date(),
        }),
      ),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(1),
    },
    medicalLock: {
      findFirst: jest.fn().mockImplementation(() => Promise.resolve(currentHorseState.medicalLocks[0] || null)),
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(currentHorseState.medicalLocks[0] || null)),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }: any) => {
        const lock = {
          id: 'lock-1',
          ...data,
          isLocked: true,
          horse: { id: currentHorseState.id, name: currentHorseState.name, microchipRfid: 'RFID-001' },
          veterinarian: {
            id: users[Role.VETERINARIAN].id,
            fullName: users[Role.VETERINARIAN].fullName,
            email: users[Role.VETERINARIAN].email,
          },
          medicalRecord: null,
        };
        currentHorseState.isMedicalLocked = true;
        currentHorseState.medicalLocks = [
          {
            id: 'lock-1',
            isLocked: true,
            lockReason: data.lockReason,
            lockedAt: new Date(),
            veterinarian: {
              id: users[Role.VETERINARIAN].id,
              fullName: users[Role.VETERINARIAN].fullName,
            },
          },
        ];
        return Promise.resolve(lock);
      }),
    },
    workoutSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      createMany: jest.fn().mockResolvedValue({ count: 4 }),
    },
    tournament: {
      findUnique: jest.fn().mockResolvedValue({
        id: TOURNAMENT_ID,
        name: 'Autumn Championship',
        status: TournamentStatus.OPEN_REGISTRATION,
        registrationDeadline: new Date(Date.now() + 86400000),
      }),
    },
    tournamentRegistration: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'reg-1' }),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'aud-1' }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'aud-1', action: 'INCIDENT_REPORTED', timestamp: new Date() },
        { id: 'aud-2', action: 'MEDICAL_LOCK_CREATED', timestamp: new Date() },
      ]),
      count: jest.fn().mockResolvedValue(2),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: HORSE_ID }]),
    $transaction: jest.fn((arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    ),
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

    jwt = app.get(JwtService);
    for (const [role, u] of Object.entries(users)) {
      tokens[role as Role] = jwt.sign({
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

  it('Step 1: Groom files an incident report for swollen leg', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/incidents')
      .set('Authorization', `Bearer ${tokens[Role.GROOM]}`)
      .send({
        horseId: HORSE_ID,
        severity: SeverityLevel.MODERATE,
        description: 'Left front leg swollen after morning paddock',
        symptoms: ['LAMENESS'],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('inc-1');
  });

  it('Step 2: Veterinarian puts MedicalLock on the horse following incident', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/medical/locks')
      .set('Authorization', `Bearer ${tokens[Role.VETERINARIAN]}`)
      .send({
        horseId: HORSE_ID,
        lockReason: 'Acute tendon strain; strict stall rest ordered',
        expectedRestDays: 14,
      });

    expect(res.status).toBe(201);
    expect(currentHorseState.isMedicalLocked).toBe(true);
  });

  it('Step 3: Head Trainer attempts tournament registration and is BLOCKED by Medical Lock (RULE-MED-01)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/tournaments/${TOURNAMENT_ID}/registrations`)
      .set('Authorization', `Bearer ${tokens[Role.HEAD_TRAINER]}`)
      .send({
        horseId: HORSE_ID,
        notes: 'Attempting to register for Championship',
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MEDICAL_LOCK_ACTIVE');
  });

  it('Step 4: Horse Owner views horse profile and sees transparent medical lock status', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/horses/${HORSE_ID}`)
      .set('Authorization', `Bearer ${tokens[Role.HORSE_OWNER]}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isMedicalLocked).toBe(true);
    expect(res.body.data.name).toBe('Thunderbolt');
  });

  it('Step 5: Club Manager inspects audit trail of the operational sequence', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${tokens[Role.CLUB_MANAGER]}`);

    expect(res.status).toBe(200);
    expect(res.body.data.logs).toBeDefined();
    expect(res.body.data.total).toBe(2);
  });
});
