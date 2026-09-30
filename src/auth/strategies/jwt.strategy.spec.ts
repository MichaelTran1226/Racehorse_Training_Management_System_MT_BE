import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, UserStatus } from '@prisma/client';
import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let configService: ConfigService;

  const dbUser = {
    id: 'user-uuid-123',
    email: 'trainer@equiflow.com',
    role: Role.HEAD_TRAINER,
    fullName: 'David Nguyen',
    status: UserStatus.ACTIVE,
    permissions: null,
  };
  const mockPrisma = { user: { findUnique: jest.fn() } };

  beforeEach(() => {
    jest.clearAllMocks();
    configService = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    strategy = new JwtStrategy(configService, mockPrisma as unknown as PrismaService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    const payload: JwtPayload = {
      sub: 'user-uuid-123',
      email: 'trainer@equiflow.com',
      role: Role.HEAD_TRAINER,
      fullName: 'David Nguyen',
    };

    it('should return user identity and current permissions when the account is active', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(dbUser);

      const result = await strategy.validate(payload);
      expect(result).toEqual({
        userId: 'user-uuid-123',
        email: 'trainer@equiflow.com',
        role: Role.HEAD_TRAINER,
        fullName: 'David Nguyen',
        permissions: expect.objectContaining({ viewHorses: true, createPlan: true }),
      });
    });

    it('should throw UnauthorizedException when the account was locked after the token was issued', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...dbUser, status: UserStatus.LOCKED });

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when the account no longer exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when sub is missing', async () => {
      const invalidPayload = {
        email: 'trainer@equiflow.com',
        role: Role.HEAD_TRAINER,
      } as unknown as JwtPayload;

      await expect(strategy.validate(invalidPayload)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when role is missing', async () => {
      const invalidPayload = {
        sub: 'user-uuid-123',
        email: 'trainer@equiflow.com',
      } as unknown as JwtPayload;

      await expect(strategy.validate(invalidPayload)).rejects.toThrow(UnauthorizedException);
    });
  });
});
