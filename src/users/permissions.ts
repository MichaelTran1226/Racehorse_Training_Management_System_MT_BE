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
  // API giáo án / buổi tập / kết quả chỉ mở cho HT (Flow 2), nên công tắc chỉ có nghĩa với HT.
  { key: 'createPlan', ownerRoles: [Role.HEAD_TRAINER] },
  { key: 'assignSchedule', ownerRoles: [Role.HEAD_TRAINER] },
  { key: 'recordMetrics', ownerRoles: [Role.HEAD_TRAINER] },
  // Q-0.04: chỉ Bác sĩ thú y ghi nhận cảnh báo dấu hiệu bất thường.
  { key: 'ackAlerts', ownerRoles: [Role.VETERINARIAN] },
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
    'viewMedical',
  ],
  VETERINARIAN: ['viewHorses', 'viewMedical', 'placeLock', 'liftLock', 'ackAlerts'],
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
// Quyền chưa có trong bản đã lưu (quyền mới thêm sau) lấy theo mặc định của vai trò.
export function normalizePermissions(
  role: Role,
  map: Partial<Record<string, unknown>>,
): PermissionMap {
  const defaults = defaultPermissions(role);
  const out = {} as PermissionMap;
  for (const meta of PERMISSIONS) {
    const stored = map[meta.key];
    out[meta.key] =
      forcedValue(role, meta) ?? (stored === undefined ? defaults[meta.key] : stored === true);
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
    // Q-0.04: cảnh báo dấu hiệu bất thường chỉ báo tới Bác sĩ thú y.
    thresholdAlert: role === Role.VETERINARIAN,
    lockLifted: true,
    dailyDigest: false,
    raceResults: true,
  };
}

// Threshold Alert: bắt buộc bật với Bác sĩ thú y, các vai trò khác không nhận => đều không đổi được.
export function isNotifyLocked(_role: Role, key: NotifyKey): boolean {
  return key === 'thresholdAlert';
}
