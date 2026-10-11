import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Flow 1 horse soft delete / stalls HTTP contract (mock database, real JWT/guards)', () => {
  let app: INestApplication;
  const user = {
    id: 'actor',
    email: 'manager@gmail.com',
    fullName: 'Club Manager',
    role: Role.CLUB_MANAGER as Role,
    status: UserStatus.ACTIVE,
    permissions: null as unknown,
  };
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(user)),
      findFirst: jest.fn().mockResolvedValue(user),
    },
    horse: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    stall: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
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
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /horses/deleted is routed to the deleted list, not to GET /horses/:id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/horses/deleted')
      .auth(token(), { type: 'bearer' })
      .expect(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({ items: [], total: 0, page: 1, limit: 20 }),
    );
    expect(prisma.horse.findMany.mock.calls[0][0].where.deletedAt).toEqual({ not: null });
    expect(prisma.horse.findUnique).not.toHaveBeenCalled();
  });

  it.each([Role.HEAD_TRAINER, Role.VETERINARIAN, Role.GROOM, Role.HORSE_OWNER])(
    'denies %s access to the deleted list',
    async (role) => {
      user.role = role;
      await request(app.getHttpServer())
        .get('/api/horses/deleted')
        .auth(token(), { type: 'bearer' })
        .expect(403);
      expect(prisma.horse.findMany).not.toHaveBeenCalled();
    },
  );

  it('DELETE /horses/:id requires a reason and the typed horse name', async () => {
    const response = await request(app.getHttpServer())
      .delete('/api/horses/h-1')
      .auth(token(), { type: 'bearer' })
      .send({})
      .expect(400);
    expect(JSON.stringify(response.body)).toContain('Lý do');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a Horse Owner cannot list stalls (Q10)', async () => {
    user.role = Role.HORSE_OWNER;
    await request(app.getHttpServer())
      .get('/api/stalls')
      .auth(token(), { type: 'bearer' })
      .expect(403);
    expect(prisma.stall.findMany).not.toHaveBeenCalled();
  });
});
