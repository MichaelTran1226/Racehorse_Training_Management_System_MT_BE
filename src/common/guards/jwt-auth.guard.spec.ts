import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should return true if route is marked as public', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const mockContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should delegate to super.canActivate when route is not public', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const mockContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({}),
          getResponse: jest.fn().mockReturnValue({}),
        }),
      } as unknown as ExecutionContext;

      // Mock super.canActivate
      const superCanActivateSpy = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockReturnValue(true);

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
      superCanActivateSpy.mockRestore();
    });
  });

  describe('handleRequest', () => {
    it('should return user when authentication succeeds', () => {
      const mockUser = { userId: 'u1', email: 'test@equiflow.com', role: 'CLUB_MANAGER' };
      const result = guard.handleRequest(null, mockUser, null);
      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException when user is not present', () => {
      expect(() => {
        guard.handleRequest(null, null, { message: 'jwt expired' });
      }).toThrow(UnauthorizedException);
    });

    it('should throw original error when err is present', () => {
      const error = new Error('Custom auth error');
      expect(() => {
        guard.handleRequest(error, null, null);
      }).toThrow(error);
    });
  });
});
