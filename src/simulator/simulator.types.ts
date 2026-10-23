import { SimulatorSession, SimulatorSessionStatus, SimulatorSessionType } from '@prisma/client';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

export interface LiveSimulatorSession {
  sessionId: string;
  type: SimulatorSessionType;
  status: SimulatorSessionStatus;
  horseIds: string[];
  actorUserId: string;
  startedAt: Date;
  finishedAt?: Date | null;
  lastSnapshot: any;
  result?: any;
  updatedAt: Date;
}

export interface SimulatorSessionsResponse {
  active: LiveSimulatorSession[];
  recent: SimulatorSession[];
}

export interface WorkoutSimulationStartResponse {
  sessionId: string;
  status: SimulatorSessionStatus;
  launchUrl: string;
}

export interface WorkoutSimulationResultResponse {
  sessionId: string;
  status: SimulatorSessionStatus;
  resultDraft: {
    actualTimeSeconds?: number;
    actualDistanceMeters?: number;
    heartRatePeak?: number;
    heartRateRecovery?: number;
    topSpeedKmh?: number;
    actualSurface?: 'TURF' | 'DIRT' | 'SYNTHETIC';
    trackCondition?: 'GOOD' | 'SOFT' | 'HEAVY';
  } | null;
}

export interface WorkoutSimulationContext {
  sessionId: string;
  status: SimulatorSessionStatus;
  horse: {
    id: string;
    horseCode: string | null;
    name: string;
    microchipRfid: string;
    breed: string;
    dob: Date;
    gender: string;
    color: string;
    status: string;
    isMedicalLocked: boolean;
  };
  workout: {
    id: string;
    scheduledDate: Date;
    workoutType: string | null;
    intensity: string | null;
    distanceMeters: number;
    repetitions: number;
    targetSpeedKmh: number | null;
    targetDurationSeconds: number | null;
    trackSurface: string | null;
  };
}

export interface SimulatorAck {
  accepted: boolean;
  id?: string;
  code?: string;
  message?: string;
}

export interface AuthenticatedSocketData {
  user: CurrentUserPayload;
}
