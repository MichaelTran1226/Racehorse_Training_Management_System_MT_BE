import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return boolean for isHealthy check', async () => {
    jest.spyOn(service, '$queryRaw').mockResolvedValue([{ 1: 1 }] as any);
    const healthy = await service.isHealthy();
    expect(typeof healthy).toBe('boolean');
    expect(healthy).toBe(true);
  });

  it('should return false if queryRaw throws', async () => {
    jest.spyOn(service, '$queryRaw').mockRejectedValue(new Error('Connection failed'));
    const healthy = await service.isHealthy();
    expect(healthy).toBe(false);
  });
});
