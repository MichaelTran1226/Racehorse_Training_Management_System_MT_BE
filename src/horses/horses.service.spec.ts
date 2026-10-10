import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { HorseStatus, Role, UserStatus } from '@prisma/client';
import { HorsesService } from './horses.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('HorsesService', () => {
  let service: HorsesService;
  let prisma: any;
  let audit: any;

  const mockManager: CurrentUserPayload = {
    userId: 'manager-1',
    email: 'manager@gmail.com',
    fullName: 'Manager User',
    role: UserRole.CLUB_MANAGER,
  };

  const mockOwner: CurrentUserPayload = {
    userId: 'owner-1',
    email: 'owner@gmail.com',
    fullName: 'Owner User',
    role: UserRole.HORSE_OWNER,
  };

  const mockGroom: CurrentUserPayload = {
    userId: 'groom-1',
    email: 'groom@gmail.com',
    fullName: 'Groom User',
    role: UserRole.GROOM,
  };

  beforeEach(async () => {
    prisma = {
      horse: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      stallAllocation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HorsesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<HorsesService>(HorsesService);
  });

  describe('generateHorseCode', () => {
    it('should generate HR-000001 when count is 0', async () => {
      prisma.horse.count.mockResolvedValue(0);
      prisma.horse.findUnique.mockResolvedValue(null);

      const code = await service.generateHorseCode();
      expect(code).toBe('HR-000001');
    });

    it('should increment when collision occurs', async () => {
      prisma.horse.count.mockResolvedValue(0);
      prisma.horse.findUnique.mockResolvedValueOnce({ id: 'exists' }).mockResolvedValueOnce(null);

      const code = await service.generateHorseCode();
      expect(code).toBe('HR-000002');
    });
  });

  describe('create', () => {
    it('should create horse with default status RESTING and auto code', async () => {
      prisma.horse.findFirst.mockResolvedValue(null);
      prisma.horse.findUnique.mockResolvedValue(null);
      prisma.horse.count.mockResolvedValue(0);

      const createdMock = {
        id: 'h-1',
        horseCode: 'HR-000001',
        name: 'Thunderbolt',
        breed: 'Thoroughbred',
        dob: new Date('2021-01-01'),
        gender: 'Colt',
        color: 'Bay',
        microchip: '123456789012345',
        rfid: 'RFID-12345',
        microchipRfid: '123456789012345',
        status: HorseStatus.RESTING,
        isMedicalLocked: false,
        stallAllocations: [],
      };
      prisma.horse.create.mockResolvedValue(createdMock);

      const res = await service.create(
        {
          name: 'Thunderbolt',
          breed: 'Thoroughbred',
          dob: '2021-01-01',
          gender: 'Colt',
          color: 'Bay',
          microchip: '123456789012345',
          rfid: 'RFID-12345',
        },
        mockManager,
      );

      expect(res.horseCode).toBe('HR-000001');
      expect(res.status).toBe(HorseStatus.RESTING);
      expect(audit.record).toHaveBeenCalled();
    });

    it('should throw 409 DUPLICATE_NAME if horse name exists', async () => {
      prisma.horse.findFirst.mockResolvedValueOnce({ id: 'h-existing', name: 'Thunderbolt' });

      await expect(
        service.create(
          {
            name: 'Thunderbolt',
            breed: 'Thoroughbred',
            dob: '2021-01-01',
            gender: 'Colt',
            color: 'Bay',
            microchip: '123456789012345',
          },
          mockManager,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: expect.objectContaining({ code: 'DUPLICATE_NAME' }),
      });
    });

    it('should throw 409 DUPLICATE_MICROCHIP if microchip exists', async () => {
      prisma.horse.findFirst
        .mockResolvedValueOnce(null) // name check ok
        .mockResolvedValueOnce({ id: 'h-existing', microchip: '123456789012345' }); // microchip exists

      await expect(
        service.create(
          {
            name: 'New Horse',
            breed: 'Thoroughbred',
            dob: '2021-01-01',
            gender: 'Colt',
            color: 'Bay',
            microchip: '123456789012345',
          },
          mockManager,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: expect.objectContaining({ code: 'DUPLICATE_MICROCHIP' }),
      });
    });
  });

  describe('findOne and Role Policy', () => {
    it('should mask microchip with last 4 digits for GROOM', async () => {
      const horse = {
        id: 'h-1',
        name: 'Thunderbolt',
        microchip: '123456789012345',
        microchipRfid: '123456789012345',
        stallAllocations: [{ assignedGroomUserId: 'groom-1', isActive: true }],
      };
      prisma.horse.findUnique.mockResolvedValue(horse);

      const res = await service.findOne('h-1', mockGroom);
      expect(res.microchip).toBe('***********2345');
      expect(res.microchipRfid).toBe('***********2345');
    });

    it('should hide stall information for HORSE_OWNER', async () => {
      const horse = {
        id: 'h-1',
        name: 'Thunderbolt',
        ownerId: 'owner-1',
        microchip: '123456789012345',
        stallAllocations: [{ stall: { code: 'A-01', zone: 'Zone 1' }, isActive: true }],
      };
      prisma.horse.findUnique.mockResolvedValue(horse);

      const res = await service.findOne('h-1', mockOwner);
      expect(res.stallCode).toBeNull();
      expect(res.stallAllocations).toBeUndefined();
    });

    it('should throw 404 if Owner accesses horse they do not own', async () => {
      const horse = {
        id: 'h-2',
        name: 'Other Horse',
        ownerId: 'owner-999',
        stallAllocations: [],
      };
      prisma.horse.findUnique.mockResolvedValue(horse);

      await expect(service.findOne('h-2', mockOwner)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: expect.objectContaining({ code: 'HORSE_NOT_FOUND' }),
      });
    });
  });

  describe('transferOwner', () => {
    it('should transfer ownership to a valid new owner and record audit log', async () => {
      const existingHorse = {
        id: 'h-1',
        name: 'Thunderbolt',
        status: HorseStatus.ACTIVE,
        ownerId: 'owner-old',
        owner: { id: 'owner-old', fullName: 'Old Owner', email: 'old@gmail.com' },
      };
      const newOwner = {
        id: 'owner-new',
        fullName: 'New Owner',
        email: 'new@gmail.com',
        role: Role.HORSE_OWNER,
        status: UserStatus.ACTIVE,
      };
      const updatedHorse = {
        ...existingHorse,
        ownerId: 'owner-new',
        owner: newOwner,
        stallAllocations: [],
      };

      prisma.horse.findUnique.mockResolvedValue(existingHorse);
      prisma.user.findUnique.mockResolvedValue(newOwner);
      prisma.horse.update.mockResolvedValue(updatedHorse);

      const res = await service.transferOwner(
        'h-1',
        { newOwnerId: 'owner-new', reason: 'Syndicate sale agreement' },
        mockManager,
      );

      expect(res.ownerId).toBe('owner-new');
      expect(prisma.horse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'h-1' },
          data: { ownerId: 'owner-new' },
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        'HORSE_OWNERSHIP_TRANSFERRED',
        expect.stringContaining('Transferred ownership of horse'),
        'h-1',
        expect.anything(),
      );
    });

    it('should throw 400 ALREADY_OWNED if horse already belongs to newOwnerId', async () => {
      const existingHorse = {
        id: 'h-1',
        name: 'Thunderbolt',
        status: HorseStatus.ACTIVE,
        ownerId: 'owner-same',
        owner: { id: 'owner-same', fullName: 'Same Owner' },
      };

      prisma.horse.findUnique.mockResolvedValue(existingHorse);

      await expect(
        service.transferOwner('h-1', { newOwnerId: 'owner-same' }, mockManager),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: expect.objectContaining({ code: 'ALREADY_OWNED' }),
      });
    });

    it('should throw 400 HORSE_RETIRED if horse status is RETIRED', async () => {
      const retiredHorse = {
        id: 'h-1',
        name: 'Thunderbolt',
        status: HorseStatus.RETIRED,
        ownerId: 'owner-1',
      };

      prisma.horse.findUnique.mockResolvedValue(retiredHorse);

      await expect(
        service.transferOwner('h-1', { newOwnerId: 'owner-new' }, mockManager),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: expect.objectContaining({ code: 'HORSE_RETIRED' }),
      });
    });

    it('should throw 400 INVALID_NEW_OWNER if new owner does not have HORSE_OWNER role', async () => {
      const existingHorse = {
        id: 'h-1',
        name: 'Thunderbolt',
        status: HorseStatus.ACTIVE,
        ownerId: 'owner-1',
      };
      const invalidRoleUser = {
        id: 'user-trainer',
        role: Role.HEAD_TRAINER,
        status: UserStatus.ACTIVE,
      };

      prisma.horse.findUnique.mockResolvedValue(existingHorse);
      prisma.user.findUnique.mockResolvedValue(invalidRoleUser);

      await expect(
        service.transferOwner('h-1', { newOwnerId: 'user-trainer' }, mockManager),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: expect.objectContaining({ code: 'INVALID_NEW_OWNER' }),
      });
    });
  });

  describe('remove', () => {
    it('should delete horse and release stalls if no historical dependencies exist', async () => {
      const cleanHorse = {
        id: 'h-clean',
        name: 'Clean Horse',
        isMedicalLocked: false,
        workoutSessions: [],
        trainingPlans: [],
        medicalRecords: [],
        injuryLogs: [],
        medicalLocks: [],
        preventiveSchedules: [],
        tournamentRegistrations: [],
        financialInvoices: [],
      };

      prisma.horse.findUnique.mockResolvedValue(cleanHorse);
      prisma.horse.delete.mockResolvedValue(cleanHorse);

      const res = await service.remove('h-clean', mockManager);
      expect(res.success).toBe(true);
      expect(prisma.stallAllocation.updateMany).toHaveBeenCalledWith({
        where: { horseId: 'h-clean', isActive: true },
        data: expect.objectContaining({ isActive: false }),
      });
      expect(prisma.horse.delete).toHaveBeenCalledWith({ where: { id: 'h-clean' } });
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        'HORSE_DELETED',
        expect.stringContaining('Deleted horse profile'),
        'h-clean',
      );
    });

    it('should throw 400 HAS_DEPENDENT_DATA if horse has medical or training dependencies', async () => {
      const horseWithRecords = {
        id: 'h-records',
        name: 'Veteran Horse',
        isMedicalLocked: false,
        workoutSessions: [{ id: 'ws-1' }],
        trainingPlans: [],
        medicalRecords: [],
        injuryLogs: [],
        medicalLocks: [],
        preventiveSchedules: [],
        tournamentRegistrations: [],
        financialInvoices: [],
      };

      prisma.horse.findUnique.mockResolvedValue(horseWithRecords);

      await expect(service.remove('h-records', mockManager)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: expect.objectContaining({ code: 'HAS_DEPENDENT_DATA' }),
      });
    });

    it('should throw 400 HORSE_LOCKED if horse is medical locked', async () => {
      const lockedHorse = {
        id: 'h-locked',
        name: 'Locked Horse',
        isMedicalLocked: true,
        workoutSessions: [],
        trainingPlans: [],
        medicalRecords: [],
        injuryLogs: [],
        medicalLocks: [],
        preventiveSchedules: [],
        tournamentRegistrations: [],
        financialInvoices: [],
      };

      prisma.horse.findUnique.mockResolvedValue(lockedHorse);

      await expect(service.remove('h-locked', mockManager)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: expect.objectContaining({ code: 'HORSE_LOCKED' }),
      });
    });
  });

  describe('getHistory', () => {
    it('should aggregate unified history and timeline correctly', async () => {
      const mockHistoryHorse = {
        id: 'h-1',
        horseCode: 'HR-000001',
        name: 'Thunderbolt Swift',
        breed: 'Thoroughbred',
        status: HorseStatus.ACTIVE,
        isMedicalLocked: false,
        createdAt: new Date('2026-01-01'),
        owner: { id: 'owner-1', fullName: 'Owner User' },
        stallAllocations: [
          {
            id: 'sa-1',
            stall: { code: 'STALL-A01', zone: 'Zone A' },
            assignedGroom: { fullName: 'Groom User' },
            startDate: new Date('2026-01-02'),
            endDate: null,
            isActive: true,
          },
        ],
        medicalRecords: [
          {
            id: 'mr-1',
            examinationDate: new Date('2026-02-01'),
            clinicalDiagnosis: 'Mild tendon sensitivity',
            symptoms: 'Heat in foreleg',
            treatmentProtocol: 'Cold compress',
            veterinarian: { fullName: 'Dr. Sarah Connor' },
          },
        ],
        injuryLogs: [],
        medicalLocks: [
          {
            id: 'ml-1',
            lockCode: 'KH-000001',
            lockedAt: new Date('2026-02-01'),
            lockReason: 'Rest period',
            isLocked: false,
            unlockedAt: new Date('2026-02-10'),
            unlockReason: 'Recovered',
            veterinarian: { fullName: 'Dr. Sarah Connor' },
            unlockVet: { fullName: 'Dr. Sarah Connor' },
          },
        ],
        trainingPlans: [
          {
            id: 'tp-1',
            phaseName: 'Base Conditioning',
            targetSpeed: 40,
            targetDistance: 1200,
            trackSurface: 'TURF',
            startDate: new Date('2026-03-01'),
            endDate: new Date('2026-03-30'),
            status: 'APPROVED',
            createdAt: new Date('2026-03-01'),
            trainer: { fullName: 'David Nguyen' },
            workoutSessions: [{ status: 'COMPLETED' }],
          },
        ],
        tournamentRegistrations: [],
      };

      prisma.horse.findUnique.mockResolvedValue(mockHistoryHorse);
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'aud-1',
          action: 'HORSE_STATUS_CHANGED',
          timestamp: new Date('2026-02-01'),
          user: { fullName: 'Dr. Sarah Connor' },
          newValuesJson: JSON.stringify({ oldStatus: 'ACTIVE', newStatus: 'UNDER_OBSERVATION' }),
        },
      ]);

      const result = await service.getHistory('h-1', mockManager);
      expect(result).toBeDefined();
      expect(result.horse.name).toBe('Thunderbolt Swift');
      expect(result.statusHistory).toHaveLength(1);
      expect(result.stallHistory).toHaveLength(1);
      expect(result.medicalHistory.records).toHaveLength(1);
      expect(result.trainingHistory).toHaveLength(1);
      expect(result.timeline.length).toBeGreaterThanOrEqual(4);
    });

    it('should throw 404 HORSE_NOT_FOUND if horse does not exist', async () => {
      prisma.horse.findUnique.mockResolvedValue(null);
      await expect(service.getHistory('non-existent', mockManager)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });
});
