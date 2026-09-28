import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { Role, UserStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Authentication & Session Flow (e2e)', () => {
  let app: INestApplication;

  const rawPassword = 'ValidPassword@2026';
  const hashedPassword = bcrypt.hashSync(rawPassword, 10);

  const mockUsers: Record<string, any> = {
    'manager@equiflow.com': {
      id: 'usr-manager-1',
      email: 'manager@equiflow.com',
      passwordHash: hashedPassword,
      fullName: 'Michael Tran (Club Manager)',
      phoneNumber: '+84901234567',
      role: Role.CLUB_MANAGER,
      status: UserStatus.ACTIVE,
    },
    'trainer@equiflow.com': {
      id: 'usr-trainer-1',
      email: 'trainer@equiflow.com',
      passwordHash: hashedPassword,
      fullName: 'David Nguyen (Head Trainer)',
      phoneNumber: '+84901234568',
      role: Role.HEAD_TRAINER,
      status: UserStatus.ACTIVE,
    },
    'vet@equiflow.com': {
      id: 'usr-vet-1',
      email: 'vet@equiflow.com',
      passwordHash: hashedPassword,
      fullName: 'Dr. Sarah Connor (Veterinarian)',
      phoneNumber: '+84901234569',
      role: Role.VETERINARIAN,
      status: UserStatus.ACTIVE,
    },
    'groom@equiflow.com': {
      id: 'usr-groom-1',
      email: 'groom@equiflow.com',
      passwordHash: hashedPassword,
      fullName: 'John Smith (Groom Hand)',
      phoneNumber: '+84901234570',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
    },
    'owner@equiflow.com': {
      id: 'usr-owner-1',
      email: 'owner@equiflow.com',
      passwordHash: hashedPassword,
      fullName: 'Robert Sterling (Horse Owner)',
      phoneNumber: '+84901234571',
      role: Role.HORSE_OWNER,
      status: UserStatus.ACTIVE,
    },
    'suspended@equiflow.com': {
      id: 'usr-suspended-1',
      email: 'suspended@equiflow.com',
      passwordHash: hashedPassword,
      fullName: 'Suspended User',
      phoneNumber: null,
      role: Role.HORSE_OWNER,
      status: UserStatus.SUSPENDED,
    },
  };

  const storedRefreshTokens: Record<string, any> = {};

  const mockPrismaService = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    isHealthy: jest.fn().mockResolvedValue(true),
    user: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { email?: string; id?: string } }) => {
          if (where.email) {
            return Promise.resolve(mockUsers[where.email] || null);
          }
          if (where.id) {
            const user = Object.values(mockUsers).find((u) => u.id === where.id);
            return Promise.resolve(user || null);
          }
          return Promise.resolve(null);
        }),
    },
    refreshToken: {
      create: jest.fn().mockImplementation(({ data }: { data: any }) => {
        storedRefreshTokens[data.tokenHash] = {
          id: `token-${Date.now()}`,
          tokenHash: data.tokenHash,
          userId: data.userId,
          expiresAt: data.expiresAt,
          revoked: false,
          user: Object.values(mockUsers).find((u) => u.id === data.userId),
        };
        return Promise.resolve(storedRefreshTokens[data.tokenHash]);
      }),
      findUnique: jest.fn().mockImplementation(({ where }: { where: { tokenHash: string } }) => {
        return Promise.resolve(storedRefreshTokens[where.tokenHash] || null);
      }),
      update: jest
        .fn()
        .mockImplementation(({ where, data }: { where: { id: string }; data: any }) => {
          const found = Object.values(storedRefreshTokens).find((t) => t.id === where.id);
          if (found) {
            Object.assign(found, data);
            return Promise.resolve(found);
          }
          return Promise.resolve(null);
        }),
      updateMany: jest
        .fn()
        .mockImplementation(({ where, data }: { where: { tokenHash: string }; data: any }) => {
          const found = storedRefreshTokens[where.tokenHash];
          if (found) {
            Object.assign(found, data);
            return Promise.resolve({ count: 1 });
          }
          return Promise.resolve({ count: 0 });
        }),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('should authenticate CLUB_MANAGER and return tokens with /manager/dashboard', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'manager@equiflow.com',
          password: rawPassword,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.tokenType).toBe('Bearer');
      expect(res.body.data.user.role).toBe(Role.CLUB_MANAGER);
      expect(res.body.data.user.dashboardUrl).toBe('/manager/dashboard');
    });

    it('should authenticate 4 other roles into their dedicated dashboards', async () => {
      const rolesConfig = [
        { email: 'trainer@equiflow.com', role: Role.HEAD_TRAINER, dashboard: '/trainer/dashboard' },
        { email: 'vet@equiflow.com', role: Role.VETERINARIAN, dashboard: '/vet/dashboard' },
        { email: 'groom@equiflow.com', role: Role.GROOM, dashboard: '/groom/dashboard' },
        { email: 'owner@equiflow.com', role: Role.HORSE_OWNER, dashboard: '/owner/dashboard' },
      ];

      for (const config of rolesConfig) {
        const res = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({
            email: config.email,
            password: rawPassword,
          })
          .expect(200);

        expect(res.body.data.user.role).toBe(config.role);
        expect(res.body.data.user.dashboardUrl).toBe(config.dashboard);
      }
    });

    it('should reject with 401 when password is wrong', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'manager@equiflow.com',
          password: 'IncorrectPassword',
        })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should reject with 401 when email is unknown', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'notfound@equiflow.com',
          password: rawPassword,
        })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should reject with 403 when account is SUSPENDED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'suspended@equiflow.com',
          password: rawPassword,
        })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Forbidden');
    });
  });

  describe('Session, Token Refresh & /api/auth/me', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeAll(async () => {
      const loginRes = await request(app.getHttpServer()).post('/api/auth/login').send({
        email: 'manager@equiflow.com',
        password: rawPassword,
      });

      accessToken = loginRes.body.data.accessToken;
      refreshToken = loginRes.body.data.refreshToken;
    });

    it('GET /api/auth/me without token should return 401 Unauthorized', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('GET /api/auth/me with Bearer token should return 200 with profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('manager@equiflow.com');
      expect(res.body.data.role).toBe(Role.CLUB_MANAGER);
      expect(res.body.data.dashboardUrl).toBe('/manager/dashboard');
    });

    it('POST /api/auth/refresh with valid token should rotate and return new tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(refreshToken); // Rotated
    });

    it('POST /api/auth/logout should return 200 and revoke token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('Logged out successfully');
    });
  });
});
