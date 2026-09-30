// Bảng quyền theo vai trò — giống FE (src/shared/lib/permissions.ts). Sửa bên nào thì sửa cả bên kia.
import { Role } from '@prisma/client';

export type PermissionKey =
  | 'viewHorses'
  | 'editHorses'
  | 'deleteHorses'
  | 'createPlan'
  | 'assignSchedule'
  | 'recordMetrics'
  | 'ackAlerts'
  | 'viewMedical'
  | 'placeLock'
  | 'liftLock'
  | 'manageAccounts'
  | 'viewAudit';

export type PermissionMap = Record<PermissionKey, boolean>;

export type NotifyKey = 'thresholdAlert' | 'lockLifted' | 'dailyDigest' | 'raceResults';
export type NotifyMap = Record<NotifyKey, boolean>;

export const ROLES: Role[] = [
  Role.HEAD_TRAINER,
  Role.VETERINARIAN,
  Role.GROOM,
  Role.HORSE_OWNER,
  Role.CLUB_MANAGER,
];

export const ROLE_LABEL: Record<Role, string> = {
  HEAD_TRAINER: 'Head Trainer',
  VETERINARIAN: 'Veterinarian',
  GROOM: 'Groom / Stable Hand',
  HORSE_OWNER: 'Horse Owner',
  CLUB_MANAGER: 'Club Manager',
};

interface PermissionMeta {
  key: PermissionKey;
  core?: boolean; // luôn bật với mọi vai trò
  ownerRoles?: Role[]; // chỉ các vai trò này được bật
  alwaysOnFor?: Role[]; // luôn bật với các vai trò này
}

export const PERMISSIONS: PermissionMeta[] = [
  { key: 'viewHorses', core: true },
  { key: 'editHorses' },
  { key: 'deleteHorses', ownerRoles: [Role.CLUB_MANAGER] },
  { key: 'createPlan' },
  { key: 'assignSchedule' },
  { key: 'recordMetrics' },
  { key: 'ackAlerts' },
  { key: 'viewMedical' },
  { key: 'placeLock', ownerRoles: [Role.VETERINARIAN] },
  { key: 'liftLock', ownerRoles: [Role.VETERINARIAN] },
  { key: 'manageAccounts', ownerRoles: [Role.CLUB_MANAGER], alwaysOnFor: [Role.CLUB_MANAGER] },
  { key: 'viewAudit' },
];

const DEFAULT_ON: Record<Role, PermissionKey[]> = {
  HEAD_TRAINER: [
    'viewHorses',
    'editHorses',
    'createPlan',
    'assignSchedule',
    'recordMetrics',
    'ackAlerts',
    'viewMedical',
  ],
  VETERINARIAN: ['viewHorses', 'viewMedical', 'placeLock', 'liftLock'],
  GROOM: ['viewHorses'],
  HORSE_OWNER: ['viewHorses'],
  CLUB_MANAGER: [
    'viewHorses',
    'editHorses',
    'deleteHorses',
    'viewMedical',
    'manageAccounts',
    'viewAudit',
  ],
};

export function defaultPermissions(role: Role): PermissionMap {
  const on = new Set(DEFAULT_ON[role]);
  return Object.fromEntries(PERMISSIONS.map((p) => [p.key, on.has(p.key)])) as PermissionMap;
}

// Giá trị bị ép của một công tắc quyền theo vai trò; undefined = được đổi tự do.
function forcedValue(role: Role, meta: PermissionMeta): boolean | undefined {
  if (meta.core) return true;
  if (meta.alwaysOnFor?.includes(role)) return true;
  if (meta.ownerRoles && !meta.ownerRoles.includes(role)) return false;
  return undefined;
}

// Ép các quyền bị khóa về đúng giá trị; bỏ qua khóa lạ và giá trị không phải boolean.
export function normalizePermissions(
  role: Role,
  map: Partial<Record<string, unknown>>,
): PermissionMap {
  const out = {} as PermissionMap;
  for (const meta of PERMISSIONS) {
    out[meta.key] = forcedValue(role, meta) ?? map[meta.key] === true;
  }
  return out;
}

export const NOTIFY_KEYS: NotifyKey[] = [
  'thresholdAlert',
  'lockLifted',
  'dailyDigest',
  'raceResults',
];

export function defaultNotify(role: Role): NotifyMap {
  return {
    thresholdAlert: role === Role.HEAD_TRAINER,
    lockLifted: true,
    dailyDigest: false,
    raceResults: true,
  };
}

// Threshold Alert: bắt buộc bật với Head Trainer, các vai trò khác không nhận => đều không đổi được.
export function isNotifyLocked(_role: Role, key: NotifyKey): boolean {
  return key === 'thresholdAlert';
}
