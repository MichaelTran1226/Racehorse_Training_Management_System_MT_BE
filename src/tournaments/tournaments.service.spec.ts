import { Test, TestingModule } from '@nestjs/testing';
import { TournamentsService } from './tournaments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TournamentStatus, TrackSurface } from '@prisma/client';

describe('TournamentsService', () => {
  let service: TournamentsService;
  let prisma: any;
  let audit: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      tournament: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      tournamentRegistration: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      tournamentResult: {
        upsert: jest.fn(),
      },
      horse: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      financialInvoice: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((callbackOrPromises) => {
        if (typeof callbackOrPromises === 'function') {
          return callbackOrPromises(prisma);
        }
        return Promise.all(callbackOrPromises);
      }),
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    notifications = {
      notifyUsers: jest.fn().mockResolvedValue(undefined),
      notifyRoles: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<TournamentsService>(TournamentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should reject when registration deadline is after race date', async () => {
      const dto = {
        name: 'Spring Cup',
        raceDate: '2026-11-10T08:00:00Z',
        location: 'Racecourse',
        distanceMeters: 1600,
        registrationDeadline: '2026-11-15T08:00:00Z', // In the future of raceDate
      };
      const actor = { id: 'u1', name: 'Manager', role: 'CLUB_MANAGER' };

      await expect(service.create(dto as any, actor)).rejects.toThrow();
    });

    it('should successfully create tournament when data is valid', async () => {
      const dto = {
        name: 'Spring Cup',
        raceDate: '2026-11-20T08:00:00Z',
        location: 'Racecourse',
        distanceMeters: 1600,
        trackType: TrackSurface.TURF,
        prizePool: 100000000,
        registrationDeadline: '2026-11-15T08:00:00Z',
      };
      const actor = { id: 'u1', name: 'Manager', role: 'CLUB_MANAGER' };

      prisma.tournament.create.mockResolvedValue({
        id: 'tourney-1',
        ...dto,
        raceDate: new Date(dto.raceDate),
        registrationDeadline: new Date(dto.registrationDeadline),
        status: TournamentStatus.UPCOMING,
      });

      const result = await service.create(dto as any, actor);
      expect(result.id).toBe('tourney-1');
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe('registerHorse', () => {
    it('should block registration when horse is under Medical Lock', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't-1',
        name: 'Cup',
        status: TournamentStatus.OPEN_REGISTRATION,
        registrationDeadline: new Date('2026-12-01'),
      });

      prisma.horse.findUnique.mockResolvedValue({
        id: 'h-locked',
        name: 'Thunderbolt',
        isMedicalLocked: true, // Medical lock active
        deletedAt: null,
      });

      const actor = { id: 'u2', name: 'Trainer', role: 'HEAD_TRAINER' };

      await expect(
        service.registerHorse('t-1', { horseId: 'h-locked' }, actor),
      ).rejects.toThrow('Medical Lock is currently in force');
    });
  });

  describe('lockResults', () => {
    it('should forbid non-Club Manager from locking tournament results', async () => {
      const actor = { id: 'u2', name: 'Trainer', role: 'HEAD_TRAINER' };

      await expect(service.lockResults('t-1', actor)).rejects.toThrow(
        'Only the Club Manager has the authority to lock tournament results',
      );
    });
  });
});
