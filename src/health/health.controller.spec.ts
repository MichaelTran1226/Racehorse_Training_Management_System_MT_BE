import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService, HealthCheckResult } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  const mockHealthResult: HealthCheckResult = {
    status: 'ok',
    service: 'EquiFlow Racehorse Training Management API',
    version: '0.1.0',
    uptime: 10,
    timestamp: '2026-09-28T00:00:00.000Z',
    database: {
      connected: true,
      provider: 'postgresql',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            check: jest.fn().mockResolvedValue(mockHealthResult),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHealth', () => {
    it('should return health check result with database status', async () => {
      const result = await controller.getHealth();
      expect(result).toEqual(mockHealthResult);
      expect(service.check).toHaveBeenCalled();
      expect(result.status).toBe('ok');
      expect(result.database.connected).toBe(true);
    });
  });
});
