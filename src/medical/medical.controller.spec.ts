import { Test, TestingModule } from '@nestjs/testing';
import { MedicalController } from './medical.controller';
import { HealthOverviewService } from './health-overview.service';
import { InjuriesService } from './injuries.service';
import { MedicalLocksService } from './medical-locks.service';
import { MedicalRecordsService } from './medical-records.service';
import { PreventiveCareService } from './preventive-care.service';

describe('MedicalController', () => {
  let controller: MedicalController;
  let service: HealthOverviewService;

  const mockUser = {
    userId: 'vet-1',
    email: 'vet@gmail.com',
    role: 'VETERINARIAN',
    fullName: 'Vet',
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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MedicalController],
      providers: [
        { provide: HealthOverviewService, useValue: mockMedicalService },
        { provide: InjuriesService, useValue: {} },
        { provide: MedicalLocksService, useValue: {} },
        { provide: MedicalRecordsService, useValue: {} },
        { provide: PreventiveCareService, useValue: {} },
      ],
    }).compile();

    controller = module.get<MedicalController>(MedicalController);
    service = module.get(HealthOverviewService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHealthBoard', () => {
    it('should call service.getHealthBoard and return result', async () => {
      const query = { search: 'horse-1' };
      const res = await controller.getHealthBoard(query, mockUser);
      expect(res).toEqual(mockHealthBoard);
      expect(service.getHealthBoard).toHaveBeenCalledWith(query, mockUser);
    });
  });
});
