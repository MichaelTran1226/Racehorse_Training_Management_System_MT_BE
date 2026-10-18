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

    it('throws NotFoundException if horse does not exist', async () => {
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

    it('rejects review by non-authorized roles like Groom', async () => {
      const groom = { userId: 'groom-1', role: Role.GROOM, fullName: 'Groom' } as any;
      await expect(
        service.review('inc-1', { status: IncidentStatus.RESOLVED }, groom),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
