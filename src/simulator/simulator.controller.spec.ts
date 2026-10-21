import { Test, TestingModule } from '@nestjs/testing';
import { SimulatorController } from './simulator.controller';
import { SimulatorService } from './simulator.service';
import { SimulatorSessionsResponse } from './simulator.types';

describe('SimulatorController', () => {
  let controller: SimulatorController;
  let service: any;

  beforeEach(async () => {
    service = {
      listRecent: jest.fn(),
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

    expect(service.listRecent).toHaveBeenCalledWith(20);
    expect(result).toBe(mockResponse);
  });

  it('delegates to simulatorService.listRecent with custom limit', async () => {
    const mockResponse: SimulatorSessionsResponse = {
      active: [],
      recent: [],
    };
    service.listRecent.mockResolvedValue(mockResponse);

    const result = await controller.getSessions('50');

    expect(service.listRecent).toHaveBeenCalledWith(50);
    expect(result).toBe(mockResponse);
  });
});
