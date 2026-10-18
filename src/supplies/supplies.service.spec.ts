import { SupplyCategory, SupplyUnit, Prisma } from '@prisma/client';
import { SuppliesService } from './supplies.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('SuppliesService (SC-4.10)', () => {
  let prisma: any;
  let audit: { record: jest.Mock };
  let service: SuppliesService;

  const managerUser: CurrentUserPayload = {
    userId: 'cm-1',
    email: 'cm@gmail.com',
    fullName: 'Manager',
    role: UserRole.CLUB_MANAGER,
  };

  const groomUser: CurrentUserPayload = {
    userId: 'groom-1',
    email: 'groom@gmail.com',
    fullName: 'Groom Hand',
    role: UserRole.GROOM,
  };

  const sampleSupply = {
    id: 'sup-1',
    code: 'SUP_HAY_ALFALFA',
    name: 'Cỏ khô Alfalfa',
    category: SupplyCategory.FEED_HAY,
    unit: SupplyUnit.KG,
    unitPrice: new Prisma.Decimal(45000),
    withdrawalDays: null,
    description: 'Thức ăn giàu đạm',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      supplyCatalog: {
        findMany: jest.fn().mockResolvedValue([sampleSupply]),
        findUnique: jest.fn().mockResolvedValue(sampleSupply),
        create: jest.fn(({ data }) => Promise.resolve({ id: 'sup-2', ...data })),
        update: jest.fn(({ data }) => Promise.resolve({ ...sampleSupply, ...data })),
      },
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new SuppliesService(prisma, audit as any);
  });

  describe('Data Masking (Q-4.11)', () => {
    it('returns unitPrice as number for CLUB_MANAGER', async () => {
      const items = await service.findAll({}, managerUser);
      expect(items[0].unitPrice).toBe(45000);
    });

    it('masks unitPrice as null for GROOM / non-CM roles', async () => {
      const items = await service.findAll({}, groomUser);
      expect(items[0].unitPrice).toBeNull();
    });
  });

  describe('create', () => {
    it('rejects duplicate code', async () => {
      prisma.supplyCatalog.findUnique.mockResolvedValueOnce(sampleSupply);

      await expect(
        service.create(
          {
            code: 'SUP_HAY_ALFALFA',
            name: 'Tên khác',
            category: SupplyCategory.FEED_HAY,
            unit: SupplyUnit.KG,
          },
          managerUser,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'SUPPLY_CODE_ALREADY_EXISTS' }),
      });
    });

    it('creates new supply and logs audit trail', async () => {
      prisma.supplyCatalog.findUnique.mockResolvedValue(null);

      const created = await service.create(
        {
          code: 'SUP_NEW',
          name: 'Vật tư mới',
          category: SupplyCategory.TOOL_EQUIPMENT,
          unit: SupplyUnit.SET,
          unitPrice: 100000,
        },
        managerUser,
      );

      expect(created.code).toBe('SUP_NEW');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cm-1' }),
        'SUPPLY_CATALOG_CREATED',
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ entityName: 'SupplyCatalog' }),
      );
    });
  });

  describe('setStatus', () => {
    it('toggles isActive status and records audit', async () => {
      prisma.supplyCatalog.findUnique.mockResolvedValueOnce(sampleSupply);

      const res = await service.setStatus('sup-1', { isActive: false }, managerUser);
      expect(res.isActive).toBe(false);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cm-1' }),
        'SUPPLY_CATALOG_DEACTIVATED',
        expect.any(String),
        'sup-1',
        expect.objectContaining({ entityName: 'SupplyCatalog' }),
      );
    });
  });
});
