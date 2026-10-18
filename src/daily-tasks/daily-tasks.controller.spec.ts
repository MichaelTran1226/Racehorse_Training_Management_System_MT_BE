import { Test, TestingModule } from '@nestjs/testing';
import { DailyTasksController } from './daily-tasks.controller';
import { DailyTasksService } from './daily-tasks.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('DailyTasksController', () => {
  let controller: DailyTasksController;
  let service: DailyTasksService;

  const mockUser: CurrentUserPayload = {
    userId: 'user-1',
    email: 'groom@equiflow.com',
    role: UserRole.GROOM,
    fullName: 'Groom Alex',
  };

  const mockService = {
    findAll: jest.fn().mockResolvedValue({
      items: [],
      summary: { total: 0, completed: 0, pending: 0, completionRatePct: 0 },
    }),
    generateDailyTasksForDate: jest
      .fn()
      .mockResolvedValue({ totalGenerated: 5, horsesProcessed: 2, date: '2026-10-18' }),
    completeTask: jest.fn().mockResolvedValue({ id: 'task-1', isCompleted: true }),
    uncompleteTask: jest.fn().mockResolvedValue({ id: 'task-1', isCompleted: false }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DailyTasksController],
      providers: [
        {
          provide: DailyTasksService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<DailyTasksController>(DailyTasksController);
    service = module.get<DailyTasksService>(DailyTasksService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate findAll to service', async () => {
    const query = { date: '2026-10-18' };
    const res = await controller.findAll(query, mockUser);
    expect(service.findAll).toHaveBeenCalledWith(query, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate generateTasks to service with default and explicit dates', async () => {
    await controller.generateTasks({ date: '2026-10-18', zoneId: 'zone-1' });
    expect(service.generateDailyTasksForDate).toHaveBeenCalled();

    await controller.generateTasks({});
    expect(service.generateDailyTasksForDate).toHaveBeenCalled();
  });

  it('should delegate completeTask to service', async () => {
    const dto = { notes: 'Completed clean' };
    const res = await controller.completeTask('task-1', dto, mockUser);
    expect(service.completeTask).toHaveBeenCalledWith('task-1', dto, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate uncompleteTask to service', async () => {
    const res = await controller.uncompleteTask('task-1', mockUser);
    expect(service.uncompleteTask).toHaveBeenCalledWith('task-1', mockUser);
    expect(res).toBeDefined();
  });
});
