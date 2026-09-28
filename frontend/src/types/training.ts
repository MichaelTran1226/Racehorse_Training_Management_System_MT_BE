export type TrainingPhase = 'foundation' | 'endurance' | 'speed' | 'tapering';
export type TrackType = 'turf' | 'dirt' | 'synthetic';
export type IntensityLevel = 'light' | 'medium' | 'high' | 'max';
export type SessionShift = 'morning' | 'afternoon';
export type SessionStatus = 'scheduled' | 'in_progress' | 'completed' | 'suspended';
export type EvaluationAssessment = 'excellent' | 'standard' | 'needs_adjustment' | 'aborted';

export interface MedicalLockInfo {
  lockId: string;
  medicalRecordId: string;
  diagnosis: string;
  vetName: string;
  vetTitle: string;
  lockedAt: string;
  expectedUnlockDate: string;
  suspendedSessions: Array<{
    id: string;
    title: string;
    date: string;
    time: string;
    track: string;
  }>;
  criteriaForUnlock: string;
}

export interface Horse {
  id: string;
  code: string; // e.g. A01
  name: string;
  microchipRfid: string;
  stall: string;
  age: number;
  breed: string;
  gender: 'Đực' | 'Cái' | 'Thiến';
  fitnessScore: number; // 0 - 100
  status: 'Fit_To_Race' | 'Training' | 'Injured' | 'Quarantine';
  isMedicalLocked: boolean;
  medicalLockInfo?: MedicalLockInfo;
  vetName: string;
  assignedTrainer: string;
  primaryJockeyId?: string;
  primaryGroomId?: string;
}

export interface Jockey {
  id: string;
  name: string;
  weightKg: number;
  experienceYears: number;
  performanceScore: number;
  phone?: string;
}

export interface Groom {
  id: string;
  name: string;
  specialty: string;
}

export interface TrainingPlan {
  id: string;
  title: string;
  horseId: string;
  horseName: string;
  horseCode: string;
  phase: TrainingPhase;
  startDate: string;
  endDate: string;
  distanceMeters: number; // 100 - 3000m
  jockeyWeightKg: number; // 45 - 65kg
  intensity: IntensityLevel;
  trackType: TrackType;
  targetSpeedKmh: number;
  maxHeartRateBpm: number;
  tacticalNotes: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  createdAt: string;
}

export interface WorkoutSession {
  id: string;
  dayOfWeek: string; // Thứ Hai, Thứ Ba,...
  date: string; // YYYY-MM-DD
  shift: SessionShift; // morning | afternoon
  timeSlot: string; // "06:00 - 07:15"
  horseId: string;
  horseName: string;
  horseCode: string;
  stall: string;
  exerciseTitle: string;
  distanceMeters: number;
  trackType: TrackType;
  intensity: IntensityLevel;
  jockeyId: string;
  jockeyName: string;
  groomId: string;
  groomName: string;
  status: SessionStatus;
  isMedicalLocked: boolean;
  notes?: string;
}

export interface MetricHistoryPoint {
  date: string;
  heartRateBpm: number;
  finishTimeSeconds: number;
  speedKmh: number;
  score: number;
}

export interface SessionEvaluation {
  id: string;
  sessionId: string;
  horseId: string;
  horseName: string;
  horseCode: string;
  horseChip: string;
  stall: string;
  sessionDate: string;
  sessionTime: string;
  trackType: TrackType;
  exerciseTitle: string;
  plannedDistanceMeters: number;
  actualDistanceMeters: number;
  finishTimeSeconds: number;
  averageSpeedKmh: number;
  recoveryHeartRateBpm: number;
  measuredAfterMinutes: number;
  assessment: EvaluationAssessment;
  score: number; // 1 - 10
  trainerRemarks: string;
  recordedBy: string;
  recordedAt: string;
  historyPoints: MetricHistoryPoint[];
}
