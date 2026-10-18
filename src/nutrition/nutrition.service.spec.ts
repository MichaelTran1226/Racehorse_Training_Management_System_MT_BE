import { HttpStatus } from '@nestjs/common';
import { NutritionPlanStatus, Role } from '@prisma/client';
import { NutritionService } from './nutrition.service';
import { UserRole } from '../common/enums/role.enum';

describe('NutritionService', () => {
  let service: NutritionService;
  let prismaMock: any;
  let auditMock: any;
  let notificationsMock: any;

  const mockTrainerUser = {
    userId: 'user-ht-1',
    email: 'trainer@equiflow.com',
    fullName: 'David Trainer',
    role: UserRole.HEAD_TRAINER,
  };

  const mockVetUser = {
    userId: 'user-vet-1',
    email: 'vet@equiflow.com',
    fullName: 'Dr. Sarah Vet',
    role: UserRole.VETERINARIAN,
  };

  const mockGroomUser = {
    userId: 'user-groom-1',
    email: 'groom@equiflow.com',
    fullName: 'Groom Alex',
    role: UserRole.GROOM,
  };

  const mockHorse = {
    id: 'horse-1',
    name: 'Thunderbolt',
    horseCode: 'EQ-001',
    ownerId: 'owner-1',
    medicalRecords: [{ weightKg: 500 }],
  };

  beforeEach(() => {
    prismaMock = {
      horse: {
        findUnique: jest.fn(),
      },
      nutritionPlan: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
    };

    auditMock = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    notificationsMock = {
      notifyRoles: jest.fn().mockResolvedValue(undefined),
      notifyUsers: jest.fn().mockResolvedValue(undefined),
    };

    service = new NutritionService(prismaMock, auditMock, notificationsMock);
  });

  describe('calculateMetrics', () => {
    it('calculates total daily feed weight and ratio correctly within safe range 1.5% - 3.0%', async () => {
      prismaMock.horse.findUnique.mockResolvedValue(mockHorse);

      const meals = [
        {
          mealType: 'MORNING' as const,
          items: [
            {
              supplyId: 's1',
              supplyName: 'Timothy Hay',
              category: 'FEED_HAY',
              amount: 5,
              unit: 'KG',
            },
            {
              supplyId: 's2',
              supplyName: 'Oats Grain',
              category: 'FEED_GRAIN',
              amount: 1500,
              unit: 'G',
            }, // 1.5 kg
          ],
        },
        {
          mealType: 'EVENING' as const,
          items: [
            {
              supplyId: 's1',
              supplyName: 'Timothy Hay',
              category: 'FEED_HAY',
              amount: 4.5,
              unit: 'KG',
            },
          ],
        },
      ];

      // Total = 5 + 1.5 + 4.5 = 11 kg.
      // Horse weight = 500 kg.
      // Ratio = 11 / 500 * 100 = 2.2% (Within safe range 1.5% - 3.0%)
      const res = await service.calculateMetrics('horse-1', meals);

      expect(res.dailyFeedWeightKg).toBe(11);
      expect(res.horseWeightKg).toBe(500);
      expect(res.targetWeightRatioPct).toBe(2.2);
      expect(res.isWithinSafeRange).toBe(true);
      expect(res.evaluation).toBe('OPTIMAL');
      expect(res.warningMessage).toBeUndefined();
    });

    it('warns when total feed is under 1.5% of body weight', async () => {
      prismaMock.horse.findUnique.mockResolvedValue(mockHorse);

      const meals = [
        {
          mealType: 'MORNING' as const,
          items: [
            {
              supplyId: 's1',
              supplyName: 'Timothy Hay',
              category: 'FEED_HAY',
              amount: 4,
              unit: 'KG',
            }, // 4 / 500 = 0.8%
          ],
        },
      ];

      const res = await service.calculateMetrics('horse-1', meals);

      expect(res.targetWeightRatioPct).toBe(0.8);
      expect(res.isWithinSafeRange).toBe(false);
      expect(res.evaluation).toBe('UNDER_MINIMUM');
      expect(res.warningMessage).toContain('dưới ngưỡng khuyến nghị 1.5%');
    });

    it('warns when total feed exceeds 3.0% of body weight', async () => {
      prismaMock.horse.findUnique.mockResolvedValue(mockHorse);

      const meals = [
        {
          mealType: 'MORNING' as const,
          items: [
            {
              supplyId: 's1',
              supplyName: 'Timothy Hay',
              category: 'FEED_HAY',
              amount: 18,
              unit: 'KG',
            }, // 18 / 500 = 3.6%
          ],
        },
      ];

      const res = await service.calculateMetrics('horse-1', meals);

      expect(res.targetWeightRatioPct).toBe(3.6);
      expect(res.isWithinSafeRange).toBe(false);
      expect(res.evaluation).toBe('EXCEEDS_MAXIMUM');
      expect(res.warningMessage).toContain('vượt quá ngưỡng tối đa 3.0%');
    });
  });

  describe('State Machine & Workflow', () => {
    it('creates draft when submitImmediately is false and logs audit', async () => {
      prismaMock.horse.findUnique.mockResolvedValue(mockHorse);
      prismaMock.nutritionPlan.create.mockResolvedValue({
        id: 'plan-1',
        planCode: 'NP-2610-001',
        horseId: 'horse-1',
        status: NutritionPlanStatus.DRAFT,
      });

      const res = await service.create(
        {
          horseId: 'horse-1',
          meals: [],
          submitImmediately: false,
        },
        mockTrainerUser,
      );

      expect(res.status).toBe(NutritionPlanStatus.DRAFT);
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.anything(),
        'CREATE_NUTRITION_PLAN_DRAFT',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it('submits plan for approval (DRAFT -> PENDING_APPROVAL) and notifies veterinarians', async () => {
      prismaMock.nutritionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        planCode: 'NP-2610-001',
        horseId: 'horse-1',
        status: NutritionPlanStatus.DRAFT,
        horse: { name: 'Thunderbolt' },
      });

      prismaMock.nutritionPlan.update.mockResolvedValue({
        id: 'plan-1',
        status: NutritionPlanStatus.PENDING_APPROVAL,
      });

      const res = await service.submitForApproval('plan-1', mockTrainerUser);

      expect(res.status).toBe(NutritionPlanStatus.PENDING_APPROVAL);
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.anything(),
        'SUBMIT_NUTRITION_PLAN',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(notificationsMock.notifyRoles).toHaveBeenCalledWith(
        [Role.VETERINARIAN, Role.CLUB_MANAGER],
        expect.objectContaining({ type: 'NUTRITION_PLAN_SUBMITTED' }),
        mockTrainerUser.userId,
      );
    });

    it('allows veterinarian to APPROVE a pending plan and archives old plan', async () => {
      prismaMock.nutritionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        horseId: 'horse-1',
        createdById: 'user-ht-1',
        status: NutritionPlanStatus.PENDING_APPROVAL,
        horse: { name: 'Thunderbolt' },
      });

      prismaMock.nutritionPlan.update.mockResolvedValue({
        id: 'plan-1',
        status: NutritionPlanStatus.APPROVED,
        approvedById: mockVetUser.userId,
      });

      const res = await service.review(
        'plan-1',
        { action: 'APPROVE', vetNotes: 'Balanced digestive load for racing season.' },
        mockVetUser,
      );

      expect(res.status).toBe(NutritionPlanStatus.APPROVED);
      expect(prismaMock.nutritionPlan.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            horseId: 'horse-1',
            status: NutritionPlanStatus.APPROVED,
            id: { not: 'plan-1' },
          },
          data: expect.objectContaining({ status: NutritionPlanStatus.ARCHIVED }),
        }),
      );
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.anything(),
        'APPROVE_NUTRITION_PLAN',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(notificationsMock.notifyUsers).toHaveBeenCalledWith(
        ['user-ht-1'],
        expect.objectContaining({ type: 'NUTRITION_PLAN_APPROVED' }),
        mockVetUser.userId,
      );
    });

    it('requires rejectionReason when rejecting a plan', async () => {
      prismaMock.nutritionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        horseId: 'horse-1',
        status: NutritionPlanStatus.PENDING_APPROVAL,
        horse: { name: 'Thunderbolt' },
      });

      await expect(
        service.review('plan-1', { action: 'REJECT', rejectionReason: '' }, mockVetUser),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('rejects review when user is not a Veterinarian or Club Manager', async () => {
      await expect(
        service.review('plan-1', { action: 'APPROVE' }, mockTrainerUser),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('allows Groom to view plans in findOne', async () => {
      prismaMock.nutritionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        horseId: 'horse-1',
        status: NutritionPlanStatus.DRAFT,
        targetWeightRatioPct: 2.0,
        horse: { medicalRecords: [] },
      });

      const res = await service.findOne('plan-1', mockGroomUser);
      expect(res).toBeDefined();
      expect(res.id).toBe('plan-1');
    });

    it('creates draft and submitted plans', async () => {
      prismaMock.horse.findUnique.mockResolvedValue(mockHorse);
      prismaMock.nutritionPlan.create.mockResolvedValue({
        id: 'plan-1',
        planCode: 'NP-001',
        status: NutritionPlanStatus.DRAFT,
        horse: { name: 'Thunderbolt' },
        createdBy: mockTrainerUser,
      });

      const res = await service.create(
        {
          horseId: 'horse-1',
          meals: [],
        },
        mockTrainerUser,
      );
      expect(res).toBeDefined();

      const submitted = await service.create(
        {
          horseId: 'horse-1',
          meals: [],
          submitImmediately: true,
        },
        mockTrainerUser,
      );
      expect(submitted).toBeDefined();
    });

    it('updates plan successfully', async () => {
      prismaMock.nutritionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        horseId: 'horse-1',
        status: NutritionPlanStatus.DRAFT,
        createdById: mockTrainerUser.userId,
        horse: { name: 'Thunderbolt' },
      });
      prismaMock.horse.findUnique.mockResolvedValue(mockHorse);
      prismaMock.nutritionPlan.update.mockResolvedValue({
        id: 'plan-1',
        status: NutritionPlanStatus.DRAFT,
        horse: { name: 'Thunderbolt' },
      });
      const res = await service.update('plan-1', { meals: [] }, mockTrainerUser);
      expect(res).toBeDefined();
    });

    it('submits plan for approval', async () => {
      prismaMock.nutritionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        horseId: 'horse-1',
        status: NutritionPlanStatus.DRAFT,
        createdById: mockTrainerUser.userId,
        horse: { name: 'Thunderbolt' },
      });
      prismaMock.nutritionPlan.update.mockResolvedValue({
        id: 'plan-1',
        status: NutritionPlanStatus.PENDING_APPROVAL,
      });
      const res = await service.submitForApproval('plan-1', mockTrainerUser);
      expect(res).toBeDefined();
    });

    it('removes draft plan', async () => {
      prismaMock.nutritionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        status: NutritionPlanStatus.DRAFT,
        createdById: mockTrainerUser.userId,
        horse: { name: 'Thunderbolt' },
      });
      prismaMock.nutritionPlan.delete.mockResolvedValue({});
      const res = await service.remove('plan-1', mockTrainerUser);
      expect(res).toEqual({ success: true, message: 'Đã xóa khẩu phần ăn.' });
    });

    it('finds all plans with RBAC filtering', async () => {
      prismaMock.nutritionPlan.findMany.mockResolvedValue([]);
      prismaMock.nutritionPlan.count.mockResolvedValue(0);
      const res = await service.findAll({}, mockTrainerUser);
      expect(res.items).toEqual([]);

      const groomRes = await service.findAll({}, mockGroomUser);
      expect(groomRes.items).toEqual([]);
    });

    it('retrieves active plan for horse', async () => {
      prismaMock.nutritionPlan.findFirst.mockResolvedValue({
        id: 'plan-active',
        status: NutritionPlanStatus.APPROVED,
      });
      const res = await service.getActivePlanForHorse('horse-1', mockTrainerUser);
      expect(res).toBeDefined();

      prismaMock.nutritionPlan.findFirst.mockResolvedValue(null);
      const none = await service.getActivePlanForHorse('horse-2', mockTrainerUser);
      expect(none).toBeNull();
    });
  });
});
