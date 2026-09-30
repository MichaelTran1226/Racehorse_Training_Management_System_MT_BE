import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

describe('PermissionsGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const guard = new PermissionsGuard(reflector);

  const contextWith = (user: unknown) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const requires = (permission: string | undefined) =>
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) =>
      key === PERMISSION_KEY ? permission : false,
    );

  it('should allow routes that need no permission', () => {
    requires(undefined);
    expect(guard.canActivate(contextWith({ permissions: {} }))).toBe(true);
  });

  it('should allow a user whose permission switch is on', () => {
    requires('manageAccounts');
    expect(guard.canActivate(contextWith({ permissions: { manageAccounts: true } }))).toBe(true);
  });

  it('should refuse a user whose permission switch is off', () => {
    requires('manageAccounts');
    expect(() =>
      guard.canActivate(contextWith({ permissions: { manageAccounts: false } })),
    ).toThrow(ForbiddenException);
  });
});
