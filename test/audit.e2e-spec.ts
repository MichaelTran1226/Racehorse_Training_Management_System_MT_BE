import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('P1-06 audit HTTP contract (mock database, real JWT/guards)', () => {
  let app: INestApplication;
  const user = {
    id: 'actor',
    email: 'audit@example.test',
    fullName: 'Audit Manager',
    role: Role.CLUB_MANAGER as Role,
    status: UserStatus.ACTIVE,
    permissions: null as unknown,
  };
  const row = {
    id: 'log-1',
    userId: user.id,
    action: 'PERMISSIONS_CHANGED',
    entityName: 'User',
    entityId: 'target',
    oldValuesJson: null,
    newValuesJson: '{}',
    ipAddress: '127.0.0.1',
    userAgent: 'test',
    timestamp: new Date('2026-09-30T10:00:00Z'),
    user: { id: user.id, fullName: user.fullName },
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(user)),
      findFirst: jest.fn().mockResolvedValue(user),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([row]),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockResolvedValue(row),
    },
    counter: { upsert: jest.fn().mockResolvedValue({ value: 1 }) },
    $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
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
    user.role = Role.CLUB_MANAGER;
    user.permissions = null;
  });
  afterAll(async () => {
    await app.close();
  });

  it('requires a valid session', async () => {
    await request(app.getHttpServer()).get('/api/audit-logs').expect(401);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });
  it.each([Role.HEAD_TRAINER, Role.VETERINARIAN, Role.GROOM, Role.HORSE_OWNER])(
    'denies %s by default before reading any audit data',
    async (role) => {
      user.role = role;
      const response = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .auth(token(), { type: 'bearer' })
        .expect(403);
      expect(response.body.code).toBe('FORBIDDEN');
      expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    },
  );
  it('allows the manager and preserves pagination/envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/audit-logs?page=2&pageSize=10')
      .auth(token(), { type: 'bearer' })
      .expect(200);
    expect(response.body.data).toMatchObject({
      total: 1,
      page: 2,
      pageSize: 10,
      logs: [{ id: 'log-1', user: { id: user.id, fullName: user.fullName } }],
    });
  });
  it('honors an explicit viewAudit grant without requiring manageAccounts', async () => {
    user.role = Role.HEAD_TRAINER;
    user.permissions = { viewAudit: true };
    await request(app.getHttpServer())
      .get('/api/audit-logs')
      .auth(token(), { type: 'bearer' })
      .expect(200);
  });
  it('honors revocation for an already issued manager token', async () => {
    const jwt = token();
    user.permissions = { viewAudit: false };
    await request(app.getHttpServer())
      .get('/api/audit-logs')
      .auth(jwt, { type: 'bearer' })
      .expect(403);
  });
  it.each([
    'page=0',
    'page=-1',
    'page=1.2',
    'page=1000001',
    'pageSize=101',
    'pageSize=no',
    'from=invalid',
    'from=2026-02-30T00:00:00Z',
    'from=2026-09-30',
    'from=2026-10-01T00:00:00Z&to=2026-09-01T00:00:00Z',
    'userId=a&userId=b',
    'unknown=x',
  ])('rejects invalid query %s', async (query) => {
    const response = await request(app.getHttpServer())
      .get(`/api/audit-logs?${query}`)
      .auth(token(), { type: 'bearer' })
      .expect(400);
    expect(response.body.code).toBe('VALIDATION');
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });
  it('does not expose audit mutation endpoints', async () => {
    await request(app.getHttpServer())
      .post('/api/audit-logs')
      .auth(token(), { type: 'bearer' })
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .put('/api/audit-logs/log-1')
      .auth(token(), { type: 'bearer' })
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .delete('/api/audit-logs/log-1')
      .auth(token(), { type: 'bearer' })
      .expect(404);
  });

  it('captures request metadata without trusting a spoofed forwarded IP', async () => {
    await request(app.getHttpServer())
      .post('/api/audit/forbidden')
      .auth(token(), { type: 'bearer' })
      .set('User-Agent', 'audit-http-test')
      .set('X-Forwarded-For', '203.0.113.99')
      .send({ screen: 'Audit Log' })
      .expect(200);
    const data = prisma.auditLog.create.mock.calls[0][0].data;
    expect(data.userId).toBe(user.id);
    expect(data.ipAddress).toBeTruthy();
    expect(data.ipAddress).not.toBe('203.0.113.99');
    expect(data.userAgent).toBe('audit-http-test');
  });
});
