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

export interface SimulatorAck {
  accepted: boolean;
  id?: string;
  code?: string;
  message?: string;
}

export interface AuthenticatedSocketData {
  user: CurrentUserPayload;
}
