import { Test, TestingModule } from '@nestjs/testing';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('ShiftsController', () => {
  let controller: ShiftsController;
  let service: ShiftsService;

  const mockUser: CurrentUserPayload = {
    userId: 'user-cm-1',
    email: 'manager@equiflow.com',
    role: UserRole.CLUB_MANAGER,
    fullName: 'Club Manager',
  };

  const mockService = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: 'shift-1' }),
    create: jest.fn().mockResolvedValue({ id: 'shift-1' }),
    update: jest.fn().mockResolvedValue({ id: 'shift-1' }),
    setStatus: jest.fn().mockResolvedValue({ id: 'shift-1', status: 'INACTIVE' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShiftsController],
      providers: [
        {
          provide: ShiftsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<ShiftsController>(ShiftsController);
    service = module.get<ShiftsService>(ShiftsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate findAll to service', async () => {
    const query = { status: 'ACTIVE' as const };
    const res = await controller.findAll(query);
    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(res).toBeDefined();
  });

  it('should delegate findOne to service', async () => {
    const res = await controller.findOne('shift-1');
    expect(service.findOne).toHaveBeenCalledWith('shift-1');
    expect(res).toBeDefined();
  });

  it('should delegate create to service', async () => {
    const dto = { name: 'Morning Shift', code: 'MS-01', startTime: '06:00', endTime: '14:00' };
    const res = await controller.create(dto, mockUser);
    expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate update to service', async () => {
    const dto = { name: 'Morning Shift Updated', startTime: '06:30', endTime: '14:30' };
    const res = await controller.update('shift-1', dto, mockUser);
    expect(service.update).toHaveBeenCalledWith('shift-1', dto, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate setStatus to service', async () => {
    const dto = { isActive: false };
    const res = await controller.setStatus('shift-1', dto, mockUser);
    expect(service.setStatus).toHaveBeenCalledWith('shift-1', dto, mockUser);
    expect(res).toBeDefined();
  });
});
