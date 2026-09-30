import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../../users/permissions';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Chỉ cho người dùng có công tắc quyền này đang bật (vd. manageAccounts).
 * Quyền được Club Manager bật/tắt theo từng tài khoản, không chỉ theo vai trò.
 */
export const RequirePermission = (permission: PermissionKey) =>
  SetMetadata(PERMISSION_KEY, permission);
