import { HttpStatus } from '@nestjs/common';
import { HorseCatalogType } from '@prisma/client';
import { HorseCatalogsService } from './horse-catalogs.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('HorseCatalogsService (SC-1.06)', () => {
  let prisma: any;
  let audit: { record: jest.Mock };
  let service: HorseCatalogsService;
  const manager: CurrentUserPayload = {
    userId: 'cm-1',
    email: 'cm@gmail.com',
    fullName: 'Manager',
    role: UserRole.CLUB_MANAGER,
  };
  const bay = {
    id: 'c-1',
    type: HorseCatalogType.COLOR,
    code: 'BAY',
    name: 'Bay',
    isActive: true,
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
      horseCatalogItem: {
        findMany: jest.fn().mockResolvedValue([bay]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(bay),
        create: jest.fn(({ data }) => Promise.resolve({ id: 'c-2', isActive: true, ...data })),
        update: jest.fn(({ data }) => Promise.resolve({ ...bay, ...data })),
      },
      horse: {
        groupBy: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    audit = { record: jest.fn() };
    service = new HorseCatalogsService(prisma, audit as any);
  });

  it('counts horses using each item (case-insensitive name match)', async () => {
    prisma.horse.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ color: 'bay', _count: { _all: 3 } }]);
    const [item] = await service.findAll({ type: HorseCatalogType.COLOR });
    expect(item.horseCount).toBe(3);
  });

  it('rejects a duplicate code within the same type', async () => {
    prisma.horseCatalogItem.findFirst.mockResolvedValueOnce(bay);
    await expect(
      service.create({ type: HorseCatalogType.COLOR, code: 'BAY', name: 'Bay 2' }, manager),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DUPLICATE_CATALOG_CODE' }),
    });
  });

  it('renaming an item also renames it on every horse using it', async () => {
    await service.update('c-1', { name: 'Bay Brown' }, manager);
    expect(prisma.horse.updateMany).toHaveBeenCalledWith({
      where: { color: { equals: 'Bay', mode: 'insensitive' } },
      data: { color: 'Bay Brown' },
    });
  });

  it('resolveName accepts only active items and returns the stored spelling', async () => {
    prisma.horseCatalogItem.findFirst.mockResolvedValueOnce(bay);
    await expect(service.resolveName(HorseCatalogType.COLOR, 'bay')).resolves.toBe('Bay');

    prisma.horseCatalogItem.findFirst.mockResolvedValueOnce({ ...bay, isActive: false });
    await expect(service.resolveName(HorseCatalogType.COLOR, 'Bay')).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: expect.objectContaining({ code: 'INVALID_COLOR' }),
    });
  });

  it('resolveName keeps the current value of a horse even if the item was deactivated', async () => {
    await expect(
      service.resolveName(HorseCatalogType.BREED, 'Old Breed', 'Old Breed'),
    ).resolves.toBe('Old Breed');
    expect(prisma.horseCatalogItem.findFirst).not.toHaveBeenCalled();
  });
});
