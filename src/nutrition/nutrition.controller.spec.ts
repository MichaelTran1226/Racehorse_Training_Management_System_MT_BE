import { Test, TestingModule } from '@nestjs/testing';
import { NutritionController } from './nutrition.controller';
import { NutritionService } from './nutrition.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('NutritionController', () => {
  let controller: NutritionController;
  let service: NutritionService;

  const mockUser: CurrentUserPayload = {
    userId: 'user-ht-1',
    email: 'trainer@equiflow.com',
    role: UserRole.HEAD_TRAINER,
    fullName: 'David Trainer',
  };

  const mockService = {
    findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getActivePlanForHorse: jest.fn().mockResolvedValue({ id: 'plan-1' }),
    calculateMetrics: jest.fn().mockResolvedValue({
      totalFeedWeightKg: 10,
      targetWeightRatioPct: 2.0,
      isWithinSafeRange: true,
    }),
    findOne: jest.fn().mockResolvedValue({ id: 'plan-1' }),
    create: jest.fn().mockResolvedValue({ id: 'plan-1', status: 'DRAFT' }),
    update: jest.fn().mockResolvedValue({ id: 'plan-1' }),
    submitForApproval: jest.fn().mockResolvedValue({ id: 'plan-1', status: 'PENDING_APPROVAL' }),
    review: jest.fn().mockResolvedValue({ id: 'plan-1', status: 'APPROVED' }),
    remove: jest.fn().mockResolvedValue({ success: true }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NutritionController],
      providers: [
        {
          provide: NutritionService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<NutritionController>(NutritionController);
    service = module.get<NutritionService>(NutritionService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate findAll to service', async () => {
    const query = { horseId: 'horse-1' };
    const res = await controller.findAll(query, mockUser);
    expect(service.findAll).toHaveBeenCalledWith(query, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate getActivePlan to service', async () => {
    const res = await controller.getActivePlan('horse-1', mockUser);
    expect(service.getActivePlanForHorse).toHaveBeenCalledWith('horse-1', mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate calculateMetrics to service', async () => {
    const body = { horseId: 'horse-1', meals: [] };
    const res = await controller.calculateMetrics(body);
    expect(service.calculateMetrics).toHaveBeenCalledWith('horse-1', []);
    expect(res).toBeDefined();
  });

  it('should delegate findOne to service', async () => {
    const res = await controller.findOne('plan-1', mockUser);
    expect(service.findOne).toHaveBeenCalledWith('plan-1', mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate create to service', async () => {
    const dto = { horseId: 'horse-1', dailyTargetFeedWeightKg: 10, meals: [] };
    const res = await controller.create(dto as any, mockUser);
    expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate update to service', async () => {
    const dto = { specialInstructions: 'Feed extra grass' };
    const res = await controller.update('plan-1', dto, mockUser);
    expect(service.update).toHaveBeenCalledWith('plan-1', dto, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate submitForApproval to service', async () => {
    const res = await controller.submitForApproval('plan-1', mockUser);
    expect(service.submitForApproval).toHaveBeenCalledWith('plan-1', mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate review to service', async () => {
    const dto = { action: 'APPROVE' as const };
    const res = await controller.review('plan-1', dto, mockUser);
    expect(service.review).toHaveBeenCalledWith('plan-1', dto, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate remove to service', async () => {
    const res = await controller.remove('plan-1', mockUser);
    expect(service.remove).toHaveBeenCalledWith('plan-1', mockUser);
    expect(res).toBeDefined();
  });
});
