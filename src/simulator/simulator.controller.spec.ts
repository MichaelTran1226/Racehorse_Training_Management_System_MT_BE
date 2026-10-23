import { Test, TestingModule } from '@nestjs/testing';
import { SimulatorController } from './simulator.controller';
import { SimulatorService } from './simulator.service';
import { SimulatorSessionsResponse } from './simulator.types';
import { Role } from '@prisma/client';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('SimulatorController', () => {
  let controller: SimulatorController;
  let service: any;
  const actor: CurrentUserPayload = {
    userId: 'trainer-1',
    email: 'trainer@gmail.com',
    role: Role.HEAD_TRAINER,
    fullName: 'Trainer',
  };

  beforeEach(async () => {
    service = {
      listRecent: jest.fn(),
      startWorkout: jest.fn(),
      getContext: jest.fn(),
      getLatestWorkoutResult: jest.fn(),
      startExam: jest.fn(),
      getLatestExamResult: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimulatorController],
      providers: [{ provide: SimulatorService, useValue: service }],
    }).compile();

    controller = module.get<SimulatorController>(SimulatorController);
  });

  it('delegates to simulatorService.listRecent with default limit', async () => {
    const mockResponse: SimulatorSessionsResponse = {
      active: [],
      recent: [],
    };
    service.listRecent.mockResolvedValue(mockResponse);

    const result = await controller.getSessions();

    expect(service.listRecent).toHaveBeenCalledWith(20, undefined);
    expect(result).toBe(mockResponse);
  });

  it('delegates to simulatorService.listRecent with custom limit', async () => {
    const mockResponse: SimulatorSessionsResponse = {
      active: [],
      recent: [],
    };
    service.listRecent.mockResolvedValue(mockResponse);

    const result = await controller.getSessions('50');

    expect(service.listRecent).toHaveBeenCalledWith(50, undefined);
    expect(result).toBe(mockResponse);
  });

  it('filters sessions by RUNNING status for live monitoring', async () => {
    service.listRecent.mockResolvedValue({ active: [], recent: [] });

    await controller.getSessions('20', 'RUNNING');

    expect(service.listRecent).toHaveBeenCalledWith(20, 'RUNNING');
  });

  it('starts a workout simulation for the current trainer', async () => {
    const response = {
      sessionId: 'session-1',
      status: 'PENDING',
      launchUrl: 'http://localhost:5175/?sessionId=session-1',
    };
    service.startWorkout.mockResolvedValue(response);

    await expect(controller.startWorkout('workout-1', actor)).resolves.toBe(response);
    expect(service.startWorkout).toHaveBeenCalledWith('workout-1', actor);
  });

  it('returns a session context for the current trainer', async () => {
    const response = {
      sessionId: 'session-1',
      horse: { id: 'horse-1' },
      workout: { id: 'workout-1' },
    };
    service.getContext.mockResolvedValue(response);

    await expect(controller.getContext('session-1', actor)).resolves.toBe(response);
    expect(service.getContext).toHaveBeenCalledWith('session-1', actor);
  });

  it('returns the latest simulator draft for a workout', async () => {
    const response = { sessionId: 'session-1', status: 'COMPLETED', resultDraft: {} };
    service.getLatestWorkoutResult.mockResolvedValue(response);

    await expect(controller.getLatestWorkoutResult('workout-1', actor)).resolves.toBe(response);
    expect(service.getLatestWorkoutResult).toHaveBeenCalledWith('workout-1', actor);
  });

  it('starts and reviews an examination simulation', async () => {
    service.startExam.mockResolvedValue({ sessionId: 'exam-1' });
    service.getLatestExamResult.mockResolvedValue({ sessionId: 'exam-1', resultDraft: {} });

    await controller.startExam('horse-1', {}, actor);
    await controller.getLatestExamResult('horse-1', actor);

    expect(service.startExam).toHaveBeenCalledWith('horse-1', undefined, actor);
    expect(service.getLatestExamResult).toHaveBeenCalledWith('horse-1', actor);
  });
});
