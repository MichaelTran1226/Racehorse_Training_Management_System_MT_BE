import { ShiftsService } from './shifts.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('ShiftsService (SC-4.11)', () => {
  let prisma: any;
  let audit: { record: jest.Mock };
  let service: ShiftsService;

  const managerUser: CurrentUserPayload = {
    userId: 'cm-1',
    email: 'cm@gmail.com',
    fullName: 'Club Manager',
    role: UserRole.CLUB_MANAGER,
  };

  const sampleShift = {
    id: 'shift-1',
    code: 'SHIFT_MORNING',
    name: 'Ca Sáng (05:00 - 13:00)',
    startTime: '05:00',
    endTime: '13:00',
    isOvernight: false,
    sortOrder: 1,
    description: 'Ca sáng',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      shiftCatalog: {
        findMany: jest.fn().mockResolvedValue([sampleShift]),
        findUnique: jest.fn().mockResolvedValue(sampleShift),
        create: jest.fn(({ data }) => Promise.resolve({ id: 'shift-2', ...data })),
        update: jest.fn(({ data }) => Promise.resolve({ ...sampleShift, ...data })),
      },
      shiftRoster: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ShiftsService(prisma, audit as any);
  });

  describe('create', () => {
    it('calculates isOvernight = true when endTime < startTime', async () => {
      prisma.shiftCatalog.findUnique.mockResolvedValue(null);

      const created = await service.create(
        {
          code: 'SHIFT_NIGHT',
          name: 'Ca Đêm',
          startTime: '21:00',
          endTime: '05:00',
        },
        managerUser,
      );

      expect(created.isOvernight).toBe(true);
      expect(prisma.shiftCatalog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isOvernight: true,
          }),
        }),
      );
    });

    it('rejects shift with duration under 2 hours', async () => {
      prisma.shiftCatalog.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            code: 'SHIFT_SHORT',
            name: 'Ca Quá Ngắn',
            startTime: '08:00',
            endTime: '09:00',
          },
          managerUser,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SHIFT_DURATION_INVALID' }),
      });
    });

    it('rejects duplicate shift code', async () => {
      prisma.shiftCatalog.findUnique.mockResolvedValueOnce(sampleShift);

      await expect(
        service.create(
          {
            code: 'SHIFT_MORNING',
            name: 'Tên khác',
            startTime: '06:00',
            endTime: '14:00',
          },
          managerUser,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SHIFT_CODE_ALREADY_EXISTS' }),
      });
    });
  });

  describe('setStatus', () => {
    it('blocks deactivating shift if there are active future rosters', async () => {
      prisma.shiftRoster.count.mockResolvedValueOnce(3);

      await expect(
        service.setStatus('shift-1', { isActive: false }, managerUser),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SHIFT_HAS_FUTURE_ROSTERS' }),
      });
    });

    it('allows deactivating shift if no active future rosters exist', async () => {
      prisma.shiftRoster.count.mockResolvedValueOnce(0);

      const res = await service.setStatus('shift-1', { isActive: false }, managerUser);
      expect(res.isActive).toBe(false);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cm-1' }),
        'SHIFT_CATALOG_DEACTIVATED',
        expect.any(String),
        'shift-1',
        expect.objectContaining({ entityName: 'ShiftCatalog' }),
      );
    });
  });
});
