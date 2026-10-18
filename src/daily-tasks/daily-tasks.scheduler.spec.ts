import { Test, TestingModule } from '@nestjs/testing';
import { DailyTasksScheduler } from './daily-tasks.scheduler';
import { DailyTasksService } from './daily-tasks.service';

describe('DailyTasksScheduler', () => {
  let scheduler: DailyTasksScheduler;
  let service: DailyTasksService;

  const mockService = {
    generateDailyTasksForDate: jest.fn().mockResolvedValue({
      totalGenerated: 10,
      horsesProcessed: 3,
      date: '2026-10-18',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyTasksScheduler,
        {
          provide: DailyTasksService,
          useValue: mockService,
        },
      ],
    }).compile();

    scheduler = module.get<DailyTasksScheduler>(DailyTasksScheduler);
    service = module.get<DailyTasksService>(DailyTasksService);
  });

  it('should be defined', () => {
    expect(scheduler).toBeDefined();
  });

  it('should run nightly task generation successfully', async () => {
    await scheduler.handleNightlyTaskGeneration();
    expect(service.generateDailyTasksForDate).toHaveBeenCalled();
  });

  it('should handle errors gracefully during nightly task generation', async () => {
    jest.spyOn(service, 'generateDailyTasksForDate').mockRejectedValueOnce(new Error('DB failure'));
    await expect(scheduler.handleNightlyTaskGeneration()).resolves.not.toThrow();
  });
});
