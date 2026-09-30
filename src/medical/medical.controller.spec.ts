import { Test, TestingModule } from '@nestjs/testing';
import { MedicalController } from './medical.controller';
import { MedicalService } from './medical.service';
import { Role } from '@prisma/client';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('MedicalController', () => {
  let controller: MedicalController;
  let service: MedicalService;

  const mockUser: CurrentUserPayload = {
    userId: 'vet-1',
    email: 'vet@test.com',
    role: Role.VETERINARIAN,
    fullName: 'Dr. Sarah',
  };

  const mockHealthBoard = {
    horse: {
      id: 'horse-1',
      name: 'Thunderbolt',
      microchipRfid: 'RFID-123',
      breed: 'Thoroughbred',
      gender: 'Colt',
      color: 'Bay',
      avatarUrl: null,
      status: 'ACTIVE',
      isMedicalLocked: false,
      stallCode: 'A-01',
      zone: 'Zone A',
      owner: null,
    },
    medicalLockBanner: {
      isLocked: false,
      lockedAt: null,
      vetName: null,
      lockReason: null,
      recheckDate: null,
      overdueDays: null,
    },
    tabs: {
      overview: {
        currentStatus: 'ACTIVE',
        healthGroup: 'ACTIVE',
        allowedActivityLevel: 'NORMAL_TRAINING',
        careInstructions: [],
        activeMedications: [],
        latestVitals: null,
        vitalsHistory: [],
        upcomingOverduePreventives: [],
      },
      medicalRecords: [],
      injuries: [],
      medicalLocks: [],
      preventiveSchedules: [],
      observationNotes: [],
    },
  };

  const mockMedicalService = {
    getHealthBoard: jest.fn().mockResolvedValue(mockHealthBoard),
    getObservationNotes: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MedicalController],
      providers: [{ provide: MedicalService, useValue: mockMedicalService }],
    }).compile();

    controller = module.get<MedicalController>(MedicalController);
    service = module.get<MedicalService>(MedicalService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHealthBoard', () => {
    it('should call service.getHealthBoard and return result', async () => {
      const res = await controller.getHealthBoard('horse-1', {}, mockUser);
      expect(res).toEqual(mockHealthBoard);
      expect(service.getHealthBoard).toHaveBeenCalledWith('horse-1', mockUser);
    });
  });

  describe('getMedicalHorseProfile', () => {
    it('should call service.getHealthBoard for SC-3.02 alias', async () => {
      const res = await controller.getMedicalHorseProfile('horse-1', {}, mockUser);
      expect(res).toEqual(mockHealthBoard);
      expect(service.getHealthBoard).toHaveBeenCalledWith('horse-1', mockUser);
    });
  });

  describe('getObservationNotes', () => {
    it('should call service.getObservationNotes', async () => {
      const res = await controller.getObservationNotes('horse-1', {}, mockUser);
      expect(res).toEqual([]);
      expect(service.getObservationNotes).toHaveBeenCalledWith('horse-1', {}, mockUser);
    });
  });
});
