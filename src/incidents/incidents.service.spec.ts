import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IncidentStatus, Role, SeverityLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IncidentsService } from './incidents.service';

describe('IncidentsService', () => {
  let service: IncidentsService;
  let prisma: any;
  let auditService: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      horse: { findUnique: jest.fn() },
      incidentReport: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };

    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    notifications = {
      notifyRoles: jest.fn().mockResolvedValue(undefined),
      notifyUsers: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<IncidentsService>(IncidentsService);
  });

  describe('create', () => {
    it('creates an incident report and dispatches urgent notification to VET and HT', async () => {
      const mockHorse = {
        id: 'horse-1',
        name: 'Flash',
        horseCode: 'H-001',
        deletedAt: null,
        stallAllocations: [{ isActive: true, stall: { zoneId: 'zone-1' } }],
      };

      prisma.horse.findUnique.mockResolvedValue(mockHorse);
      prisma.incidentReport.count.mockResolvedValue(5);
      prisma.incidentReport.create.mockResolvedValue({
        id: 'inc-1',
        incidentNumber: 'INC-20261018-0006',
        horseId: 'horse-1',
        severity: SeverityLevel.CRITICAL,
      });

      const reporter = {
        userId: 'groom-1',
        fullName: 'Groom Nam',
        role: Role.GROOM,
      } as any;

      const res = await service.create(
        {
          horseId: 'horse-1',
          severity: SeverityLevel.CRITICAL,
          symptoms: ['COLIC', 'FEVER'],
          description: 'Ngựa quằn quại đau bụng, lăn nhiều lần trên rơm.',
        },
        reporter,
      );

      expect(res.id).toBe('inc-1');
      expect(notifications.notifyRoles).toHaveBeenCalledWith(
        [Role.VETERINARIAN, Role.HEAD_TRAINER, Role.CLUB_MANAGER],
        expect.objectContaining({
          type: 'CRITICAL_INCIDENT_REPORTED',
          category: 'MEDICAL',
        }),
      );
    });

    it('creates a moderate incident with symptomsJson fallback when symptoms is empty', async () => {
      const mockHorse = {
        id: 'horse-2',
        name: 'Thunder',
        horseCode: 'H-002',
        deletedAt: null,
        stallAllocations: [],
      };

      prisma.horse.findUnique.mockResolvedValue(mockHorse);
      prisma.incidentReport.count.mockResolvedValue(0);
      prisma.incidentReport.create.mockResolvedValue({
        id: 'inc-2',
        incidentNumber: 'INC-20261018-0001',
        horseId: 'horse-2',
        severity: SeverityLevel.MODERATE,
      });

      const reporter = {
        userId: 'groom-2',
        fullName: 'Groom Hoa',
        role: Role.GROOM,
      } as any;

      const res = await service.create(
        {
          horseId: 'horse-2',
          severity: SeverityLevel.MODERATE,
          stallZoneId: 'zone-9',
          symptomsJson: ['LOSS_OF_APPETITE'],
          description: 'Ngựa ăn ít hơn bình thường.',
        },
        reporter,
      );

      expect(res.id).toBe('inc-2');
      expect(notifications.notifyRoles).toHaveBeenCalledWith(
        [Role.VETERINARIAN, Role.HEAD_TRAINER, Role.CLUB_MANAGER],
        expect.objectContaining({
          type: 'HEALTH_ANOMALY_LOGGED',
          category: 'MEDICAL',
        }),
      );
    });

    it('creates a low severity incident with empty symptoms defaulting to OTHER', async () => {
      const mockHorse = {
        id: 'horse-3',
        name: 'Storm',
        horseCode: 'H-003',
        deletedAt: null,
        stallAllocations: [],
      };

      prisma.horse.findUnique.mockResolvedValue(mockHorse);
      prisma.incidentReport.count.mockResolvedValue(1);
      prisma.incidentReport.create.mockResolvedValue({
        id: 'inc-3',
        incidentNumber: 'INC-20261018-0002',
        horseId: 'horse-3',
        severity: SeverityLevel.MILD,
      });

      const reporter = {
        userId: 'groom-3',
        fullName: 'Groom Linh',
        role: Role.GROOM,
      } as any;

      const res = await service.create(
        {
          horseId: 'horse-3',
          severity: SeverityLevel.MILD,
          description: 'Quan sát nhẹ.',
        },
        reporter,
      );

      expect(res.id).toBe('inc-3');
    });

    it('throws NotFoundException if horse does not exist or is deleted', async () => {
      prisma.horse.findUnique.mockResolvedValue(null);
      await expect(
        service.create(
          {
            horseId: 'non-existing',
            severity: SeverityLevel.MODERATE,
            symptoms: ['FEVER'],
            description: 'Sốt nhẹ',
          },
          { userId: 'groom-1', fullName: 'Groom' } as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('returns paginated incidents with filters applied', async () => {
      const mockItems = [{ id: 'inc-1', incidentNumber: 'INC-001' }];
      prisma.incidentReport.findMany.mockResolvedValue(mockItems);
      prisma.incidentReport.count.mockResolvedValue(1);

      const res = await service.findAll({
        page: 1,
        limit: 10,
        horseId: 'horse-1',
        zoneId: 'zone-1',
        severity: SeverityLevel.CRITICAL,
        status: IncidentStatus.REPORTED,
        startDate: '2026-10-01',
        endDate: '2026-10-18',
      });

      expect(res.items).toEqual(mockItems);
      expect(res.total).toBe(1);
      expect(res.totalPages).toBe(1);
    });

    it('uses default pagination if not specified', async () => {
      prisma.incidentReport.findMany.mockResolvedValue([]);
      prisma.incidentReport.count.mockResolvedValue(0);

      const res = await service.findAll({});
      expect(res.page).toBe(1);
      expect(res.limit).toBe(20);
      expect(res.items).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns an incident by ID', async () => {
      const mockIncident = { id: 'inc-1', incidentNumber: 'INC-001' };
      prisma.incidentReport.findUnique.mockResolvedValue(mockIncident);

      const res = await service.findOne('inc-1');
      expect(res).toEqual(mockIncident);
    });

    it('throws NotFoundException if incident not found', async () => {
      prisma.incidentReport.findUnique.mockResolvedValue(null);
      await expect(service.findOne('inc-999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('review', () => {
    it('allows Veterinarian to review and resolve incident with notes', async () => {
      const mockIncident = {
        id: 'inc-1',
        incidentNumber: 'INC-001',
        status: IncidentStatus.REPORTED,
        reportedById: 'groom-1',
        horse: { name: 'Flash' },
      };

      prisma.incidentReport.findUnique.mockResolvedValue(mockIncident);
      prisma.incidentReport.update.mockResolvedValue({
        ...mockIncident,
        status: IncidentStatus.RESOLVED,
        vetNotes: 'Đã tiêm thuốc giảm đau chống co thắt.',
      });

      const vet = {
        userId: 'vet-1',
        fullName: 'BS. Dũng',
        role: Role.VETERINARIAN,
      } as any;

      const res = await service.review(
        'inc-1',
        {
          status: IncidentStatus.RESOLVED,
          vetNotes: 'Đã tiêm thuốc giảm đau chống co thắt.',
        },
        vet,
      );

      expect(res.status).toBe(IncidentStatus.RESOLVED);
      expect(notifications.notifyUsers).toHaveBeenCalledWith(
        ['groom-1'],
        expect.objectContaining({
          type: 'INCIDENT_REVIEWED',
        }),
      );
    });

    it('allows Club Manager to review incident without vetNotes', async () => {
      const mockIncident = {
        id: 'inc-2',
        incidentNumber: 'INC-002',
        status: IncidentStatus.REPORTED,
        vetNotes: 'Ghi chú cũ',
        horse: { name: 'Thunder' },
      };

      prisma.incidentReport.findUnique.mockResolvedValue(mockIncident);
      prisma.incidentReport.update.mockResolvedValue({
        ...mockIncident,
        status: IncidentStatus.UNDER_REVIEW,
      });

      const manager = {
        userId: 'mgr-1',
        fullName: 'Manager Huy',
        role: Role.CLUB_MANAGER,
      } as any;

      const res = await service.review('inc-2', { status: IncidentStatus.UNDER_REVIEW }, manager);

      expect(res.status).toBe(IncidentStatus.UNDER_REVIEW);
    });

    it('throws NotFoundException if incident does not exist', async () => {
      prisma.incidentReport.findUnique.mockResolvedValue(null);
      const vet = { userId: 'vet-1', role: Role.VETERINARIAN, fullName: 'Vet' } as any;
      await expect(
        service.review('inc-999', { status: IncidentStatus.RESOLVED }, vet),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects review by non-authorized roles like Groom', async () => {
      const groom = { userId: 'groom-1', role: Role.GROOM, fullName: 'Groom' } as any;
      await expect(
        service.review('inc-1', { status: IncidentStatus.RESOLVED }, groom),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createFromSimulator', () => {
    it('returns existing incident on retried sourceEventId without duplicate notifications', async () => {
      const existingIncident = {
        id: 'inc-existing-1',
        incidentNumber: 'INC-20261021-0001',
        sourceEventId: 'pkt-retry-123',
        horseId: 'horse-1',
        severity: SeverityLevel.CRITICAL,
      };

      prisma.incidentReport.findUnique.mockResolvedValue(existingIncident);

      const reporter = {
        userId: 'trainer-1',
        email: 'trainer@equiflow.com',
        role: Role.HEAD_TRAINER,
        fullName: 'Trainer Minh',
      };

      const result = await service.createFromSimulator('pkt-retry-123', {} as any, reporter as any);

      expect(result).toBe(existingIncident);
      expect(prisma.incidentReport.create).not.toHaveBeenCalled();
      expect(notifications.notifyRoles).not.toHaveBeenCalled();
    });

    it('maps FRACTURE to CRITICAL severity and creates IncidentReport without activating MedicalLock', async () => {
      prisma.incidentReport.findUnique.mockResolvedValue(null);
      prisma.horse.findUnique.mockResolvedValue({
        id: 'horse-1',
        name: 'Thunderbolt',
        horseCode: 'H-002',
        deletedAt: null,
        ownerId: 'owner-uuid-1',
        stallAllocations: [],
      });
      prisma.incidentReport.count.mockResolvedValue(0);

      const createdIncident = {
        id: 'inc-new-1',
        incidentNumber: 'INC-20261021-0001',
        sourceEventId: 'pkt-fracture-1',
        horseId: 'horse-1',
        severity: SeverityLevel.CRITICAL,
      };
      prisma.incidentReport.create.mockResolvedValue(createdIncident);

      const reporter = {
        userId: 'trainer-1',
        email: 'trainer@equiflow.com',
        role: Role.HEAD_TRAINER,
        fullName: 'Trainer Minh',
      };

      const packet: any = {
        horse: { horse_id: 'horse-1' },
        incident: {
          kind: 'FRACTURE',
          label: 'Gãy xương chân cấp tính',
          location: 'TRACK',
        },
        snapshot: {
          velocity_mps: 16.0,
          heart_rate_bpm: 185,
          body_temp_c: 38.5,
        },
      };

      const result = await service.createFromSimulator('pkt-fracture-1', packet, reporter as any);

      expect(result).toBe(createdIncident);
      expect(prisma.incidentReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            severity: SeverityLevel.CRITICAL,
            sourceEventId: 'pkt-fracture-1',
          }),
        }),
      );
      // Notifications sent to management roles
      expect(notifications.notifyRoles).toHaveBeenCalledWith(
        [Role.VETERINARIAN, Role.HEAD_TRAINER, Role.CLUB_MANAGER],
        expect.objectContaining({
          type: 'CRITICAL_INCIDENT_REPORTED',
          category: 'MEDICAL',
        }),
      );
    });
  });
});
