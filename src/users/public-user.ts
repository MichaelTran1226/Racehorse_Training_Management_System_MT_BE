// Chuyển bản ghi User => tài khoản gửi xuống FE (khớp PublicAccount ở FE src/shared/types/auth.ts).
// KHÔNG BAO GIỜ có mật khẩu hay mã xác minh.
import { User } from '@prisma/client';
import {
  defaultNotify,
  defaultPermissions,
  normalizePermissions,
  NotifyMap,
  PermissionMap,
} from './permissions';

export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: User['role'];
  status: User['status'];
  createdAt: Date;
  updatedAt: Date;
  lastActive: Date | null;
  requestedAt: Date | null;
  requestCode: string | null;
  lockedAt: Date | null;
  invitedBy: string | null;
  statusReason: string | null;
  statusChangedAt: Date | null;
  statusChangedBy: string | null;
  permissions: PermissionMap;
  permissionsChangedAt: Date | null;
  permissionsChangedBy: string | null;
  notify: NotifyMap;
}

// Cột permissions = null nghĩa là dùng mặc định của vai trò.
export function permissionsOf(user: Pick<User, 'role' | 'permissions'>): PermissionMap {
  const stored = user.permissions;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return defaultPermissions(user.role);
  }
  return normalizePermissions(user.role, stored as Record<string, unknown>);
}

export function notifyOf(user: Pick<User, 'role' | 'notify'>): NotifyMap {
  const stored = user.notify;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return defaultNotify(user.role);
  }
  return { ...defaultNotify(user.role), ...(stored as Partial<NotifyMap>) };
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phoneNumber ?? '',
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastActive: user.lastActive ?? null,
    requestedAt: user.requestedAt ?? null,
    requestCode: user.requestCode ?? null,
    lockedAt: user.lockedAt ?? null,
    invitedBy: user.invitedBy ?? null,
    statusReason: user.statusReason ?? null,
    statusChangedAt: user.statusChangedAt ?? null,
    statusChangedBy: user.statusChangedBy ?? null,
    permissions: permissionsOf(user),
    permissionsChangedAt: user.permissionsChangedAt ?? null,
    permissionsChangedBy: user.permissionsChangedBy ?? null,
    notify: notifyOf(user),
  };
}
