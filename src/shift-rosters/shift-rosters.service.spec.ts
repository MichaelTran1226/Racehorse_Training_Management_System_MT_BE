import { ShiftRostersService } from './shift-rosters.service';
import { Role, UserStatus } from '@prisma/client';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('ShiftRostersService (SC-4.01)', () => {
  let prisma: any;
  let audit: { record: jest.Mock };
  let service: ShiftRostersService;

  const managerUser: CurrentUserPayload = {
    userId: 'cm-1',
    email: 'cm@gmail.com',
    fullName: 'Club Manager',
    role: 'CLUB_MANAGER',
  };

  const groomUser: CurrentUserPayload = {
    userId: 'groom-1',
    email: 'groom@gmail.com',
    fullName: 'John Groom',
    role: 'GROOM',
  };

  const sampleShift = {
    id: 'shift-1',
    code: 'SHIFT_MORNING',
    name: 'Ca Sáng',
    isActive: true,
  };

  const sampleZone = {
    id: 'zone-1',
    code: 'ZONE_A',
    name: 'Zone A',
    isActive: true,
    stalls: [],
  };

  const sampleRoster = {
    id: 'roster-1',
    date: new Date('2026-10-19T00:00:00.000Z'),
    shiftId: 'shift-1',
    zoneId: 'zone-1',
    groomUserId: 'groom-1',
    notes: 'Sample note',
    shift: sampleShift,
    zone: sampleZone,
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((cb) => cb(prisma)),
      shiftCatalog: {
        findUnique: jest.fn().mockResolvedValue(sampleShift),
      },
      stallZone: {
        findUnique: jest.fn().mockResolvedValue(sampleZone),
      },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'groom-1', role: Role.GROOM, status: UserStatus.ACTIVE }]),
      },
      shiftRoster: {
        findMany: jest.fn().mockResolvedValue([sampleRoster]),
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue(sampleRoster),
        delete: jest.fn().mockResolvedValue(sampleRoster),
      },
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ShiftRostersService(prisma, audit as any);
  });

  describe('assignSlot', () => {
    it('assigns grooms to slot with ONLY_THIS_DAY', async () => {
      const res = await service.assignSlot(
        {
          date: '2026-10-19',
          shiftId: 'shift-1',
          zoneId: 'zone-1',
          groomUserIds: ['groom-1'],
          applyScope: 'ONLY_THIS_DAY',
        },
        managerUser,
      );

      expect(res.success).toBe(true);
      expect(res.affectedDatesCount).toBe(1);
      expect(prisma.shiftRoster.deleteMany).toHaveBeenCalled();
      expect(prisma.shiftRoster.createMany).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cm-1' }),
        'SHIFT_ROSTER_ASSIGNED',
        expect.any(String),
        null,
        expect.objectContaining({ entityName: 'ShiftRoster' }),
      );
    });

    it('rejects if an inactive groom is selected', async () => {
      prisma.user.findMany.mockResolvedValueOnce([]); // no active groom found

      await expect(
        service.assignSlot(
          {
            date: '2026-10-19',
            shiftId: 'shift-1',
            zoneId: 'zone-1',
            groomUserIds: ['groom-1'],
          },
          managerUser,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_GROOMS_SELECTED' }),
      });
    });
  });

  describe('copyWeek', () => {
    it('blocks copying into a target week that is in the past', async () => {
      await expect(
        service.copyWeek(
          {
            sourceWeekStart: '2026-10-05',
            targetWeekStart: '2020-01-06', // way in the past
          },
          managerUser,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'COPY_TARGET_WEEK_IN_PAST' }),
      });
    });

    it('successfully copies week and skips inactive grooms', async () => {
      // Future week
      const futureMonday = '2099-10-12';
      const sourceMonday = '2099-10-05';

      prisma.shiftRoster.findMany.mockResolvedValueOnce([
        {
          id: 'r-1',
          date: new Date('2099-10-05T00:00:00.000Z'),
          shiftId: 'shift-1',
          zoneId: 'zone-1',
          groomUserId: 'groom-1',
          notes: null,
        },
        {
          id: 'r-2',
          date: new Date('2099-10-06T00:00:00.000Z'),
          shiftId: 'shift-1',
          zoneId: 'zone-1',
          groomUserId: 'groom-inactive',
          notes: null,
        },
      ]);

      // Only groom-1 is active
      prisma.user.findMany.mockResolvedValueOnce([{ id: 'groom-1' }]);

      const result = await service.copyWeek(
        {
          sourceWeekStart: sourceMonday,
          targetWeekStart: futureMonday,
          overwrite: false,
        },
        managerUser,
      );

      expect(result.copiedCount).toBe(1);
      expect(result.skippedInactiveGrooms).toBe(1);
    });
  });

  describe('getMyShifts', () => {
    it('queries shifts specifically for current groom', async () => {
      const myShifts = await service.getMyShifts(groomUser, {
        startDate: '2026-10-19',
        endDate: '2026-10-25',
      });

      expect(myShifts).toHaveLength(1);
      expect(myShifts[0].zone.name).toBe('Zone A');
    });
  });
});
