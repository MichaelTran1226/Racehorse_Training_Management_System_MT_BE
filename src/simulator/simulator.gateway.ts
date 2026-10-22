import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { IncidentsService } from '../incidents/incidents.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { SimulatorService } from './simulator.service';
import { SimulatorRealtimeService } from './simulator-realtime.service';
import {
  IncidentReportPacketDto,
  RaceProgressPacketDto,
  SessionFinishedPacketDto,
  TelemetryTickPacketDto,
} from './dto/simulator-packet.dto';
import { SimulatorAck } from './simulator.types';

const ALLOWED_SUBSCRIBERS: Role[] = [Role.CLUB_MANAGER, Role.HEAD_TRAINER, Role.VETERINARIAN];

const ALLOWED_PUBLISHERS: Role[] = [Role.CLUB_MANAGER, Role.HEAD_TRAINER];

async function validatePacket<T extends object>(
  type: ClassConstructor<T>,
  packet: unknown,
): Promise<T> {
  try {
    const value = plainToInstance(type, packet);
    const errors = await validate(value, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) throw new Error();
    return value;
  } catch {
    throw new Error('INVALID_SIMULATOR_PACKET');
  }
}

@WebSocketGateway({
  namespace: '/simulator',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class SimulatorGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SimulatorGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly simulatorService: SimulatorService,
    private readonly incidentsService: IncidentsService,
    private readonly realtimeService: SimulatorRealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtimeService.setServer(server);
    this.logger.log('Simulator WebSocket gateway initialized at namespace /simulator');
  }

  async handleConnection(client: Socket) {
    try {
      // Token must come from handshake auth or Authorization header, NEVER query strings
      const rawToken =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (!rawToken || typeof rawToken !== 'string') {
        this.logger.warn(`Rejected connection [${client.id}]: missing auth token`);
        client.disconnect(true);
        return;
      }

      let payload: any;
      try {
        payload = this.jwtService.verify(rawToken);
      } catch (err: any) {
        this.logger.warn(`Rejected connection [${client.id}]: invalid JWT (${err.message})`);
        client.disconnect(true);
        return;
      }

      const profile = await this.authService.getMe(payload.sub);
      if (!profile || profile.status !== 'ACTIVE') {
        this.logger.warn(`Rejected connection [${client.id}]: user ${payload.sub} not active`);
        client.disconnect(true);
        return;
      }

      if (!ALLOWED_SUBSCRIBERS.includes(profile.role as Role)) {
        this.logger.warn(
          `Rejected connection [${client.id}]: role ${profile.role} is not permitted in /simulator`,
        );
        client.disconnect(true);
        return;
      }

      const user: CurrentUserPayload = {
        userId: profile.id,
        email: profile.email,
        role: profile.role,
        fullName: profile.fullName,
      };

      client.data.user = user;
      this.logger.log(`Client connected [${client.id}] user=${user.email} role=${user.role}`);
    } catch (err: any) {
      this.logger.error(`Error in handleConnection [${client.id}]: ${err.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected [${client.id}]`);
  }

  private requirePublisher(client: Socket): CurrentUserPayload {
    const user: CurrentUserPayload | undefined = client.data?.user;
    if (!user) {
      throw new Error('UNAUTHENTICATED');
    }
    if (!ALLOWED_PUBLISHERS.includes(user.role as Role)) {
      throw new Error('FORBIDDEN');
    }
    return user;
  }

  @SubscribeMessage('sim:telemetry_tick')
  async handleTelemetryTick(
    @ConnectedSocket() client: Socket,
    @MessageBody() packet: TelemetryTickPacketDto,
  ): Promise<SimulatorAck> {
    try {
      const user = this.requirePublisher(client);
      const validPacket = await validatePacket(TelemetryTickPacketDto, packet);
      await this.simulatorService.recordTelemetry(validPacket, user);
      this.server.emit('sim:telemetry_tick', validPacket);
      return { accepted: true };
    } catch (err: any) {
      return { accepted: false, code: err.message };
    }
  }

  @SubscribeMessage('sim:race_progress')
  async handleRaceProgress(
    @ConnectedSocket() client: Socket,
    @MessageBody() packet: RaceProgressPacketDto,
  ): Promise<SimulatorAck> {
    try {
      const user = this.requirePublisher(client);
      const validPacket = await validatePacket(RaceProgressPacketDto, packet);
      await this.simulatorService.recordRaceProgress(validPacket, user);
      this.server.emit('sim:race_progress', validPacket);
      return { accepted: true };
    } catch (err: any) {
      return { accepted: false, code: err.message };
    }
  }

  @SubscribeMessage('sim:incident_report')
  async handleIncidentReport(
    @ConnectedSocket() client: Socket,
    @MessageBody() packet: IncidentReportPacketDto,
  ): Promise<SimulatorAck> {
    try {
      const user = this.requirePublisher(client);
      const validPacket = await validatePacket(IncidentReportPacketDto, packet);
      const incident = await this.incidentsService.createFromSimulator(
        validPacket.packet_id,
        validPacket,
        user,
      );

      // Fan out persisted incident to all connected monitors
      this.server.emit('sim:incident_report', {
        ...validPacket,
        incident_id: incident.id,
        incident_number: incident.incidentNumber,
      });

      return { accepted: true, id: incident.id };
    } catch (err: any) {
      return { accepted: false, code: err.message };
    }
  }

  @SubscribeMessage('sim:session_finished')
  async handleSessionFinished(
    @ConnectedSocket() client: Socket,
    @MessageBody() packet: SessionFinishedPacketDto,
  ): Promise<SimulatorAck> {
    try {
      const user = this.requirePublisher(client);
      const validPacket = await validatePacket(SessionFinishedPacketDto, packet);
      const session = await this.simulatorService.recordFinished(validPacket, user);

      this.server.emit('sim:session_finished', {
        ...validPacket,
        session_id: session.id,
        status: session.status,
      });

      return { accepted: true, id: session.id };
    } catch (err: any) {
      return { accepted: false, code: err.message };
    }
  }
}
