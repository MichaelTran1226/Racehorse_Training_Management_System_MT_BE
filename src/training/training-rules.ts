import { WorkoutStatus } from '@prisma/client';

/** 7 loại bài tập cố định (Flow 2 DL-2.01, Q-2.06). */
export const WORKOUT_TYPES = [
  'WALK', // Đi bộ
  'TROT', // Chạy nước kiệu
  'CANTER', // Chạy nước đại nhẹ
  'BREEZE', // Chạy tốc độ
  'TRIAL', // Chạy thử
  'SWIM', // Bơi phục hồi
  'TREADMILL', // Máy đi bộ
] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];

export const INTENSITIES = ['LIGHT', 'MEDIUM', 'HEAVY'] as const;
export type Intensity = (typeof INTENSITIES)[number];

/** Mặt sân của buổi tập. NONE = Không áp dụng (Bơi, Máy đi bộ). */
export const WORKOUT_SURFACES = ['TURF', 'DIRT', 'SYNTHETIC', 'NONE'] as const;

/** Chạy tốc độ và Chạy thử luôn là bài nặng. */
export const ALWAYS_HEAVY_TYPES: string[] = ['BREEZE', 'TRIAL'];
const NO_SURFACE_TYPES: string[] = ['SWIM', 'TREADMILL'];

/** Bài tập nặng = Cường độ Nặng, hoặc Chạy tốc độ / Chạy thử (Flow 2 §4.2). */
export function isHeavy(workoutType?: string | null, intensity?: string | null): boolean {
  return intensity === 'HEAVY' || ALWAYS_HEAVY_TYPES.includes(workoutType ?? '');
}

/** Điều kiện Prisma tìm buổi tập nặng (dùng khi Khóa y tế chặn buổi tập). */
export const HEAVY_WORKOUT_WHERE = {
  OR: [{ intensity: 'HEAVY' }, { workoutType: { in: ALWAYS_HEAVY_TYPES } }],
};

/** Cường độ thật được lưu: Chạy tốc độ / Chạy thử bị ép thành Nặng. */
export function effectiveIntensity(workoutType: string, intensity: string): string {
  return ALWAYS_HEAVY_TYPES.includes(workoutType) ? 'HEAVY' : intensity;
}

/** Mặt sân thật được lưu: Bơi / Máy đi bộ bị ép thành Không áp dụng. */
export function effectiveSurface(workoutType: string, surface: string): string {
  return NO_SURFACE_TYPES.includes(workoutType) ? 'NONE' : surface;
}

/** Buổi tập chưa diễn ra: bị hủy theo khi giáo án kết thúc hoặc ngựa ngừng quản lý. */
export const PENDING_WORKOUT_STATUSES: WorkoutStatus[] = [
  WorkoutStatus.SCHEDULED,
  WorkoutStatus.BLOCKED,
  WorkoutStatus.MISSED,
];

export const MAX_WORKOUTS_PER_DAY = 3; // Q-2.13
export const TRIAL_SLOT_MINUTES = 15; // Q-2.04
export const LATE_RESULT_DAYS = 7; // FR-2.20
export const FIRST_HOUR = 4; // Q-2.12: 04:00
export const LAST_HOUR = 20; // Q-2.12: 20:00

/**
 * Câu lạc bộ ở Việt Nam (UTC+7). Server/CI có thể chạy UTC nên tự quy đổi, không dựa vào múi giờ máy.
 */
export const CLUB_UTC_OFFSET_HOURS = 7;
const OFFSET_MS = CLUB_UTC_OFFSET_HOURS * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Giờ và phút theo giờ câu lạc bộ. */
export function clubTime(d: Date): { hour: number; minute: number } {
  const local = new Date(d.getTime() + OFFSET_MS);
  return { hour: local.getUTCHours(), minute: local.getUTCMinutes() };
}

/** 0 giờ (giờ câu lạc bộ) của ngày chứa thời điểm d, trả về dạng UTC. */
export function startOfClubDay(d: Date): Date {
  const local = new Date(d.getTime() + OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - OFFSET_MS);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Giờ bắt đầu nằm trong 04:00 - 20:00 (tính cả 20:00). */
export function withinTrainingHours(d: Date): boolean {
  const { hour, minute } = clubTime(d);
  if (hour < FIRST_HOUR) return false;
  if (hour > LAST_HOUR) return false;
  return !(hour === LAST_HOUR && minute > 0);
}
