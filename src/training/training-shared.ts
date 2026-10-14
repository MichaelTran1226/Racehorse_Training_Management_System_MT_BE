// Hằng số, kiểu và hàm nhỏ dùng chung giữa các service giáo án / buổi tập (C-10).
import { HorseStatus, PlanStatus, Prisma } from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PlanPhase } from './training-rules';

export type Tx = Prisma.TransactionClient;

export const MEDICAL_STATUSES: HorseStatus[] = [
  HorseStatus.UNDER_OBSERVATION,
  HorseStatus.INJURED,
  HorseStatus.ISOLATED,
];

export const CANCEL_REASON_LABEL: Record<string, string> = {
  WEATHER: 'Thời tiết',
  TRACK_CONDITION: 'Mặt sân không đảm bảo',
  HORSE_HEALTH: 'Sức khỏe ngựa',
  PLAN_CHANGE: 'Thay đổi kế hoạch',
  OTHER: 'Khác',
};

export const RESULT_EDIT_HOURS = 48; // Q-2.11
export const MAX_REPEAT_WORKOUTS = 60; // DL-2.01
export const HEAVY_GAP_HOURS = 48; // cảnh báo 2 bài nặng cách nhau < 48 giờ
export const GROOM_OVERLAP_MINUTES = 30; // cảnh báo nhân viên chăm sóc trùng giờ

export const PLAN_INCLUDE = {
  horse: {
    select: {
      id: true,
      name: true,
      horseCode: true,
      status: true,
      isMedicalLocked: true,
      avatarUrl: true,
      ownerId: true,
    },
  },
  trainer: { select: { id: true, fullName: true, email: true } },
  _count: { select: { workoutSessions: true } },
} satisfies Prisma.TrainingPlanInclude;

export const WORKOUT_INCLUDE = {
  horse: {
    select: {
      id: true,
      name: true,
      horseCode: true,
      isMedicalLocked: true,
      status: true,
      ownerId: true,
      // Ô chuồng đang ở: hiện trên "Lịch tập của tôi" của Groom (SC-2.08)
      stallAllocations: {
        where: { isActive: true },
        take: 1,
        select: { stall: { select: { code: true } } },
      },
    },
  },
  assignedStaff: { select: { id: true, fullName: true } },
  trainingPlan: { select: { id: true, phaseName: true, status: true, phases: true } },
  resultRecordedBy: { select: { id: true, fullName: true } },
  resultUpdatedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.WorkoutSessionInclude;

/** Dữ liệu buổi tập sau khi gộp bản cũ + thay đổi, dùng chung cho kiểm tra DL-2.01. */
export interface WorkoutDraft {
  scheduledDate: Date;
  phaseId?: string | null;
  workoutType: string;
  intensity: string;
  trackSurface: string;
  distanceMeters: number;
  repetitions: number;
  targetSpeedKmh?: number | null;
  jockeyName?: string | null;
  assignedStaffUserId: string;
  vetConsulted?: boolean;
}

export type PlanForCheck = {
  id: string;
  status: PlanStatus;
  horseId: string;
  startDate: Date;
  endDate: Date;
  phases: Prisma.JsonValue;
};

/** Đọc danh sách giai đoạn từ cột JSON (giáo án cũ có thể thiếu trường -> bỏ qua). */
export function phasesOf(plan: { phases: Prisma.JsonValue }): PlanPhase[] {
  return Array.isArray(plan.phases) ? (plan.phases as unknown as PlanPhase[]) : [];
}

/** GROOM không thấy điểm phong độ (Q-2.09). */
export function hideScoreForGroom<T extends { performanceScore: number | null }>(
  row: T,
  user: CurrentUserPayload,
): T {
  return user.role === UserRole.GROOM ? { ...row, performanceScore: null } : row;
}
