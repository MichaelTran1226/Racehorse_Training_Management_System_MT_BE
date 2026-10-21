import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class SimulatorRealtimeService {
  private readonly logger = new Logger(SimulatorRealtimeService.name);
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  emit(event: string, payload: any): void {
    if (!this.server) {
      this.logger.debug(`Realtime server not attached; skipped emit for "${event}"`);
      return;
    }
    this.server.emit(event, payload);
  }
}
