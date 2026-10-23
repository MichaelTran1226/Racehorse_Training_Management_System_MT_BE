import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Role, SeverityLevel } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { IncidentsService } from '../incidents/incidents.service';
import { SimulatorGateway } from './simulator.gateway';
import { SimulatorService } from './simulator.service';
import { SimulatorRealtimeService } from './simulator-realtime.service';

describe('SimulatorGateway', () => {
  let gateway: SimulatorGateway;
  let authService: any;
  let jwtService: any;
  let simulatorService: any;
  let incidentsService: any;
  let realtimeService: any;
  let mockServer: any;

  beforeEach(async () => {
    authService = {
      getMe: jest.fn(),
    };
    jwtService = {
      verify: jest.fn(),
    };
    simulatorService = {
      recordTelemetry: jest.fn(),
      recordRaceProgress: jest.fn(),
      recordFinished: jest.fn(),
      recordExamFinished: jest.fn(),
    };
    incidentsService = {
      createFromSimulator: jest.fn(),
    };
    realtimeService = {
      setServer: jest.fn(),
      emit: jest.fn(),
    };
    mockServer = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulatorGateway,
        { provide: AuthService, useValue: authService },
        { provide: JwtService, useValue: jwtService },
        { provide: SimulatorService, useValue: simulatorService },
        { provide: IncidentsService, useValue: incidentsService },
        { provide: SimulatorRealtimeService, useValue: realtimeService },
      ],
    }).compile();

    gateway = module.get<SimulatorGateway>(SimulatorGateway);
    gateway.server = mockServer;
  });

  describe('handleConnection', () => {
    it('disconnects client when token is missing', async () => {
      const mockClient: any = {
        handshake: { auth: {} },
        disconnect: jest.fn(),
        data: {},
      };

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
      expect(mockClient.data.user).toBeUndefined();
    });

    it('disconnects client when JWT is invalid', async () => {
      const mockClient: any = {
        handshake: { auth: { token: 'invalid-token' } },
        disconnect: jest.fn(),
        data: {},
      };
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects client when user is inactive or blocked', async () => {
      const mockClient: any = {
        handshake: { auth: { token: 'valid-token' } },
        disconnect: jest.fn(),
        data: {},
      };
      jwtService.verify.mockReturnValue({ sub: 'user-1' });
      authService.getMe.mockResolvedValue({
        id: 'user-1',
        email: 'inactive@equiflow.com',
        role: Role.HEAD_TRAINER,
        status: 'INACTIVE',
      });

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
    });

    it('rejects Horse Owner and Groom from simulator namespace', async () => {
      const mockGroomClient: any = {
        handshake: { auth: { token: 'groom-token' } },
        disconnect: jest.fn(),
        data: {},
      };
      jwtService.verify.mockReturnValue({ sub: 'groom-1' });
      authService.getMe.mockResolvedValue({
        id: 'groom-1',
        email: 'groom@equiflow.com',
        role: Role.GROOM,
        status: 'ACTIVE',
      });

      await gateway.handleConnection(mockGroomClient);

      expect(mockGroomClient.disconnect).toHaveBeenCalledWith(true);
    });

    it('accepts Head Trainer, Club Manager, and Veterinarian', async () => {
      const mockTrainerClient: any = {
        handshake: { auth: { token: 'trainer-token' } },
        disconnect: jest.fn(),
        data: {},
      };
      jwtService.verify.mockReturnValue({ sub: 'trainer-1' });
      authService.getMe.mockResolvedValue({
        id: 'trainer-1',
        email: 'trainer@equiflow.com',
        role: Role.HEAD_TRAINER,
        status: 'ACTIVE',
        fullName: 'Trainer Minh',
      });

      await gateway.handleConnection(mockTrainerClient);

      expect(mockTrainerClient.disconnect).not.toHaveBeenCalled();
      expect(mockTrainerClient.data.user).toBeDefined();
      expect(mockTrainerClient.data.user.role).toBe(Role.HEAD_TRAINER);
    });

    it('waits for asynchronous authentication before handling the first packet', async () => {
      let resolveProfile!: (profile: any) => void;
      const mockClient: any = {
        handshake: { auth: { token: 'trainer-token' } },
        disconnect: jest.fn(),
        data: {},
      };
      jwtService.verify.mockReturnValue({ sub: 'trainer-1' });
      authService.getMe.mockReturnValue(new Promise((resolve) => (resolveProfile = resolve)));
      simulatorService.recordFinished.mockResolvedValue({ id: 'session-1', status: 'COMPLETED' });

      const connection = gateway.handleConnection(mockClient);
      const firstPacket = gateway.handleSessionFinished(mockClient, {
        event: 'sim:session_finished',
        session_id: 'session-1',
        type: 'WORKOUT',
        status: 'COMPLETED',
        horse: { horse_id: 'horse-1' },
        result: {},
      });
      resolveProfile({
        id: 'trainer-1',
        email: 'trainer@equiflow.com',
        role: Role.HEAD_TRAINER,
        status: 'ACTIVE',
        fullName: 'Trainer Minh',
      });

      await connection;
      await expect(firstPacket).resolves.toEqual({ accepted: true, id: 'session-1' });
    });
  });

  describe('telemetry and incident relay', () => {
    it('lets a veterinarian publish only a valid examination result', async () => {
      const client: any = {
        data: { user: { userId: 'vet-1', role: Role.VETERINARIAN, email: 'vet@equiflow.com' } },
      };
      const packet = {
        event: 'sim:exam_finished' as const,
        session_id: 'exam-1',
        horse_id: '68eecf5d-1bc8-4a98-8d74-0b2399d04fe1',
        captured_at: '2026-10-23T01:00:00.000Z',
        model_version: 'equiflow-sim-v3',
        source: 'EQUIFLOW_SIMULATOR' as const,
        metrics: {
          temperature: { value: 38.2, unit: 'CELSIUS' as const },
          resting_heart_rate: { value: 38, unit: 'BPM' as const },
          respiratory_rate: { value: 13, unit: 'BREATHS_PER_MINUTE' as const },
          weight: { value: 480, unit: 'KG' as const },
        },
      };
      simulatorService.recordExamFinished.mockResolvedValue({ id: 'exam-1' });

      await expect(gateway.handleExamFinished(client, packet)).resolves.toEqual({
        accepted: true,
        id: 'exam-1',
      });
      expect(simulatorService.recordExamFinished).toHaveBeenCalledWith(packet, client.data.user);

      await expect(
        gateway.handleExamFinished(client, {
          ...packet,
          metrics: { ...packet.metrics, temperature: { value: 99, unit: 'FAHRENHEIT' as any } },
        }),
      ).resolves.toEqual({ accepted: false, code: 'INVALID_SIMULATOR_PACKET' });

      await expect(
        gateway.handleExamFinished(
          { data: { user: { ...client.data.user, role: Role.HEAD_TRAINER } } } as any,
          packet,
        ),
      ).resolves.toEqual({ accepted: false, code: 'FORBIDDEN' });
    });

    it('relays accepted telemetry packet to subscribers', async () => {
      const mockTrainerClient: any = {
        data: {
          user: {
            userId: 'trainer-1',
            role: Role.HEAD_TRAINER,
            email: 'trainer@equiflow.com',
            fullName: 'Trainer Minh',
          },
        },
      };

      const packet: any = {
        event: 'sim:telemetry_tick',
        session_id: 'WRK-20261021-001',
        timestamp_ms: 1729520000000,
        sim_time_s: 1.0,
        sim_speed_multiplier: 1.0,
        horse: {
          horse_id: 'horse-1',
          microchip_id: '985141000000001',
          lifecycle_status: 'IN_TRAINING',
          medical_lock: false,
        },
        track: {
          surface: 'TURF',
          target_distance_m: 1200,
          covered_distance_m: 10,
          track_condition: 'FAST',
          obstacles_cleared: 0,
          obstacles_total: 0,
        },
        metrics: {
          velocity_mps: 15.0,
          heart_rate_bpm: 120,
          stamina_pct: 99.0,
          body_temp_c: 38.0,
          stride_length_m: 6.0,
          stride_freq_spm: 130,
          calories_kcal: 20,
        },
        alerts: {
          overload_warning: false,
          limp_detected: false,
          heat_stress: false,
        },
      };

      const result = await gateway.handleTelemetryTick(mockTrainerClient, packet);

      expect(simulatorService.recordTelemetry).toHaveBeenCalledWith(
        packet,
        mockTrainerClient.data.user,
      );
      expect(mockServer.emit).toHaveBeenCalledWith('sim:telemetry_tick', packet);
      expect(result).toEqual({ accepted: true });
    });

    it.each([
      ['out-of-range metric', { metrics: { velocity_mps: 51 } }],
      ['unknown field', { unexpected: true }],
      ['non-object payload', { payload: null }],
    ] as [string, { metrics?: { velocity_mps: number }; unexpected?: boolean; payload?: null }][])(
      'returns a stable ack for %s without recording telemetry',
      async (_name, invalid) => {
        const mockTrainerClient: any = {
          data: {
            user: {
              userId: 'trainer-1',
              role: Role.HEAD_TRAINER,
              email: 'trainer@equiflow.com',
              fullName: 'Trainer Minh',
            },
          },
        };
        const validPacket: any = {
          event: 'sim:telemetry_tick',
          session_id: 'session-1',
          timestamp_ms: 1,
          sim_time_s: 1,
          sim_speed_multiplier: 1,
          horse: { horse_id: 'horse-1' },
          track: {
            surface: 'GRASS',
            target_distance_m: 1200,
            covered_distance_m: 10,
            track_condition: 'GOOD',
            obstacles_cleared: 0,
            obstacles_total: 0,
          },
          metrics: {
            velocity_mps: 15,
            heart_rate_bpm: 120,
            stamina_pct: 99,
            body_temp_c: 38,
            stride_length_m: 6,
            stride_freq_spm: 130,
            calories_kcal: 20,
            ...invalid.metrics,
          },
          alerts: { overload_warning: false, limp_detected: false, heat_stress: false },
          ...(invalid.unexpected ? { unexpected: true } : {}),
        };
        const packet = invalid.payload === null ? null : validPacket;

        await expect(gateway.handleTelemetryTick(mockTrainerClient, packet)).resolves.toEqual({
          accepted: false,
          code: 'INVALID_SIMULATOR_PACKET',
        });
        expect(simulatorService.recordTelemetry).not.toHaveBeenCalled();
      },
    );

    it('rejects an invalid incident before persistence', async () => {
      const mockTrainerClient: any = {
        data: {
          user: {
            userId: 'trainer-1',
            role: Role.HEAD_TRAINER,
            email: 'trainer@equiflow.com',
            fullName: 'Trainer Minh',
          },
        },
      };
      const packet: any = {
        event: 'sim:incident_report',
        session_id: null,
        timestamp_ms: 1,
        horse: { horse_id: 'horse-1' },
        incident: {
          kind: 'COLIC',
          label: 'Colic',
          location: 'STALL',
          stall: { col: 2, row: 3, unexpected: true },
        },
      };

      await expect(gateway.handleIncidentReport(mockTrainerClient, packet)).resolves.toEqual({
        accepted: false,
        code: 'INVALID_SIMULATOR_PACKET',
      });
      expect(incidentsService.createFromSimulator).not.toHaveBeenCalled();
    });

    it('ingests incident packet, sets CRITICAL for FRACTURE, and relays to monitors without medical lock', async () => {
      const mockTrainerClient: any = {
        data: {
          user: {
            userId: 'trainer-1',
            role: Role.HEAD_TRAINER,
            email: 'trainer@equiflow.com',
            fullName: 'Trainer Minh',
          },
        },
      };

      const incidentPacket: any = {
        event: 'sim:incident_report',
        packet_id: 'pkt-inc-001',
        session_id: 'WRK-20261021-001',
        timestamp_ms: 1729520000000,
        horse: {
          horse_id: 'horse-1',
          microchip_id: '985141000000001',
          lifecycle_status: 'IN_TRAINING',
          medical_lock: false,
        },
        incident: {
          kind: 'FRACTURE',
          label: 'Gãy xương chân cấp tính',
          location: 'STALL',
          stall: { col: 2, row: 3 },
        },
        snapshot: {
          covered_distance_m: 600,
          velocity_mps: 16.5,
          heart_rate_bpm: 190,
          body_temp_c: 39.0,
        },
        notify: {
          managing_actors: ['HEAD_TRAINER', 'HORSE_OWNER', 'GROOM', 'CLUB_MANAGER'],
          veterinarian_scope: 'ALL_HORSES_ON_TRACK',
        },
      };

      const mockSavedIncident = {
        id: 'inc-row-1',
        incidentNumber: 'INC-20261021-0001',
        horseId: 'horse-1',
        severity: SeverityLevel.CRITICAL,
      };

      incidentsService.createFromSimulator.mockResolvedValue(mockSavedIncident);

      const ack = await gateway.handleIncidentReport(mockTrainerClient, incidentPacket);

      expect(incidentsService.createFromSimulator).toHaveBeenCalledWith(
        'pkt-inc-001',
        incidentPacket,
        mockTrainerClient.data.user,
      );
      expect(mockServer.emit).toHaveBeenCalledWith(
        'sim:incident_report',
        expect.objectContaining({
          event: 'sim:incident_report',
          packet_id: 'pkt-inc-001',
          incident_id: 'inc-row-1',
        }),
      );
      expect(ack).toEqual({ accepted: true, id: 'inc-row-1' });
    });
  });
});
