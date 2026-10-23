import { Test, TestingModule } from '@nestjs/testing';
import { TournamentsService } from './tournaments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Prisma, RegistrationStatus, TournamentStatus, TrackSurface } from '@prisma/client';

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
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      tournamentResult: {
        upsert: jest.fn(),
        findMany: jest.fn(),
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
      workoutSession: {
        findMany: jest.fn().mockResolvedValue([]),
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

  describe('findAll', () => {
    it('should return paginated tournaments with filters', async () => {
      prisma.tournament.findMany.mockResolvedValue([
        {
          id: 't-1',
          name: 'Grand Cup',
          status: TournamentStatus.UPCOMING,
          prizePool: 50000000,
          _count: { registrations: 2 },
        },
      ]);
      prisma.tournament.count.mockResolvedValue(1);

      const res = await service.findAll({
        status: TournamentStatus.UPCOMING,
        trackType: TrackSurface.TURF,
        search: 'Grand',
        page: 1,
        limit: 10,
      });

      expect(res.items).toHaveLength(1);
      expect(res.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return a tournament if found', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't-1',
        name: 'Cup',
        prizePool: 10000000,
        registrations: [],
      });
      const res = await service.findOne('t-1');
      expect(res.id).toBe('t-1');
    });

    it('should throw NOT_FOUND if tournament does not exist', async () => {
      prisma.tournament.findUnique.mockResolvedValue(null);
      await expect(service.findOne('invalid')).rejects.toThrow();
    });
  });

  describe('create', () => {
    it('should reject when registration deadline is after race date', async () => {
      const dto = {
        name: 'Spring Cup',
        raceDate: '2026-11-10T08:00:00Z',
        location: 'Racecourse',
        distanceMeters: 1600,
        registrationDeadline: '2026-11-15T08:00:00Z',
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

  describe('update & changeStatus', () => {
    it('should update tournament details', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't-1',
        status: TournamentStatus.UPCOMING,
        raceDate: new Date('2026-11-20'),
        registrationDeadline: new Date('2026-11-10'),
      });
      prisma.tournament.update.mockResolvedValue({
        id: 't-1',
        name: 'Updated Cup',
        prizePool: 10000000,
      });

      const res = await service.update(
        't-1',
        { name: 'Updated Cup' },
        { id: 'u1', name: 'Mgr', role: 'CLUB_MANAGER' },
      );
      expect(res.name).toBe('Updated Cup');
    });

    it('should update tournament status via changeStatus', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't-1',
        name: 'Cup',
        status: TournamentStatus.UPCOMING,
      });
      prisma.tournament.update.mockResolvedValue({
        id: 't-1',
        name: 'Cup',
        status: TournamentStatus.OPEN_REGISTRATION,
        prizePool: 10000000,
      });

      const res = await service.changeStatus(
        't-1',
        { status: TournamentStatus.OPEN_REGISTRATION },
        { id: 'u1', name: 'Mgr', role: 'CLUB_MANAGER' },
      );
      expect(res.status).toBe(TournamentStatus.OPEN_REGISTRATION);
    });
  });

  describe('delete', () => {
    it('should delete upcoming tournament without registrations', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't-1',
        name: 'Cup',
        status: TournamentStatus.UPCOMING,
        _count: { registrations: 0 },
      });
      prisma.tournament.delete.mockResolvedValue({ id: 't-1' });

      await service.delete('t-1', { id: 'u1', name: 'Mgr', role: 'CLUB_MANAGER' });
      expect(audit.record).toHaveBeenCalled();
    });

    it('should prevent deleting tournament with existing registrations', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't-1',
        status: TournamentStatus.UPCOMING,
        _count: { registrations: 2 },
      });

      await expect(
        service.delete('t-1', { id: 'u1', name: 'Mgr', role: 'CLUB_MANAGER' }),
      ).rejects.toThrow();
    });
  });

  describe('registerHorse & cancelRegistration', () => {
    it('should block registration when horse is under Medical Lock', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't-1',
        name: 'Cup',
        status: TournamentStatus.OPEN_REGISTRATION,
        registrationDeadline: new Date(Date.now() + 86400000),
      });

      prisma.horse.findUnique.mockResolvedValue({
        id: 'h-locked',
        name: 'Thunderbolt',
        isMedicalLocked: true,
        deletedAt: null,
      });

      const actor = { id: 'u2', name: 'Trainer', role: 'HEAD_TRAINER' };

      await expect(service.registerHorse('t-1', { horseId: 'h-locked' }, actor)).rejects.toThrow(
        'Medical Lock is currently in force',
      );
    });

    it('should allow registering an eligible horse', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't-1',
        name: 'Cup',
        status: TournamentStatus.OPEN_REGISTRATION,
        registrationDeadline: new Date(Date.now() + 86400000),
        registrations: [],
      });

      prisma.horse.findUnique.mockResolvedValue({
        id: 'h-ok',
        name: 'Champion',
        isMedicalLocked: false,
        deletedAt: null,
      });

      prisma.tournamentRegistration.findUnique.mockResolvedValue(null);
      prisma.tournamentRegistration.create.mockResolvedValue({
        id: 'reg-1',
        tournamentId: 't-1',
        horseId: 'h-ok',
        status: RegistrationStatus.CONFIRMED,
      });

      const actor = { id: 'u2', name: 'Trainer', role: 'HEAD_TRAINER' };
      const res = await service.registerHorse('t-1', { horseId: 'h-ok' }, actor);
      expect(res.id).toBe('reg-1');
    });

    // RULE-CONC-01: hai lượt đăng ký cùng ngựa chạy đồng thời đều qua bước kiểm tra trùng.
    it('registers inside a transaction and answers a concurrent duplicate with 409 ALREADY_REGISTERED', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't-1',
        name: 'Cup',
        status: TournamentStatus.OPEN_REGISTRATION,
        registrationDeadline: new Date(Date.now() + 86400000),
      });
      prisma.horse.findUnique.mockResolvedValue({
        id: 'h-ok',
        name: 'Champion',
        isMedicalLocked: false,
        deletedAt: null,
      });
      prisma.tournamentRegistration.findUnique.mockResolvedValue(null);
      prisma.tournamentRegistration.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const actor = { id: 'u2', name: 'Trainer', role: 'HEAD_TRAINER' };
      await expect(service.registerHorse('t-1', { horseId: 'h-ok' }, actor)).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: 'ALREADY_REGISTERED' }),
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(notifications.notifyUsers).not.toHaveBeenCalled();
    });

    it('should cancel registration', async () => {
      prisma.tournamentRegistration.findUnique.mockResolvedValue({
        id: 'reg-1',
        tournamentId: 't-1',
        horse: { name: 'Champion' },
        tournament: { name: 'Cup', status: TournamentStatus.OPEN_REGISTRATION },
      });
      prisma.tournamentRegistration.update.mockResolvedValue({
        id: 'reg-1',
        status: RegistrationStatus.SCRATCHED_MEDICAL,
      });

      const res = await service.cancelRegistration('t-1', 'reg-1', 'Scratch', {
        id: 'u1',
        name: 'M',
        role: 'CLUB_MANAGER',
      });
      expect(res.status).toBe(RegistrationStatus.SCRATCHED_MEDICAL);
    });
  });

  describe('lockResults', () => {
    it('should forbid non-Club Manager from locking tournament results', async () => {
      const actor = { id: 'u2', name: 'Trainer', role: 'HEAD_TRAINER' };

      await expect(service.lockResults('t-1', actor)).rejects.toThrow(
        'Only the Club Manager has the authority to lock tournament results',
      );
    });

    it('should allow Club Manager to lock official tournament results and credit owners', async () => {
      const mockTourney: any = {
        id: 't-1',
        name: 'Cup 2026',
        status: TournamentStatus.OPEN_REGISTRATION,
        prizePool: 100000000,
        registrations: [
          {
            id: 'reg-1',
            horseId: 'h-1',
            horse: { id: 'h-1', ownerId: 'o-1' },
            status: RegistrationStatus.CONFIRMED,
            result: { id: 'res-1', rank: 1, finishTimeSeconds: 120 },
          },
        ],
      };

      prisma.tournament.findUnique.mockImplementation(() => Promise.resolve(mockTourney));
      prisma.tournament.update.mockImplementation(({ data }: any) => {
        Object.assign(mockTourney, data);
        return Promise.resolve(mockTourney);
      });

      prisma.tournamentRegistration.findMany.mockResolvedValue([
        {
          id: 'reg-1',
          horseId: 'h-1',
          horse: { id: 'h-1', ownerId: 'o-1' },
          result: { id: 'res-1', rank: 1, finishTimeSeconds: 120 },
        },
      ]);

      prisma.tournamentResult.upsert.mockResolvedValue({});
      prisma.horse.update.mockResolvedValue({});

      const actor = { id: 'u1', name: 'Manager', role: 'CLUB_MANAGER' };
      const res = await service.lockResults('t-1', actor);
      expect(res.status).toBe(TournamentStatus.COMPLETED);
    });
  });
});
