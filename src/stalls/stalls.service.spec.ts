import { Test, TestingModule } from '@nestjs/testing';
import { StallsService } from './stalls.service';

describe('StallsService', () => {
  let service: StallsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StallsService],
    }).compile();

    service = module.get<StallsService>(StallsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
