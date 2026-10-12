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

// ---------------------------------------------------------------- Giai đoạn (SC-2.03)

export const PHASE_TYPES = ['BASE', 'BUILD', 'SPEED', 'PRE_RACE', 'RECOVERY'] as const;
export const PHASE_SURFACES = ['TURF', 'DIRT', 'SYNTHETIC'] as const;
export const MAX_PHASES = 12;
export const MAX_PLAN_WEEKS = 52;

/** Một giai đoạn lưu trong TrainingPlan.phases (JSON). Ngày dạng YYYY-MM-DD theo giờ câu lạc bộ. */
export interface PlanPhase {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  goal?: string;
  sessionsPerWeek: number;
  maxWeeklyDistance: number;
  surface: string;
  targetSpeedKmh?: number;
}

/** YYYY-MM-DD (giờ câu lạc bộ) của một thời điểm. */
export function clubDate(d: Date): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Kiểm danh sách giai đoạn: 1-12 giai đoạn, đủ ô bắt buộc, nằm trong thời gian giáo án,
 * không chồng nhau. Trả về danh sách đã chuẩn hóa và sắp theo Từ ngày, hoặc chuỗi lỗi (mã + câu).
 */
export function validatePhases(
  raw: unknown,
  planStart: string,
  planEnd: string,
): { phases: PlanPhase[] } | { code: string; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { code: 'PHASES_REQUIRED', message: 'Giáo án phải có ít nhất 1 giai đoạn.' };
  }
  if (raw.length > MAX_PHASES) {
    return { code: 'TOO_MANY_PHASES', message: 'Giáo án tối đa 12 giai đoạn.' };
  }
  const bad = (message: string) => ({ code: 'INVALID_PHASE', message });
  const phases: PlanPhase[] = [];
  for (const [i, p] of (raw as Record<string, unknown>[]).entries()) {
    const name = String(p?.name ?? '').trim();
    if (name.length < 2 || name.length > 100) {
      return bad('Tên giai đoạn phải từ 2 đến 100 ký tự.');
    }
    if (!PHASE_TYPES.includes(p.type as never)) return bad('Vui lòng chọn loại giai đoạn.');
    const start = String(p.startDate ?? '').slice(0, 10);
    const end = String(p.endDate ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) {
      return bad(`Giai đoạn ${name}: Đến ngày phải sau hoặc bằng Từ ngày.`);
    }
    if (start < planStart || end > planEnd) {
      return bad(`Giai đoạn ${name} phải nằm trong thời gian của giáo án.`);
    }
    const perWeek = Number(p.sessionsPerWeek);
    if (!Number.isInteger(perWeek) || perWeek < 1 || perWeek > 14) {
      return bad('Số buổi mỗi tuần phải từ 1 đến 14.');
    }
    const maxDist = Number(p.maxWeeklyDistance);
    if (!Number.isInteger(maxDist) || maxDist < 500 || maxDist > 60000) {
      return bad('Cự ly tối đa mỗi tuần phải từ 500 đến 60 000 m.');
    }
    if (!PHASE_SURFACES.includes(p.surface as never)) return bad('Vui lòng chọn mặt sân.');
    const speed =
      p.targetSpeedKmh == null || p.targetSpeedKmh === '' ? undefined : Number(p.targetSpeedKmh);
    if (speed !== undefined && (Number.isNaN(speed) || speed < 10 || speed > 70)) {
      return bad('Tốc độ mục tiêu phải từ 10 đến 70 km/h.');
    }
    const goal = p.goal == null ? undefined : String(p.goal).trim();
    if (goal && goal.length > 500) return bad('Mục tiêu tối đa 500 ký tự.');
    phases.push({
      id: typeof p.id === 'string' && p.id ? p.id : `ph-${Date.now()}-${i}`,
      name,
      type: String(p.type),
      startDate: start,
      endDate: end,
      goal: goal || undefined,
      sessionsPerWeek: perWeek,
      maxWeeklyDistance: maxDist,
      surface: String(p.surface),
      targetSpeedKmh: speed,
    });
  }
  phases.sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let i = 1; i < phases.length; i++) {
    if (phases[i].startDate <= phases[i - 1].endDate) {
      return {
        code: 'PHASE_OVERLAP',
        message: `Giai đoạn bị trùng thời gian với giai đoạn ${phases[i - 1].name}.`,
      };
    }
  }
  return { phases };
}

// ---------------------------------------------------------------- Điểm tải (SC-2.01, SC-2.07)

const INTENSITY_FACTOR: Record<string, number> = { LIGHT: 1, MEDIUM: 2, HEAVY: 3 };

/** Điểm tải một buổi = Cự ly (km) × Số hiệp × Hệ số cường độ (1/2/3). */
export function workoutLoad(w: {
  distanceMeters: number;
  actualDistanceMeters?: number | null;
  repetitions?: number | null;
  intensity?: string | null;
}): number {
  // Có cự ly thực tế (đã gồm các hiệp) thì dùng nó, không thì lấy kế hoạch × số hiệp.
  const km = w.actualDistanceMeters
    ? w.actualDistanceMeters / 1000
    : (w.distanceMeters * (w.repetitions ?? 1)) / 1000;
  return Math.round(km * (INTENSITY_FACTOR[w.intensity ?? 'MEDIUM'] ?? 2) * 10) / 10;
}

export const LOAD_SPIKE_RATIO = 1.3; // Q-2.10: 130% trung bình tuần của 4 tuần trước

/** 0 giờ thứ Hai (giờ câu lạc bộ) của tuần chứa d, dạng UTC. */
export function startOfClubWeek(d: Date): Date {
  const day = startOfClubDay(d);
  const weekday = new Date(day.getTime() + OFFSET_MS).getUTCDay(); // 0 = Chủ nhật
  return addDays(day, -((weekday + 6) % 7));
}

// ---------------------------------------------------------------- Kết quả buổi tập (SC-2.06)

/** Không bắt buộc nhập thời gian chạy với các loại này. */
export const NO_TIME_TYPES: string[] = ['WALK', 'SWIM', 'TREADMILL'];
/** Tốc độ trung bình chỉ tính cho các buổi chạy (SC-2.07). */
export const SPEED_TYPES: string[] = ['CANTER', 'BREEZE', 'TRIAL'];
export const COMPLETION_LEVELS = ['ACHIEVED', 'PARTIAL', 'NOT_ACHIEVED'] as const;
export const TRACK_CONDITIONS = ['GOOD', 'SOFT', 'HEAVY', 'FIRM'] as const;
export const ABNORMAL_SIGNS = [
  'LAMENESS',
  'PROLONGED_BREATHING',
  'NOSEBLEED',
  'LEG_SWELLING',
  'OFF_FEED',
  'OTHER',
] as const;
