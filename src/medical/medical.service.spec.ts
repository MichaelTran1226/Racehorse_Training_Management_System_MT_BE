import { Test, TestingModule } from '@nestjs/testing';
import { MedicalService } from './medical.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HttpException } from '@nestjs/common';

describe('MedicalService', () => {
  let service: MedicalService;
  // let prisma: PrismaService;

  const mockHorse = {
    id: 'horse-1',
    name: 'Thunderbolt',
    microchipRfid: 'RFID-123456',
    breed: 'Thoroughbred',
    dob: new Date('2021-01-01'),
    gender: 'Colt',
    color: 'Bay',
    avatarUrl: null,
    status: 'ACTIVE',
    isMedicalLocked: false,
    ownerId: 'owner-1',
    owner: { id: 'owner-1', fullName: 'John Owner' },
    stallAllocations: [
      {
        id: 'alloc-1',
        stallId: 'stall-1',
        horseId: 'horse-1',
        assignedGroomUserId: 'groom-1',
        isActive: true,
        stall: { id: 'stall-1', code: 'A-01', zone: 'Zone A' },
        assignedGroom: { id: 'groom-1', fullName: 'Groom Hand' },
      },
    ],
  };

  const mockUserVet: CurrentUserPayload = {
    userId: 'vet-1',
    email: 'vet@test.com',
    role: Role.VETERINARIAN,
    fullName: 'Dr. Sarah',
  };

  const mockUserGroom: CurrentUserPayload = {
    userId: 'groom-1',
    email: 'groom@test.com',
    role: Role.GROOM,
    fullName: 'Groom Hand',
  };

  const mockUserOtherGroom: CurrentUserPayload = {
    userId: 'groom-2',
    email: 'groom2@test.com',
    role: Role.GROOM,
    fullName: 'Other Groom',
  };

  const mockUserOwner: CurrentUserPayload = {
    userId: 'owner-1',
    email: 'owner@test.com',
    role: Role.HORSE_OWNER,
    fullName: 'John Owner',
  };

  const mockUserOtherOwner: CurrentUserPayload = {
    userId: 'owner-2',
    email: 'owner2@test.com',
    role: Role.HORSE_OWNER,
    fullName: 'Other Owner',
  };

  const mockPrismaService = {
    horse: {
      findUnique: jest.fn(),
    },
    medicalLock: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    medicalRecord: {
      findMany: jest.fn(),
    },
    injuryLog: {
      findMany: jest.fn(),
    },
    preventiveSchedule: {
      findMany: jest.fn(),
    },
    dailyGroomingLog: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MedicalService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<MedicalService>(MedicalService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('checkHorseAccess', () => {
    it('should throw 404 if horse not found', async () => {
      mockPrismaService.horse.findUnique.mockResolvedValue(null);
      await expect(service.checkHorseAccess('invalid-id', mockUserVet)).rejects.toThrow(
        HttpException,
      );
    });

    it('should allow Vet, Trainer, CM to access any horse', async () => {
      mockPrismaService.horse.findUnique.mockResolvedValue(mockHorse);
      const res = await service.checkHorseAccess('horse-1', mockUserVet);
      expect(res).toBeDefined();
    });

    it('should allow assigned Groom to access horse', async () => {
      mockPrismaService.horse.findUnique.mockResolvedValue(mockHorse);
      const res = await service.checkHorseAccess('horse-1', mockUserGroom);
      expect(res).toBeDefined();
    });

    it('should throw 403 if unassigned Groom attempts access', async () => {
      mockPrismaService.horse.findUnique.mockResolvedValue(mockHorse);
      await expect(service.checkHorseAccess('horse-1', mockUserOtherGroom)).rejects.toThrow(
        HttpException,
      );
    });

    it('should allow Horse Owner to access owned horse', async () => {
      mockPrismaService.horse.findUnique.mockResolvedValue(mockHorse);
      const res = await service.checkHorseAccess('horse-1', mockUserOwner);
      expect(res).toBeDefined();
    });

    it('should throw 403 if Owner attempts access to unowned horse', async () => {
      mockPrismaService.horse.findUnique.mockResolvedValue(mockHorse);
      await expect(service.checkHorseAccess('horse-1', mockUserOtherOwner)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('getHealthBoard', () => {
    beforeEach(() => {
      mockPrismaService.horse.findUnique.mockResolvedValue(mockHorse);
      mockPrismaService.medicalLock.findFirst.mockResolvedValue(null);
      mockPrismaService.medicalRecord.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          examinationDate: new Date('2026-09-01'),
          clinicalDiagnosis: 'Viêm gân nhẹ',
          symptoms: 'Đi khập khiễng',
          treatmentProtocol: 'Chườm đá',
          prescriptionDetails: 'Paracetamol 500mg',
          requiresFollowUp: false,
          veterinarian: { id: 'vet-1', fullName: 'Dr. Sarah' },
        },
      ]);
      mockPrismaService.injuryLog.findMany.mockResolvedValue([
        {
          id: 'inj-1',
          coordinateX: 0.5,
          coordinateY: 0.5,
          anatomicalZone: 'Leg',
          bodySide: 'LEFT',
          injuryType: 'Sprain',
          severity: 'MILD',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockPrismaService.medicalLock.findMany.mockResolvedValue([]);
      mockPrismaService.preventiveSchedule.findMany.mockResolvedValue([]);
      mockPrismaService.dailyGroomingLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          shiftDate: new Date(),
          shiftType: 'MORNING',
          healthObservations: 'Ngựa ăn ngoan, bình thường',
          groom: { id: 'groom-1', fullName: 'Groom Hand' },
        },
      ]);
    });

    it('should return 6 tabs structure for Vet', async () => {
      const result = await service.getHealthBoard('horse-1', mockUserVet);

      expect(result.horse.id).toBe('horse-1');
      expect(result.tabs.overview.activeMedications).not.toBeNull();
      expect(result.tabs.medicalRecords).not.toBeNull();
      expect(result.tabs.medicalLocks).not.toBeNull();
      expect(result.tabs.observationNotes).not.toBeNull();
    });

    it('should hide activeMedications and medicalRecords for Groom', async () => {
      const result = await service.getHealthBoard('horse-1', mockUserGroom);

      expect(result.tabs.overview.activeMedications).toBeNull();
      expect(result.tabs.medicalRecords).toBeNull();
      expect(result.tabs.medicalLocks).toBeNull();
      expect(result.tabs.observationNotes).not.toBeNull();
    });

    it('should restrict fields in medicalRecords and hide observationNotes for Owner', async () => {
      const result = await service.getHealthBoard('horse-1', mockUserOwner);

      expect(result.tabs.overview.activeMedications).toBeNull();
      expect(result.tabs.medicalRecords).not.toBeNull();
      expect(result.tabs.medicalRecords![0].symptoms).toBeUndefined(); // scoped out
      expect(result.tabs.medicalLocks).toBeNull();
      expect(result.tabs.observationNotes).toBeNull();
    });
  });
});
