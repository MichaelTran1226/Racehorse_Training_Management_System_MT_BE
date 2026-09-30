import { Test, TestingModule } from '@nestjs/testing';
import {
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';
import { AuditService } from '../audit/audit.service';
import { CounterService } from '../audit/counter.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'manager@equiflow.com',
    passwordHash: '$2a$10$hashedpassword',
    fullName: 'Michael Tran (Club Manager)',
    phoneNumber: '+84901234567',
    role: Role.CLUB_MANAGER,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...mockUser, ...data })),
    },
    loginAttempt: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    resetToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    otpCode: {
      deleteMany: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('mock-access-token-jwt'),
  };

  const otpRecord = {
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 600000),
    resendAt: new Date(Date.now() + 60000),
  };
  const mockOtpService = {
    issue: jest.fn().mockResolvedValue(otpRecord),
    check: jest.fn().mockResolvedValue(undefined),
    find: jest.fn(),
  };
  const mockAuditService = {
    record: jest.fn().mockResolvedValue(undefined),
    activeManagerName: jest.fn().mockResolvedValue('Đỗ Quốc Việt'),
  };
  const mockCounterService = { next: jest.fn().mockResolvedValue(15) };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: OtpService, useValue: mockOtpService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: CounterService, useValue: mockCounterService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Dashboard URLs for 5 roles', () => {
    it('should map CLUB_MANAGER to /manager/dashboard', () => {
      expect(service.getDashboardUrlForRole(Role.CLUB_MANAGER)).toBe('/manager/dashboard');
    });

    it('should map HEAD_TRAINER to /trainer/dashboard', () => {
      expect(service.getDashboardUrlForRole(Role.HEAD_TRAINER)).toBe('/trainer/dashboard');
    });

    it('should map VETERINARIAN to /vet/dashboard', () => {
      expect(service.getDashboardUrlForRole(Role.VETERINARIAN)).toBe('/vet/dashboard');
    });

    it('should map GROOM to /groom/dashboard', () => {
      expect(service.getDashboardUrlForRole(Role.GROOM)).toBe('/groom/dashboard');
    });

    it('should map HORSE_OWNER to /owner/dashboard', () => {
      expect(service.getDashboardUrlForRole(Role.HORSE_OWNER)).toBe('/owner/dashboard');
    });
  });

  describe('login', () => {
    it('should authenticate user and return access/refresh tokens with dashboard URL', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));
      mockPrismaService.refreshToken.create.mockResolvedValue({ id: 'ref-1' });

      const result = await service.login({
        email: 'manager@equiflow.com',
        password: 'ValidPassword123',
      });

      expect(result.accessToken).toBe('mock-access-token-jwt');
      expect(result.refreshToken).toBeDefined();
      expect(result.expiresIn).toBe(900);
      expect(result.user.email).toBe('manager@equiflow.com');
      expect(result.user.role).toBe(Role.CLUB_MANAGER);
      expect(result.user.dashboardUrl).toBe('/manager/dashboard');
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalled();
      expect(mockPrismaService.auditLog.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when email does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@equiflow.com', password: 'Password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password is incorrect', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(false));

      await expect(
        service.login({ email: 'manager@equiflow.com', password: 'WrongPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject with 423 ACCOUNT_LOCKED when user account is LOCKED', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: UserStatus.LOCKED,
        statusReason: 'Shared password',
      });
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));

      const error = await service
        .login({ email: 'manager@equiflow.com', password: 'ValidPassword' })
        .catch((e: HttpException) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.LOCKED);
      expect((error as HttpException).getResponse()).toEqual(
        expect.objectContaining({
          code: 'ACCOUNT_LOCKED',
          data: expect.objectContaining({ reason: 'Shared password' }),
        }),
      );
    });

    it('should throw ForbiddenException when user account is PENDING_EMAIL', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: UserStatus.PENDING_EMAIL,
      });
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));

      await expect(
        service.login({ email: 'manager@equiflow.com', password: 'ValidPassword' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('refreshToken', () => {
    const validStoredToken = {
      id: 'token-uuid-1',
      tokenHash: 'hashed-token',
      userId: 'user-uuid-1',
      revoked: false,
      expiresAt: new Date(Date.now() + 100000),
      user: mockUser,
    };

    it('should successfully rotate tokens', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(validStoredToken);
      mockPrismaService.refreshToken.update.mockResolvedValue({
        ...validStoredToken,
        revoked: true,
      });
      mockPrismaService.refreshToken.create.mockResolvedValue({ id: 'new-token-1' });

      const result = await service.refreshToken({ refreshToken: 'raw-refresh-token' });

      expect(result.accessToken).toBe('mock-access-token-jwt');
      expect(result.refreshToken).toBeDefined();
      expect(mockPrismaService.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'token-uuid-1' }, data: { revoked: true } }),
      );
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if refresh token is revoked', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        ...validStoredToken,
        revoked: true,
      });

      await expect(service.refreshToken({ refreshToken: 'revoked-token' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if refresh token is expired', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        ...validStoredToken,
        expiresAt: new Date(Date.now() - 10000),
      });

      await expect(service.refreshToken({ refreshToken: 'expired-token' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw ForbiddenException if user is not active', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        ...validStoredToken,
        user: { ...mockUser, status: UserStatus.LOCKED },
      });

      await expect(service.refreshToken({ refreshToken: 'raw-token' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('logout', () => {
    it('should revoke token and record audit log', async () => {
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.logout('user-uuid-1', 'raw-token');

      expect(result.success).toBe(true);
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalled();
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-uuid-1', action: 'AUTH_LOGOUT' }),
        }),
      );
    });
  });

  describe('getMe', () => {
    it('should return user profile with correct dashboard url', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getMe('user-uuid-1');

      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect(result.role).toBe(Role.CLUB_MANAGER);
      expect(result.dashboardUrl).toBe('/manager/dashboard');
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('non-existent-user')).rejects.toThrow(NotFoundException);
    });
  });

  describe('login lockout', () => {
    it('should return 401 INVALID_CREDENTIALS with attemptsLeft on a wrong password', async () => {
      mockPrismaService.loginAttempt.findUnique.mockResolvedValue({ fails: 2, lockedUntil: null });
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(false));

      const error = (await service
        .login({ email: 'manager@equiflow.com', password: 'WrongPassword' })
        .catch((e: HttpException) => e)) as HttpException;

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({ code: 'INVALID_CREDENTIALS', data: { attemptsLeft: 2 } }),
      );
      expect(mockPrismaService.loginAttempt.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { fails: 3, lockedUntil: null } }),
      );
    });

    it('should lock sign-in for 15 minutes on the 5th wrong password', async () => {
      mockPrismaService.loginAttempt.findUnique.mockResolvedValue({ fails: 4, lockedUntil: null });
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(false));

      const error = (await service
        .login({ email: 'manager@equiflow.com', password: 'WrongPassword' })
        .catch((e: HttpException) => e)) as HttpException;

      expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'ATTEMPTS_EXCEEDED' }));
    });

    it('should refuse sign-in while the email is locked out, without checking the password', async () => {
      mockPrismaService.loginAttempt.findUnique.mockResolvedValue({
        fails: 0,
        lockedUntil: new Date(Date.now() + 60000),
      });

      await expect(
        service.login({ email: 'manager@equiflow.com', password: 'ValidPassword123' }),
      ).rejects.toThrow(HttpException);
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('register', () => {
    const dto = {
      fullName: 'Nguyễn Hoàng Anh',
      email: 'Anh.Nguyen@gmail.com',
      password: 'Horse@2026',
      role: 'HORSE_OWNER',
    };

    it('should create a PENDING_EMAIL Horse Owner and send a sign-up OTP', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'u-new', ...data }),
      );

      const result = await service.register(dto);

      expect(result.email).toBe('anh.nguyen@gmail.com');
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          role: Role.HORSE_OWNER,
          status: UserStatus.PENDING_EMAIL,
          requestCode: expect.stringMatching(/^REQ-\d{4}-015$/),
        }),
      });
      expect(mockOtpService.issue).toHaveBeenCalledWith('anh.nguyen@gmail.com', 'SIGNUP', true);
    });

    it('should reject other roles with ROLE_NOT_ALLOWED', async () => {
      const error = (await service
        .register({ ...dto, role: 'CLUB_MANAGER' })
        .catch((e: HttpException) => e)) as HttpException;
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'ROLE_NOT_ALLOWED' }));
    });

    it('should reject an email that already has an account with EMAIL_TAKEN', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      const error = (await service.register(dto).catch((e: HttpException) => e)) as HttpException;
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'EMAIL_TAKEN' }));
    });
  });

  describe('resetPassword', () => {
    const entry = { email: 'tung.ngo@gmail.com', expiresAt: new Date(Date.now() + 60000) };

    it('should activate an INVITED account when it sets its first password', async () => {
      mockPrismaService.resetToken.findUnique.mockResolvedValue(entry);
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        id: 'u-tung',
        status: UserStatus.INVITED,
      });

      const result = await service.resetPassword({ resetToken: 'tok', password: 'Stable@2026' });

      expect(result).toEqual({ ok: true, activated: true });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u-tung' },
        data: expect.objectContaining({ status: UserStatus.ACTIVE }),
      });
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u-tung', revoked: false },
        data: { revoked: true },
      });
    });

    it('should reject a weak password with WEAK_PASSWORD', async () => {
      mockPrismaService.resetToken.findUnique.mockResolvedValue(entry);
      const error = (await service
        .resetPassword({ resetToken: 'tok', password: 'short' })
        .catch((e: HttpException) => e)) as HttpException;
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'WEAK_PASSWORD' }));
    });

    it('should reject an expired ticket with RESET_EXPIRED', async () => {
      mockPrismaService.resetToken.findUnique.mockResolvedValue({
        ...entry,
        expiresAt: new Date(Date.now() - 1000),
      });
      const error = (await service
        .resetPassword({ resetToken: 'tok', password: 'Stable@2026' })
        .catch((e: HttpException) => e)) as HttpException;
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'RESET_EXPIRED' }));
    });
  });
});
