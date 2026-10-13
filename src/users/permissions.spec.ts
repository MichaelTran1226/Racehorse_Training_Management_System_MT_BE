import { Role } from '@prisma/client';
import { defaultPermissions, isNotifyLocked, normalizePermissions } from './permissions';
import { permissionsOf, toPublicUser } from './public-user';

describe('permissions', () => {
  it('should give each role its default permissions', () => {
    expect(defaultPermissions(Role.CLUB_MANAGER).manageAccounts).toBe(true);
    expect(defaultPermissions(Role.VETERINARIAN).placeLock).toBe(true);
    expect(defaultPermissions(Role.GROOM)).toEqual(
      expect.objectContaining({ viewHorses: true, editHorses: false, manageAccounts: false }),
    );
  });

  it('should force locked switches regardless of what the client sends', () => {
    const result = normalizePermissions(Role.HEAD_TRAINER, {
      viewHorses: false, // core => luôn bật
      manageAccounts: true, // chỉ Club Manager
      placeLock: true, // chỉ Veterinarian
      createPlan: true, // đổi tự do
      unknownKey: true,
    });
    expect(result.viewHorses).toBe(true);
    expect(result.manageAccounts).toBe(false);
    expect(result.placeLock).toBe(false);
    expect(result.createPlan).toBe(true);
    expect(result).not.toHaveProperty('unknownKey');
  });

  it('should keep manageAccounts always on for a Club Manager', () => {
    expect(normalizePermissions(Role.CLUB_MANAGER, { manageAccounts: false }).manageAccounts).toBe(
      true,
    );
  });

  it('only a Veterinarian acknowledges and is notified of abnormal-sign alerts (Q-0.04)', () => {
    expect(defaultPermissions(Role.VETERINARIAN).ackAlerts).toBe(true);
    expect(defaultPermissions(Role.HEAD_TRAINER).ackAlerts).toBe(false);
    expect(normalizePermissions(Role.CLUB_MANAGER, { ackAlerts: true }).ackAlerts).toBe(false);
  });

  it('a permission missing from the stored map falls back to the role default', () => {
    expect(normalizePermissions(Role.VETERINARIAN, { placeLock: true }).ackAlerts).toBe(true);
    expect(normalizePermissions(Role.VETERINARIAN, { ackAlerts: false }).ackAlerts).toBe(false);
  });

  it('should lock only the threshold alert notification', () => {
    expect(isNotifyLocked(Role.HEAD_TRAINER, 'thresholdAlert')).toBe(true);
    expect(isNotifyLocked(Role.HEAD_TRAINER, 'dailyDigest')).toBe(false);
  });

  it('should fall back to role defaults when the stored permissions are null', () => {
    expect(permissionsOf({ role: Role.VETERINARIAN, permissions: null }).liftLock).toBe(true);
  });

  it('should never expose the password hash in the public user', () => {
    const publicUser = toPublicUser({
      id: 'u1',
      email: 'a@gmail.com',
      passwordHash: 'secret-hash',
      fullName: 'A',
      phoneNumber: null,
      role: Role.GROOM,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastActive: null,
      requestedAt: null,
      requestCode: null,
      lockedAt: null,
      invitedBy: null,
      statusReason: null,
      statusChangedAt: null,
      statusChangedBy: null,
      permissions: null,
      permissionsChangedAt: null,
      permissionsChangedBy: null,
      notify: null,
    });
    expect(publicUser).not.toHaveProperty('passwordHash');
    expect(publicUser).not.toHaveProperty('verificationCode');
    expect(publicUser.phone).toBe('');
  });
});
