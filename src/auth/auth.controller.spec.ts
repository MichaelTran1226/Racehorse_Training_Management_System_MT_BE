import { Test, TestingModule } from '@nestjs/testing';
import { Role, UserStatus } from '@prisma/client';
import { Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  const mockAuthResponse = {
    accessToken: 'mock-access-jwt',
    refreshToken: 'mock-refresh-token',
    expiresIn: 900,
    tokenType: 'Bearer',
    user: {
      id: 'user-uuid-1',
      email: 'manager@equiflow.com',
      fullName: 'Michael Tran (Club Manager)',
      phoneNumber: '+84901234567',
      role: Role.CLUB_MANAGER,
      status: UserStatus.ACTIVE,
      dashboardUrl: '/manager/dashboard',
    },
  };

  const mockAuthService = {
    login: jest.fn().mockResolvedValue(mockAuthResponse),
    refreshToken: jest.fn().mockResolvedValue({
      accessToken: 'new-access-jwt',
      refreshToken: 'new-refresh-token',
      expiresIn: 900,
      tokenType: 'Bearer',
    }),
    logout: jest.fn().mockResolvedValue({ success: true, message: 'Logged out successfully' }),
    getMe: jest.fn().mockResolvedValue(mockAuthResponse.user),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: OtpService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should delegate login to AuthService and return auth payload', async () => {
      const loginDto = { email: 'manager@equiflow.com', password: 'Password123' };
      const req = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'Jest-Agent' },
      } as unknown as Request;

      const result = await controller.login(loginDto, req);

      expect(result).toEqual(mockAuthResponse);
      expect(service.login).toHaveBeenCalledWith(loginDto, '127.0.0.1', 'Jest-Agent');
    });
  });

  describe('refreshToken', () => {
    it('should delegate token rotation to AuthService', async () => {
      const refreshDto = { refreshToken: 'valid-refresh-token' };
      const result = await controller.refreshToken(refreshDto);

      expect(result.accessToken).toBe('new-access-jwt');
      expect(service.refreshToken).toHaveBeenCalledWith(refreshDto);
    });
  });

  describe('logout', () => {
    it('should delegate logout to AuthService', async () => {
      const req = {
        user: { userId: 'user-uuid-1' },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'Jest-Agent' },
      } as unknown as Request;

      const result = await controller.logout({ refreshToken: 'some-token' }, req);

      expect(result.success).toBe(true);
      expect(service.logout).toHaveBeenCalledWith(
        'user-uuid-1',
        'some-token',
        '127.0.0.1',
        'Jest-Agent',
      );
    });
  });

  describe('getMe', () => {
    it('should delegate getMe to AuthService', async () => {
      const result = await controller.getMe('user-uuid-1');

      expect(result).toEqual(mockAuthResponse.user);
      expect(service.getMe).toHaveBeenCalledWith('user-uuid-1');
    });
  });
});
