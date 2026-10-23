import { HorseStatus, RetireReason } from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';
import {
  assertStatusTransition,
  HORSE_NAME_RE,
  normalizeName,
  StatusChangeInput,
} from './horse-rules';

const REASON = 'Lý do đủ mười ký tự';

/** Trả về mã lỗi (code) nếu bị chặn, hoặc 'OK' nếu được phép. */
function check(
  input: Partial<StatusChangeInput> & Pick<StatusChangeInput, 'role' | 'from' | 'to'>,
) {
  try {
    assertStatusTransition({ isMedicalLocked: false, ...input });
    return 'OK';
  } catch (e: any) {
    return e.getResponse().code;
  }
}

describe('horse-rules', () => {
  describe('HT (Head Trainer)', () => {
    const role = UserRole.HEAD_TRAINER;

    it('moves freely inside the operational group, reason optional', () => {
      expect(check({ role, from: HorseStatus.RESTING, to: HorseStatus.IN_TRAINING })).toBe('OK');
      expect(check({ role, from: HorseStatus.IN_TRAINING, to: HorseStatus.ACTIVE })).toBe('OK');
      expect(check({ role, from: HorseStatus.ACTIVE, to: HorseStatus.RESTING })).toBe('OK');
    });

    it('cannot touch medical statuses or retire', () => {
      expect(check({ role, from: HorseStatus.RESTING, to: HorseStatus.INJURED })).toBe(
        'ROLE_RESTRICTION',
      );
      expect(check({ role, from: HorseStatus.INJURED, to: HorseStatus.RESTING })).toBe(
        'ROLE_RESTRICTION',
      );
      expect(check({ role, from: HorseStatus.RESTING, to: HorseStatus.RETIRED })).toBe(
        'ROLE_RESTRICTION',
      );
    });

    it('is blocked while the horse is under a training lock', () => {
      expect(
        check({
          role,
          from: HorseStatus.RESTING,
          to: HorseStatus.IN_TRAINING,
          isMedicalLocked: true,
        }),
      ).toBe('MEDICAL_LOCK_ACTIVE');
    });
  });

  describe('VET', () => {
    const role = UserRole.VETERINARIAN;

    it('moves operational -> medical and medical -> medical, even when locked', () => {
      expect(
        check({
          role,
          from: HorseStatus.ACTIVE,
          to: HorseStatus.UNDER_OBSERVATION,
          reason: REASON,
        }),
      ).toBe('OK');
      expect(
        check({
          role,
          from: HorseStatus.INJURED,
          to: HorseStatus.ISOLATED,
          isMedicalLocked: true,
          reason: REASON,
        }),
      ).toBe('OK');
    });

    it('returns to RESTING / IN_TRAINING only when not locked', () => {
      expect(
        check({ role, from: HorseStatus.INJURED, to: HorseStatus.RESTING, reason: REASON }),
      ).toBe('OK');
      expect(
        check({
          role,
          from: HorseStatus.INJURED,
          to: HorseStatus.IN_TRAINING,
          isMedicalLocked: true,
          reason: REASON,
        }),
      ).toBe('MEDICAL_LOCK_ACTIVE');
    });

    it('cannot set ACTIVE (Ready to race) nor move inside the operational group', () => {
      expect(
        check({ role, from: HorseStatus.INJURED, to: HorseStatus.ACTIVE, reason: REASON }),
      ).toBe('ROLE_RESTRICTION');
      expect(
        check({ role, from: HorseStatus.RESTING, to: HorseStatus.IN_TRAINING, reason: REASON }),
      ).toBe('ROLE_RESTRICTION');
    });

    it('must give a reason of at least 10 characters', () => {
      expect(check({ role, from: HorseStatus.ACTIVE, to: HorseStatus.INJURED })).toBe(
        'REASON_REQUIRED',
      );
    });
  });

  describe('CM (Club Manager)', () => {
    const role = UserRole.CLUB_MANAGER;

    it('retires with a retire reason and a note', () => {
      expect(
        check({
          role,
          from: HorseStatus.ACTIVE,
          to: HorseStatus.RETIRED,
          retireReason: RetireReason.SOLD,
          reason: REASON,
        }),
      ).toBe('OK');
      expect(
        check({ role, from: HorseStatus.ACTIVE, to: HorseStatus.RETIRED, reason: REASON }),
      ).toBe('RETIRE_REASON_REQUIRED');
    });

    it('while locked can only retire as DECEASED', () => {
      const locked = {
        role,
        from: HorseStatus.INJURED,
        to: HorseStatus.RETIRED,
        isMedicalLocked: true,
        reason: REASON,
      };
      expect(check({ ...locked, retireReason: RetireReason.SOLD })).toBe('MEDICAL_LOCK_ACTIVE');
      expect(check({ ...locked, retireReason: RetireReason.DECEASED })).toBe('OK');
    });

    it('reactivates RETIRED -> RESTING, except a deceased horse', () => {
      const base = { role, from: HorseStatus.RETIRED, to: HorseStatus.RESTING, reason: REASON };
      expect(check({ ...base, currentRetireReason: RetireReason.RETIRED })).toBe('OK');
      expect(check({ ...base, currentRetireReason: RetireReason.DECEASED })).toBe('HORSE_DECEASED');
    });

    it('cannot set operational or medical statuses directly', () => {
      expect(
        check({ role, from: HorseStatus.RESTING, to: HorseStatus.IN_TRAINING, reason: REASON }),
      ).toBe('ROLE_RESTRICTION');
      expect(
        check({ role, from: HorseStatus.RESTING, to: HorseStatus.INJURED, reason: REASON }),
      ).toBe('ROLE_RESTRICTION');
    });
  });

  it('nobody but CM can move a horse out of RETIRED', () => {
    expect(
      check({ role: UserRole.HEAD_TRAINER, from: HorseStatus.RETIRED, to: HorseStatus.RESTING }),
    ).toBe('HORSE_RETIRED');
  });

  it('rejects a change to the same status', () => {
    expect(
      check({ role: UserRole.HEAD_TRAINER, from: HorseStatus.RESTING, to: HorseStatus.RESTING }),
    ).toBe('SAME_STATUS');
  });

  describe('name and RFID formats', () => {
    it('accepts Vietnamese horse names and collapses extra spaces', () => {
      expect(HORSE_NAME_RE.test('Gió Bấc Đồng Nai')).toBe(true);
      expect(HORSE_NAME_RE.test("O'Brien Jr.")).toBe(true);
      expect(HORSE_NAME_RE.test('Bad<script>')).toBe(false);
      expect(normalizeName('  Sao   Mai ')).toBe('Sao Mai');
    });
  });
});
