import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthService', () => {
  let service: HealthService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: {
            isHealthy: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should report status ok when database is healthy', async () => {
    (prismaService.isHealthy as jest.Mock).mockResolvedValue(true);

    const result = await service.check();
    expect(result.status).toBe('ok');
    expect(result.database.connected).toBe(true);
    expect(result.database.provider).toBe('postgresql');
    expect(result.service).toContain('EquiFlow');
  });

  it('should report status degraded when database probe fails', async () => {
    (prismaService.isHealthy as jest.Mock).mockResolvedValue(false);

    const result = await service.check();
    expect(result.status).toBe('degraded');
    expect(result.database.connected).toBe(false);
  });
});
