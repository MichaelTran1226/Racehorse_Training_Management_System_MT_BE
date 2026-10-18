import { Test, TestingModule } from '@nestjs/testing';
import { ShiftRostersController } from './shift-rosters.controller';
import { ShiftRostersService } from './shift-rosters.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('ShiftRostersController', () => {
  let controller: ShiftRostersController;
  let service: ShiftRostersService;

  const mockUser: CurrentUserPayload = {
    userId: 'user-cm-1',
    email: 'manager@equiflow.com',
    role: UserRole.CLUB_MANAGER,
    fullName: 'Club Manager',
  };

  const mockService = {
    findAll: jest.fn().mockResolvedValue({ items: [], matrix: {} }),
    getMyShifts: jest.fn().mockResolvedValue([]),
    assignSlot: jest.fn().mockResolvedValue({ id: 'roster-1' }),
    delete: jest.fn().mockResolvedValue({ success: true }),
    copyWeek: jest.fn().mockResolvedValue({ copiedCount: 14 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShiftRostersController],
      providers: [
        {
          provide: ShiftRostersService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<ShiftRostersController>(ShiftRostersController);
    service = module.get<ShiftRostersService>(ShiftRostersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate findAll to service', async () => {
    const query = { startDate: '2026-10-18', endDate: '2026-10-24' };
    const res = await controller.findAll(query);
    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(res).toBeDefined();
  });

  it('should delegate getMyShifts to service', async () => {
    const query = { startDate: '2026-10-18', endDate: '2026-10-24' };
    const res = await controller.getMyShifts(mockUser, query);
    expect(service.getMyShifts).toHaveBeenCalledWith(mockUser, query);
    expect(res).toBeDefined();
  });

  it('should delegate assignSlot to service', async () => {
    const dto = { shiftId: 's1', groomUserIds: ['g1'], date: '2026-10-18', zoneId: 'z1' };
    const res = await controller.assignSlot(dto, mockUser);
    expect(service.assignSlot).toHaveBeenCalledWith(dto, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate delete to service', async () => {
    const res = await controller.delete('roster-1', mockUser);
    expect(service.delete).toHaveBeenCalledWith('roster-1', mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate copyWeek to service', async () => {
    const dto = { sourceWeekStart: '2026-10-12', targetWeekStart: '2026-10-19', overwrite: true };
    const res = await controller.copyWeek(dto, mockUser);
    expect(service.copyWeek).toHaveBeenCalledWith(dto, mockUser);
    expect(res).toBeDefined();
  });
});
