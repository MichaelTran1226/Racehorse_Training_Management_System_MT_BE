import { Test, TestingModule } from '@nestjs/testing';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { IncidentStatus, SeverityLevel } from '@prisma/client';

describe('IncidentsController', () => {
  let controller: IncidentsController;
  let service: IncidentsService;

  const mockUser: CurrentUserPayload = {
    userId: 'user-vet-1',
    email: 'vet@equiflow.com',
    role: UserRole.VETERINARIAN,
    fullName: 'Dr. Sarah',
  };

  const mockService = {
    create: jest.fn().mockResolvedValue({ id: 'inc-1', code: 'INC-20261018-001' }),
    findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    findOne: jest.fn().mockResolvedValue({ id: 'inc-1', code: 'INC-20261018-001' }),
    review: jest.fn().mockResolvedValue({ id: 'inc-1', status: IncidentStatus.UNDER_REVIEW }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IncidentsController],
      providers: [
        {
          provide: IncidentsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<IncidentsController>(IncidentsController);
    service = module.get<IncidentsService>(IncidentsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate create to service', async () => {
    const dto = {
      horseId: 'horse-1',
      severity: SeverityLevel.MODERATE,
      symptoms: ['FEVER'],
      description: 'High temperature detected',
    };
    const res = await controller.create(dto, mockUser);
    expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    expect(res).toBeDefined();
  });

  it('should delegate findAll to service', async () => {
    const query = { status: IncidentStatus.REPORTED };
    const res = await controller.findAll(query);
    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(res).toBeDefined();
  });

  it('should delegate findOne to service', async () => {
    const res = await controller.findOne('inc-1');
    expect(service.findOne).toHaveBeenCalledWith('inc-1');
    expect(res).toBeDefined();
  });

  it('should delegate review to service', async () => {
    const dto = { status: IncidentStatus.UNDER_REVIEW, actionTaken: 'Gave medication' };
    const res = await controller.review('inc-1', dto, mockUser);
    expect(service.review).toHaveBeenCalledWith('inc-1', dto, mockUser);
    expect(res).toBeDefined();
  });
});
