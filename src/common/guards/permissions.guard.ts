import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { apiError } from '../exceptions/api-error';
import { PermissionKey, PermissionMap } from '../../users/permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<PermissionKey>(PERMISSION_KEY, targets);
    if (!required) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const permissions: Partial<PermissionMap> | undefined = user?.permissions;
    if (!permissions?.[required]) {
      throw apiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Not allowed');
    }
    return true;
  }
}
