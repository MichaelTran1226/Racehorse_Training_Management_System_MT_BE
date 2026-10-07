import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { HorseStatus, PlanStatus, TrackSurface } from '@prisma/client';
import { TrainingService } from './training.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('TrainingService (Flow 2 & RULE-MED-01)', () => {
  let service: TrainingService;
  let prisma: any;
  let audit: any;

  const mockTrainer: CurrentUserPayload = {
    userId: 'trainer-1',
    email: 'trainer@equiflow.com',
    fullName: 'Head Trainer David',
    role: UserRole.HEAD_TRAINER,
  };

  const mockOwner: CurrentUserPayload = {
    userId: 'owner-1',
    email: 'owner@gmail.com',
    fullName: 'Robert Sterling',
    role: UserRole.HORSE_OWNER,
  };

  beforeEach(async () => {
    prisma = {
      horse: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      trainingPlan: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      workoutSession: {
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<TrainingService>(TrainingService);
  });

  describe('createPlan (RULE-MED-01 Medical Lock Guard)', () => {
    it('should reject plan creation if the horse is medically locked (RULE-MED-01)', async () => {
      // Mock horse with active medical lock
      prisma.horse.findUnique.mockResolvedValue({
        id: 'horse-locked',
        name: 'Northern Dancer Legacy',
        horseCode: 'HR-000002',
        isMedicalLocked: true,
        medicalLocks: [
          { id: 'lock-1', isLocked: true, lockReason: 'Desmitis lesion in left foreleg' },
        ],
      });

      await expect(
        service.createPlan(
          {
            horseId: 'horse-locked',
            phaseName: 'Intense Gallop Conditioning',
            startDate: '2026-10-10',
            endDate: '2026-11-10',
            status: PlanStatus.APPROVED,
          },
          mockTrainer,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
        }),
      );

      expect(prisma.trainingPlan.create).not.toHaveBeenCalled();
    });

    it('should reject plan creation if start date is after end date', async () => {
      prisma.horse.findUnique.mockResolvedValue({
        id: 'horse-healthy',
        name: 'Thunderbolt Swift',
        horseCode: 'HR-000001',
        isMedicalLocked: false,
        medicalLocks: [],
      });

      await expect(
        service.createPlan(
          {
            horseId: 'horse-healthy',
            phaseName: 'Spring Prep',
            startDate: '2026-11-10',
            endDate: '2026-10-10', // invalid
          },
          mockTrainer,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
        }),
      );
    });

    it('should successfully create plan for a healthy horse and update status to IN_TRAINING', async () => {
      prisma.horse.findUnique.mockResolvedValue({
        id: 'horse-healthy',
        name: 'Thunderbolt Swift',
        horseCode: 'HR-000001',
        status: HorseStatus.ACTIVE,
        isMedicalLocked: false,
        medicalLocks: [],
      });

      const createdPlan = {
        id: 'plan-1',
        horseId: 'horse-healthy',
        trainerUserId: mockTrainer.userId,
        phaseName: 'Sprint Conditioning',
        targetSpeed: 45,
        targetDistance: 1200,
        trackSurface: TrackSurface.TURF,
        startDate: new Date('2026-10-10'),
        endDate: new Date('2026-11-10'),
        status: PlanStatus.APPROVED,
        horse: {
          id: 'horse-healthy',
          name: 'Thunderbolt Swift',
          horseCode: 'HR-000001',
          isMedicalLocked: false,
        },
        trainer: { id: mockTrainer.userId, fullName: mockTrainer.fullName },
        workoutSessions: [],
      };

      prisma.trainingPlan.create.mockResolvedValue(createdPlan);
      prisma.horse.update.mockResolvedValue({
        id: 'horse-healthy',
        status: HorseStatus.IN_TRAINING,
      });

      const result = await service.createPlan(
        {
          horseId: 'horse-healthy',
          phaseName: 'Sprint Conditioning',
          targetSpeed: 45,
          targetDistance: 1200,
          startDate: '2026-10-10',
          endDate: '2026-11-10',
        },
        mockTrainer,
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('plan-1');
      expect(prisma.trainingPlan.create).toHaveBeenCalled();
      expect(prisma.horse.update).toHaveBeenCalledWith({
        where: { id: 'horse-healthy' },
        data: { status: HorseStatus.IN_TRAINING },
      });
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe('updatePlan (Medical Lock transition enforcement)', () => {
    it('should block activating a plan if horse is currently under Medical Lock', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        horseId: 'horse-locked',
        status: PlanStatus.DRAFT,
      });

      prisma.horse.findUnique.mockResolvedValue({
        id: 'horse-locked',
        isMedicalLocked: true,
        medicalLocks: [{ isLocked: true, lockReason: 'Carpal joint inflammation' }],
      });

      await expect(
        service.updatePlan('plan-1', { status: PlanStatus.ACTIVE }, mockTrainer),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
        }),
      );

      expect(prisma.trainingPlan.update).not.toHaveBeenCalled();
    });
  });

  describe('findAllPlans', () => {
    it('should scope plans to owned horses when queried by a HORSE_OWNER', async () => {
      prisma.trainingPlan.findMany.mockResolvedValue([]);
      prisma.trainingPlan.count.mockResolvedValue(0);

      await service.findAllPlans({}, mockOwner);

      expect(prisma.trainingPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { horse: { ownerId: mockOwner.userId } },
        }),
      );
    });
  });

  describe('createWorkout (RULE-MED-01 enforcement)', () => {
    it('should reject workout scheduling if the horse is medically locked', async () => {
      prisma.trainingPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        horseId: 'horse-locked',
      });

      prisma.horse.findUnique.mockResolvedValue({
        id: 'horse-locked',
        isMedicalLocked: true,
        medicalLocks: [{ isLocked: true }],
      });

      await expect(
        service.createWorkout(
          'plan-1',
          {
            scheduledDate: '2026-10-15T08:00:00Z',
            distanceMeters: 1400,
          },
          mockTrainer,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
        }),
      );
    });
  });
});
