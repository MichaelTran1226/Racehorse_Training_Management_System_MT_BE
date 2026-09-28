import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

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

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
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

    it('should throw ForbiddenException when user account is SUSPENDED', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: UserStatus.SUSPENDED,
      });
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));

      await expect(
        service.login({ email: 'manager@equiflow.com', password: 'ValidPassword' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user account is PENDING_VERIFICATION', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: UserStatus.PENDING_VERIFICATION,
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
        user: { ...mockUser, status: UserStatus.SUSPENDED },
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
});
