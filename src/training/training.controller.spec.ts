import { Test, TestingModule } from '@nestjs/testing';
import { TrainingController } from './training.controller';
import { TrainingInsightsService } from './training-insights.service';
import { TrainingPlansService } from './training-plans.service';
import { WorkoutsService } from './workouts.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('TrainingController', () => {
  let controller: TrainingController;
  let insightsService: TrainingInsightsService;
  let plansService: TrainingPlansService;
  let workoutsService: WorkoutsService;

  const mockUser: CurrentUserPayload = {
    userId: 'user-ht-1',
    email: 'trainer@equiflow.com',
    role: UserRole.HEAD_TRAINER,
    fullName: 'Head Trainer',
  };

  const mockInsights = {
    getOverview: jest.fn().mockResolvedValue({ totalPlans: 5 }),
    getWeeklyCalendar: jest.fn().mockResolvedValue({}),
    getLiveMonitoring: jest.fn().mockResolvedValue([]),
    getTrialRuns: jest.fn().mockResolvedValue([]),
    getFitnessChart: jest.fn().mockResolvedValue({}),
    getAlerts: jest.fn().mockResolvedValue([]),
    ackAlert: jest.fn().mockResolvedValue({ acknowledged: true }),
  };

  const mockPlans = {
    findAllPlans: jest.fn().mockResolvedValue([]),
    findPlanById: jest.fn().mockResolvedValue({ id: 'plan-1' }),
    createPlan: jest.fn().mockResolvedValue({ id: 'plan-1' }),
    updatePlan: jest.fn().mockResolvedValue({ id: 'plan-1' }),
    changePlanStatus: jest.fn().mockResolvedValue({ id: 'plan-1', status: 'ACTIVE' }),
    clonePlan: jest.fn().mockResolvedValue({ id: 'plan-2' }),
    deletePlan: jest.fn().mockResolvedValue({ success: true }),
  };

  const mockWorkouts = {
    createWorkout: jest.fn().mockResolvedValue({ id: 'wo-1' }),
    createRepeatWorkouts: jest.fn().mockResolvedValue({ createdCount: 4 }),
    findWorkoutById: jest.fn().mockResolvedValue({ id: 'wo-1' }),
    updateWorkout: jest.fn().mockResolvedValue({ id: 'wo-1' }),
    deleteWorkout: jest.fn().mockResolvedValue({ success: true }),
    restoreWorkout: jest.fn().mockResolvedValue({ id: 'wo-1' }),
    recordResult: jest.fn().mockResolvedValue({ id: 'wo-1' }),
    getSessionResult: jest.fn().mockResolvedValue({ id: 'wo-1' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrainingController],
      providers: [
        { provide: TrainingInsightsService, useValue: mockInsights },
        { provide: TrainingPlansService, useValue: mockPlans },
        { provide: WorkoutsService, useValue: mockWorkouts },
      ],
    }).compile();

    controller = module.get<TrainingController>(TrainingController);
    insightsService = module.get<TrainingInsightsService>(TrainingInsightsService);
    plansService = module.get<TrainingPlansService>(TrainingPlansService);
    workoutsService = module.get<WorkoutsService>(WorkoutsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate overview to insights service', async () => {
    const res = await controller.getOverview();
    expect(insightsService.getOverview).toHaveBeenCalled();
    expect(res).toBeDefined();
  });

  it('should delegate findAllPlans to plans service', async () => {
    const res = await controller.findAllPlans({}, mockUser);
    expect(plansService.findAllPlans).toHaveBeenCalled();
    expect(res).toBeDefined();
  });

  it('should delegate findPlanById to plans service', async () => {
    const res = await controller.findPlanById('plan-1', mockUser);
    expect(plansService.findPlanById).toHaveBeenCalledWith('plan-1', mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate createPlan to plans service', async () => {
    const dto = {
      horseId: 'h1',
      planName: 'Sprint',
      startDate: '2026-10-18',
      targetDistanceMeters: 1200,
    };
    const res = await controller.createPlan(dto as any, mockUser);
    expect(plansService.createPlan).toHaveBeenCalledWith(dto, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate createWorkout to workouts service', async () => {
    const dto = { workoutDate: '2026-10-18', workoutType: 'CANTER' as any };
    const res = await controller.createWorkout('plan-1', dto as any, mockUser);
    expect(workoutsService.createWorkout).toHaveBeenCalled();
    expect(res).toBeDefined();
  });
});
