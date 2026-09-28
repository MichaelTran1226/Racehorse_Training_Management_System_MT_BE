import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    strategy = new JwtStrategy(configService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return user identity when payload is valid', async () => {
      const payload: JwtPayload = {
        sub: 'user-uuid-123',
        email: 'trainer@equiflow.com',
        role: Role.HEAD_TRAINER,
        fullName: 'David Nguyen',
      };

      const result = await strategy.validate(payload);
      expect(result).toEqual({
        userId: 'user-uuid-123',
        email: 'trainer@equiflow.com',
        role: Role.HEAD_TRAINER,
        fullName: 'David Nguyen',
      });
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
