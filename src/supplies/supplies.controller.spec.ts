import { Test, TestingModule } from '@nestjs/testing';
import { SuppliesController } from './supplies.controller';
import { SuppliesService } from './supplies.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { SupplyCategory, SupplyUnit } from '@prisma/client';

describe('SuppliesController', () => {
  let controller: SuppliesController;
  let service: SuppliesService;

  const mockUser: CurrentUserPayload = {
    userId: 'user-cm-1',
    email: 'manager@equiflow.com',
    role: UserRole.CLUB_MANAGER,
    fullName: 'Club Manager',
  };

  const mockService = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: 'supply-1' }),
    create: jest.fn().mockResolvedValue({ id: 'supply-1' }),
    update: jest.fn().mockResolvedValue({ id: 'supply-1' }),
    setStatus: jest.fn().mockResolvedValue({ id: 'supply-1', status: 'INACTIVE' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuppliesController],
      providers: [
        {
          provide: SuppliesService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<SuppliesController>(SuppliesController);
    service = module.get<SuppliesService>(SuppliesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate findAll to service', async () => {
    const query = { status: 'ACTIVE' as const };
    const res = await controller.findAll(query, mockUser);
    expect(service.findAll).toHaveBeenCalledWith(query, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate findOne to service', async () => {
    const res = await controller.findOne('supply-1', mockUser);
    expect(service.findOne).toHaveBeenCalledWith('supply-1', mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate create to service', async () => {
    const dto = {
      name: 'Timothy Hay Premium',
      code: 'HAY-01',
      category: SupplyCategory.FEED_HAY,
      unit: SupplyUnit.KG,
    };
    const res = await controller.create(dto, mockUser);
    expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate update to service', async () => {
    const dto = { name: 'Timothy Hay Gold' };
    const res = await controller.update('supply-1', dto, mockUser);
    expect(service.update).toHaveBeenCalledWith('supply-1', dto, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate setStatus to service', async () => {
    const dto = { isActive: false };
    const res = await controller.setStatus('supply-1', dto, mockUser);
    expect(service.setStatus).toHaveBeenCalledWith('supply-1', dto, mockUser);
    expect(res).toBeDefined();
  });
});
