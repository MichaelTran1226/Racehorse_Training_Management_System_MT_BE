import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { MeService } from './me.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';

describe('MeService.changePassword', () => {
  let service: MeService;

  const user = {
    id: 'user-1',
    email: 'trainer@gmail.com',
    fullName: 'Trainer',
    role: Role.HEAD_TRAINER,
    status: UserStatus.ACTIVE,
    passwordHash: bcrypt.hashSync('Current@2026', 4),
  };

  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...user, ...data })),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const auth = {
    assertNotLockedOut: jest.fn().mockResolvedValue(undefined),
    recordFailedAttempt: jest.fn(),
    clearFailedAttempts: jest.fn().mockResolvedValue(undefined),
    revokeAllTokens: jest.fn().mockResolvedValue(undefined),
    issueTokens: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();
    service = module.get(MeService);
  });

  it('should count a wrong current password and report the attempts left', async () => {
    auth.recordFailedAttempt.mockResolvedValue({ attemptsLeft: 3 });

    const error = (await service
      .changePassword('user-1', { current: 'Wrong@2026', next: 'NewPass@2026' })
      .catch((e: HttpException) => e)) as HttpException;

    expect(auth.recordFailedAttempt).toHaveBeenCalledWith('trainer@gmail.com');
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ code: 'WRONG_PASSWORD', data: { attemptsLeft: 3 } }),
    );
  });

  it('should lock for 15 minutes on the 5th wrong current password', async () => {
    const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    auth.recordFailedAttempt.mockResolvedValue({ attemptsLeft: 0, lockedUntil });

    const error = (await service
      .changePassword('user-1', { current: 'Wrong@2026', next: 'NewPass@2026' })
      .catch((e: HttpException) => e)) as HttpException;

    expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'ATTEMPTS_EXCEEDED' }));
  });

  it('should refuse while the account is locked out, before checking the password', async () => {
    auth.assertNotLockedOut.mockRejectedValueOnce(new HttpException('locked', 429));

    await expect(
      service.changePassword('user-1', { current: 'Current@2026', next: 'NewPass@2026' }),
    ).rejects.toThrow(HttpException);
    expect(auth.recordFailedAttempt).not.toHaveBeenCalled();
  });

  it('should change the password, clear the counter and sign out other devices', async () => {
    const result = await service.changePassword('user-1', {
      current: 'Current@2026',
      next: 'NewPass@2026',
    });

    expect(auth.clearFailedAttempts).toHaveBeenCalledWith('trainer@gmail.com');
    expect(auth.revokeAllTokens).toHaveBeenCalledWith('user-1');
    expect(result.accessToken).toBe('a');
  });
});
