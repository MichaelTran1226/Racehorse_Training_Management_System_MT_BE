import { Test, TestingModule } from '@nestjs/testing';
import { StallsService } from './stalls.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('StallsService', () => {
  let service: StallsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StallsService,
        {
          provide: PrismaService,
          useValue: {}, // Mock PrismaService
        },
        {
          provide: AuditService,
          useValue: {}, // Mock AuditService
        },
      ],
    }).compile();

    service = module.get<StallsService>(StallsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
