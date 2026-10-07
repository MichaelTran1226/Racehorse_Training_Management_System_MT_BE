import { Test, TestingModule } from '@nestjs/testing';
import { StallsController } from './stalls.controller';

describe('StallsController', () => {
  let controller: StallsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StallsController],
    }).compile();

    controller = module.get<StallsController>(StallsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
