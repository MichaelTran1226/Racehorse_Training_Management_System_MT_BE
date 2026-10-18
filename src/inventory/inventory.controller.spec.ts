import { Test, TestingModule } from '@nestjs/testing';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('InventoryController', () => {
  let controller: InventoryController;
  let service: InventoryService;

  const mockUser: CurrentUserPayload = {
    userId: 'user-cm-1',
    email: 'manager@equiflow.com',
    role: UserRole.CLUB_MANAGER,
    fullName: 'Club Manager',
  };

  const mockService = {
    findAllStock: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    adjustStock: jest.fn().mockResolvedValue({ id: 'stock-1', quantity: 50 }),
    findAllRestockRequests: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    findOneRestockRequest: jest.fn().mockResolvedValue({ id: 'req-1' }),
    createRestockRequest: jest.fn().mockResolvedValue({ id: 'req-1', status: 'PENDING' }),
    reviewRestockRequest: jest.fn().mockResolvedValue({ id: 'req-1', status: 'APPROVED' }),
    deliverRestockRequest: jest.fn().mockResolvedValue({ id: 'req-1', status: 'DELIVERED' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        {
          provide: InventoryService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
    service = module.get<InventoryService>(InventoryService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate findAllStock to service', async () => {
    const query = { zoneId: 'zone-1' };
    const res = await controller.findAllStock(query, mockUser);
    expect(service.findAllStock).toHaveBeenCalledWith(query, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate adjustStock to service', async () => {
    const dto = {
      zoneId: 'zone-1',
      supplyId: 's1',
      actualQuantity: 50,
      reason: 'Physical inventory audit',
    };
    const res = await controller.adjustStock(dto, mockUser);
    expect(service.adjustStock).toHaveBeenCalledWith(dto, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate findAllRestockRequests to service', async () => {
    const query = { zoneId: 'zone-1' };
    const res = await controller.findAllRestockRequests(query, mockUser);
    expect(service.findAllRestockRequests).toHaveBeenCalledWith(query, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate findOneRestockRequest to service', async () => {
    const res = await controller.findOneRestockRequest('req-1');
    expect(service.findOneRestockRequest).toHaveBeenCalledWith('req-1');
    expect(res).toBeDefined();
  });

  it('should delegate createRestockRequest to service', async () => {
    const dto = {
      zoneId: 'zone-1',
      supplyId: 's1',
      requestedQuantity: 20,
      urgencyReason: 'Low stock',
    };
    const res = await controller.createRestockRequest(dto, mockUser);
    expect(service.createRestockRequest).toHaveBeenCalledWith(dto, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate reviewRestockRequest to service', async () => {
    const dto = { action: 'APPROVE' as const, approvedQuantity: 20 };
    const res = await controller.reviewRestockRequest('req-1', dto, mockUser);
    expect(service.reviewRestockRequest).toHaveBeenCalledWith('req-1', dto, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate deliverRestockRequest to service', async () => {
    const dto = { actualReceivedQuantity: 20, deliveryNotes: 'Received in good condition' };
    const res = await controller.deliverRestockRequest('req-1', dto, mockUser);
    expect(service.deliverRestockRequest).toHaveBeenCalledWith('req-1', dto, mockUser);
    expect(res).toBeDefined();
  });
});
