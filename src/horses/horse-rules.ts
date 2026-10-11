import { HttpStatus } from '@nestjs/common';
import { HorseStatus, RetireReason } from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';
import { apiError } from '../common/exceptions/api-error';

/** Tên ngựa: chữ (có dấu tiếng Việt), số, khoảng trắng, ' . - */
export const HORSE_NAME_RE = /^[\p{L}\p{N}\s'.-]+$/u;

/** Mã thẻ RFID: 4-32 ký tự chữ in hoa, số, gạch nối (không bắt buộc tiền tố RFID-). */
export const RFID_RE = /^[A-Z0-9-]{4,32}$/;

/** Bỏ khoảng trắng đầu/cuối và gộp nhiều khoảng trắng liền nhau thành một. */
export function normalizeName(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
}

/** Nhóm Vận hành: HT điều khiển. ACTIVE = Sẵn sàng thi đấu. */
export const OPERATIONAL_STATUSES: HorseStatus[] = [
  HorseStatus.RESTING,
  HorseStatus.IN_TRAINING,
  HorseStatus.ACTIVE,
];

/** Nhóm Y tế: VET điều khiển. */
export const MEDICAL_STATUSES: HorseStatus[] = [
  HorseStatus.UNDER_OBSERVATION,
  HorseStatus.INJURED,
  HorseStatus.ISOLATED,
];

export interface StatusChangeInput {
  role: string;
  from: HorseStatus;
  to: HorseStatus;
  isMedicalLocked: boolean;
  reason?: string;
  retireReason?: RetireReason | null;
  /** Lý do ngừng quản lý hiện tại của ngựa (khi from = RETIRED). */
  currentRetireReason?: RetireReason | null;
}

function deny(code: string, message: string): never {
  throw apiError(HttpStatus.FORBIDDEN, code, message);
}

function requireReason(reason?: string): void {
  if (!reason || reason.trim().length < 10) {
    throw apiError(HttpStatus.BAD_REQUEST, 'REASON_REQUIRED', 'Lý do phải từ 10 đến 500 ký tự.');
  }
}

/**
 * Bảng chuyển trạng thái Flow 1 §4.2 (quyết định Q14 = C). Ném lỗi nếu không được phép.
 *
 * - HT: chỉ đổi trong nhóm Vận hành, bị chặn khi đang Khóa huấn luyện.
 * - VET: Vận hành -> Y tế, Y tế -> Y tế bất kỳ lúc nào; Y tế -> RESTING/IN_TRAINING chỉ khi không khóa.
 * - CM: chỉ Ngừng quản lý (RETIRED, kèm lý do) và Kích hoạt lại (RETIRED -> RESTING).
 * - Ngựa đã Ngừng quản lý: chỉ CM kích hoạt lại, trừ khi lý do là Đã chết.
 */
export function assertStatusTransition(input: StatusChangeInput): void {
  const { role, from, to, isMedicalLocked, reason } = input;

  if (from === to) {
    throw apiError(HttpStatus.BAD_REQUEST, 'SAME_STATUS', `Horse is already in status ${to}.`);
  }

  if (from === HorseStatus.RETIRED) {
    if (role !== UserRole.CLUB_MANAGER || to !== HorseStatus.RESTING) {
      deny(
        'HORSE_RETIRED',
        'Ngựa đã ngừng quản lý. Chỉ Quản lý CLB được kích hoạt lại về Nghỉ ngơi.',
      );
    }
    if (input.currentRetireReason === RetireReason.DECEASED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'HORSE_DECEASED',
        'Không thể kích hoạt lại hồ sơ ngựa đã chết.',
      );
    }
    requireReason(reason);
    return;
  }

  if (role === UserRole.CLUB_MANAGER) {
    if (to !== HorseStatus.RETIRED) {
      deny(
        'ROLE_RESTRICTION',
        'Quản lý CLB chỉ được Ngừng quản lý hoặc Kích hoạt lại. Trạng thái vận hành do HLV trưởng đổi, trạng thái y tế do Bác sĩ thú y đổi.',
      );
    }
    if (!input.retireReason) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'RETIRE_REASON_REQUIRED',
        'Vui lòng chọn lý do ngừng quản lý.',
      );
    }
    if (isMedicalLocked && input.retireReason !== RetireReason.DECEASED) {
      deny(
        'MEDICAL_LOCK_ACTIVE',
        'Ngựa đang Khóa huấn luyện: chỉ được Ngừng quản lý với lý do Đã chết.',
      );
    }
    requireReason(reason);
    return;
  }

  if (role === UserRole.HEAD_TRAINER) {
    if (!OPERATIONAL_STATUSES.includes(from) || !OPERATIONAL_STATUSES.includes(to)) {
      deny(
        'ROLE_RESTRICTION',
        'HLV trưởng chỉ được đổi giữa Nghỉ ngơi, Đang tập luyện và Sẵn sàng thi đấu.',
      );
    }
    if (isMedicalLocked) {
      deny('MEDICAL_LOCK_ACTIVE', 'Ngựa đang Khóa huấn luyện. Chỉ Bác sĩ thú y gỡ khóa ở Flow 3.');
    }
    return;
  }

  if (role === UserRole.VETERINARIAN) {
    const toMedical = MEDICAL_STATUSES.includes(to);
    const backToWork =
      MEDICAL_STATUSES.includes(from) &&
      (to === HorseStatus.RESTING || to === HorseStatus.IN_TRAINING);
    if (!toMedical && !backToWork) {
      deny(
        'ROLE_RESTRICTION',
        'Bác sĩ thú y chỉ được đưa ngựa vào nhóm y tế, đổi trong nhóm y tế, hoặc trả về Nghỉ ngơi / Đang tập luyện.',
      );
    }
    if (backToWork && isMedicalLocked) {
      deny('MEDICAL_LOCK_ACTIVE', 'Ngựa đang Khóa huấn luyện. Hãy gỡ khóa ở Flow 3 trước.');
    }
    requireReason(reason);
    return;
  }

  deny('ROLE_RESTRICTION', 'Bạn không có quyền đổi trạng thái ngựa.');
}
