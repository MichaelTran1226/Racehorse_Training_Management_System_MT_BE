import { HttpStatus } from '@nestjs/common';
import { StallStatus } from '@prisma/client';
import { StallsService } from './stalls.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('StallsService (SC-1.04, SC-1.07, DL-1.02, DL-1.03)', () => {
  let prisma: any;
  let audit: { record: jest.Mock };
  let service: StallsService;
  const manager: CurrentUserPayload = {
    userId: 'cm-1',
    email: 'cm@gmail.com',
    fullName: 'Manager',
    role: UserRole.CLUB_MANAGER,
  };
  const zone = { id: 'z-1', code: 'A', name: 'Khu A', rows: 2, cols: 3, isActive: true };
  const freeStall = {
    id: 's-1',
    code: 'A-01',
    zone: 'Khu A',
    zoneId: 'z-1',
    row: 1,
    col: 1,
    status: StallStatus.AVAILABLE,
    notes: null,
    zoneRef: zone,
    allocations: [],
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([]),
      stallZone: {
        findUnique: jest.fn().mockResolvedValue(zone),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(({ data }) => Promise.resolve({ id: 'z-new', ...data })),
        update: jest.fn(({ data }) => Promise.resolve({ ...zone, ...data })),
      },
      stall: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }) => Promise.resolve({ id: 's-new', ...data })),
        createMany: jest.fn().mockResolvedValue({ count: 6 }),
        update: jest.fn(({ data }) => Promise.resolve({ ...freeStall, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        aggregate: jest.fn().mockResolvedValue({ _max: { row: 2, col: 3 } }),
      },
      stallAllocation: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        create: jest.fn(({ data }) => Promise.resolve({ id: 'al-1', ...data })),
        update: jest.fn(),
      },
      horse: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    audit = { record: jest.fn() };
    service = new StallsService(prisma, audit as any);
  });

  describe('zones', () => {
    it('creates a whole grid of stalls named {zone}-{nn} when asked', async () => {
      await service.createZone(
        { code: 'B', name: 'Khu B', rows: 2, cols: 3, autoCreateStalls: true },
        manager,
      );
      const { data } = prisma.stall.createMany.mock.calls[0][0];
      expect(data).toHaveLength(6);
      expect(data[0]).toMatchObject({ code: 'B-01', row: 1, col: 1 });
      expect(data[5]).toMatchObject({ code: 'B-06', row: 2, col: 3 });
    });

    it('does not shrink the grid below a row already used by a stall', async () => {
      await expect(service.updateZone('z-1', { rows: 1 }, manager)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ZONE_ROWS_TOO_SMALL' }),
      });
    });

    it('refuses to deactivate a zone that still houses horses', async () => {
      prisma.stallAllocation.count.mockResolvedValue(2);
      await expect(
        service.setZoneStatus('z-1', { isActive: false }, manager),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: expect.objectContaining({ code: 'ZONE_HAS_HORSES' }),
      });
    });

    it('turns legacy zone names into zones with grid positions', async () => {
      prisma.stall.findMany.mockResolvedValueOnce([
        { id: 'o-1', code: 'X-01', zone: 'Zone A - Barn 1' },
        { id: 'o-2', code: 'X-02', zone: 'Zone A - Barn 1' },
      ]);
      prisma.stallZone.findUnique.mockResolvedValue(null);
      await service.ensureZones();
      expect(prisma.stallZone.create).toHaveBeenCalledWith({
        data: { code: 'ZONE-A-BARN-1', name: 'Zone A - Barn 1', cols: 2, rows: 1 },
      });
      expect(prisma.stall.update).toHaveBeenCalledWith({
        where: { id: 'o-2' },
        data: { zoneId: 'z-new', row: 1, col: 2 },
      });
    });
  });

  describe('stalls', () => {
    it('rejects a position outside the zone grid', async () => {
      await expect(
        service.create({ zoneId: 'z-1', code: 'A-09', row: 3, col: 1 }, manager),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ROW_OUT_OF_RANGE' }) });
    });

    it('rejects a position already taken by another stall', async () => {
      prisma.stall.findFirst.mockResolvedValue({ id: 's-2', code: 'A-02' });
      await expect(
        service.create({ zoneId: 'z-1', code: 'A-09', row: 1, col: 2 }, manager),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'POSITION_TAKEN' }) });
    });

    it('an occupied stall cannot go to maintenance or inactive (Q-1.C)', async () => {
      prisma.stall.findUnique.mockResolvedValue({
        ...freeStall,
        status: StallStatus.OCCUPIED,
        allocations: [{ horse: { name: 'Thunderbolt' } }],
      });
      await expect(service.setStatus('s-1', { status: 'INACTIVE' }, manager)).rejects.toMatchObject(
        {
          response: expect.objectContaining({ code: 'STALL_OCCUPIED' }),
        },
      );
    });

    it('"Available" keeps an occupied stall OCCUPIED', async () => {
      prisma.stall.findUnique.mockResolvedValue({
        ...freeStall,
        status: StallStatus.OCCUPIED,
        allocations: [{ horse: { name: 'Thunderbolt' } }],
      });
      await service.setStatus('s-1', { status: 'AVAILABLE' }, manager);
      expect(prisma.stall.update.mock.calls[0][0].data.status).toBe(StallStatus.OCCUPIED);
    });
  });

  describe('assign / transfer', () => {
    it('cannot assign into an inactive stall', async () => {
      prisma.stall.findUnique.mockResolvedValue({ ...freeStall, status: StallStatus.INACTIVE });
      await expect(service.assignHorse('s-1', { horseId: 'h-1' }, manager)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STALL_UNAVAILABLE' }),
      });
    });

    it('tells the user to use Transfer when the horse already has a stall', async () => {
      prisma.stall.findUnique.mockResolvedValue(freeStall);
      prisma.horse.findUnique.mockResolvedValue({
        id: 'h-1',
        name: 'Thunderbolt',
        status: 'RESTING',
        stallAllocations: [{ stall: { code: 'B-02' } }],
      });
      await expect(service.assignHorse('s-1', { horseId: 'h-1' }, manager)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: expect.objectContaining({ code: 'HORSE_HAS_STALL' }),
      });
    });

    it('rejects a groom who is not an active GROOM', async () => {
      prisma.stall.findUnique.mockResolvedValue(freeStall);
      prisma.horse.findUnique.mockResolvedValue({
        id: 'h-1',
        name: 'Thunderbolt',
        status: 'RESTING',
        stallAllocations: [],
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        role: 'VETERINARIAN',
        status: 'ACTIVE',
      });
      await expect(
        service.assignHorse('s-1', { horseId: 'h-1', assignedGroomUserId: 'u-1' }, manager),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_GROOM' }) });
    });

    it('transfer to the same stall is refused', async () => {
      prisma.stallAllocation.findUnique.mockResolvedValue({
        id: 'al-1',
        isActive: true,
        stallId: 's-1',
        stall: freeStall,
        horse: { name: 'Thunderbolt' },
      });
      await expect(
        service.transferHorse('al-1', { newStallId: 's-1' }, manager),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SAME_STALL' }),
      });
    });
  });
});
