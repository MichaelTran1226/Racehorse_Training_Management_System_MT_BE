import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, RestockStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryService } from './inventory.service';
import { UserRole } from '../common/enums/role.enum';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: any;
  let auditService: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      stallZone: { findMany: jest.fn(), findUnique: jest.fn() },
      supplyCatalog: { findMany: jest.fn(), findUnique: jest.fn() },
      stockBalance: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      restockRequest: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((callbackOrPromises) => {
        if (Array.isArray(callbackOrPromises)) {
          return Promise.all(callbackOrPromises);
        }
        return callbackOrPromises(prisma);
      }),
    };

    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    notifications = {
      notifyRoles: jest.fn().mockResolvedValue(undefined),
      notifyUsers: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  describe('findAllStock (SC-4.06)', () => {
    it('returns calculated stock health status correctly', async () => {
      prisma.stallZone.findMany.mockResolvedValue([
        { id: 'zone-1', code: 'ZA', name: 'Zone A', sortOrder: 1 },
      ]);
      prisma.supplyCatalog.findMany.mockResolvedValue([
        { id: 'sup-1', code: 'OAT', name: 'Oats', category: 'FEED_GRAIN', unit: 'KG' },
        { id: 'sup-2', code: 'HAY', name: 'Hay', category: 'FEED_HAY', unit: 'KG' },
      ]);
      prisma.stockBalance.findMany.mockResolvedValue([
        {
          id: 'sb-1',
          zoneId: 'zone-1',
          supplyId: 'sup-1',
          quantity: new Prisma.Decimal(50),
          minThreshold: new Prisma.Decimal(10),
          lastInventoryDate: new Date(),
          lastAdjustedBy: { id: 'u1', fullName: 'Manager', role: 'CLUB_MANAGER' },
          notes: 'Regular check',
        },
        {
          id: 'sb-2',
          zoneId: 'zone-1',
          supplyId: 'sup-2',
          quantity: new Prisma.Decimal(5),
          minThreshold: new Prisma.Decimal(20),
          lastInventoryDate: new Date(),
          lastAdjustedBy: null,
          notes: null,
        },
      ]);

      const result = await service.findAllStock({});
      expect(result.items).toHaveLength(2);
      expect(result.items[0].status).toBe('SUFFICIENT');
      expect(result.items[1].status).toBe('LOW_STOCK');
      expect(result.lowStockCount).toBe(1);
      expect(result.outOfStockCount).toBe(0);
    });
  });

  describe('adjustStock (DL-4.06)', () => {
    it('allows CLUB_MANAGER to adjust physical stock count with audit trail', async () => {
      const currentUser = {
        userId: 'mgr-1',
        email: 'manager@equiflow.com',
        fullName: 'Quản Lý Chuồng',
        role: UserRole.CLUB_MANAGER,
        status: 'ACTIVE',
      };

      prisma.stallZone.findUnique.mockResolvedValue({ id: 'zone-1', code: 'ZA', name: 'Zone A' });
      prisma.supplyCatalog.findUnique.mockResolvedValue({
        id: 'sup-1',
        code: 'OAT',
        name: 'Oats',
        unit: 'KG',
      });
      prisma.stockBalance.findUnique.mockResolvedValue({
        id: 'sb-1',
        zoneId: 'zone-1',
        supplyId: 'sup-1',
        quantity: new Prisma.Decimal(20),
        minThreshold: new Prisma.Decimal(10),
      });

      prisma.stockBalance.upsert.mockResolvedValue({
        id: 'sb-1',
        zoneId: 'zone-1',
        supplyId: 'sup-1',
        quantity: new Prisma.Decimal(35),
        minThreshold: new Prisma.Decimal(10),
        lastInventoryDate: new Date(),
        lastAdjustedById: 'mgr-1',
        notes: 'Cân thực tế đầu tuần',
        zone: { id: 'zone-1', code: 'ZA', name: 'Zone A' },
        supply: { id: 'sup-1', code: 'OAT', name: 'Oats', unit: 'KG' },
        lastAdjustedBy: { id: 'mgr-1', fullName: 'Quản Lý Chuồng', role: 'CLUB_MANAGER' },
      });

      const adjusted = await service.adjustStock(
        {
          zoneId: 'zone-1',
          supplyId: 'sup-1',
          actualQuantity: 35,
          reason: 'Cân thực tế đầu tuần',
        },
        currentUser,
      );

      expect(adjusted.quantity).toBe(35);
      expect(auditService.record).toHaveBeenCalled();
    });
  });

  describe('createRestockRequest & review & deliver (SC-4.07)', () => {
    it('handles complete proposal lifecycle: create -> approve -> deliver', async () => {
      const groomUser = {
        userId: 'groom-1',
        email: 'groom@equiflow.com',
        fullName: 'Lê Groom',
        role: UserRole.GROOM,
        status: 'ACTIVE',
      };

      const managerUser = {
        userId: 'mgr-1',
        email: 'manager@equiflow.com',
        fullName: 'Trần Quản Lý',
        role: UserRole.CLUB_MANAGER,
        status: 'ACTIVE',
      };

      prisma.stallZone.findUnique.mockResolvedValue({ id: 'zone-1', code: 'ZA', name: 'Zone A' });
      prisma.supplyCatalog.findUnique.mockResolvedValue({
        id: 'sup-1',
        code: 'OAT',
        name: 'Oats',
        category: 'FEED_GRAIN',
        unit: 'KG',
      });
      prisma.restockRequest.count.mockResolvedValue(0);

      prisma.restockRequest.create.mockResolvedValue({
        id: 'req-1',
        requestNumber: 'REQ-2610-0001',
        zoneId: 'zone-1',
        supplyId: 'sup-1',
        requestedQuantity: new Prisma.Decimal(50),
        status: RestockStatus.PENDING,
        urgencyReason: 'Hết hàng sáng mai',
        requestedById: 'groom-1',
        zone: { id: 'zone-1', code: 'ZA', name: 'Zone A' },
        supply: { id: 'sup-1', code: 'OAT', name: 'Oats', category: 'FEED_GRAIN', unit: 'KG' },
        requestedBy: { id: 'groom-1', fullName: 'Lê Groom', role: 'GROOM' },
      });

      // 1. Create
      const created = await service.createRestockRequest(
        {
          zoneId: 'zone-1',
          supplyId: 'sup-1',
          requestedQuantity: 50,
          urgencyReason: 'Hết hàng sáng mai',
        },
        groomUser,
      );
      expect(created.requestNumber).toBe('REQ-2610-0001');
      expect(notifications.notifyRoles).toHaveBeenCalled();

      // 2. Review (Approve)
      prisma.restockRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        requestNumber: 'REQ-2610-0001',
        zoneId: 'zone-1',
        supplyId: 'sup-1',
        requestedQuantity: new Prisma.Decimal(50),
        status: RestockStatus.PENDING,
        requestedById: 'groom-1',
        zone: { id: 'zone-1', code: 'ZA', name: 'Zone A' },
        supply: { id: 'sup-1', code: 'OAT', name: 'Oats', unit: 'KG' },
      });

      prisma.restockRequest.update.mockResolvedValue({
        id: 'req-1',
        requestNumber: 'REQ-2610-0001',
        zoneId: 'zone-1',
        supplyId: 'sup-1',
        requestedQuantity: new Prisma.Decimal(50),
        approvedQuantity: new Prisma.Decimal(50),
        status: RestockStatus.APPROVED,
        requestedById: 'groom-1',
        zone: { id: 'zone-1', code: 'ZA', name: 'Zone A' },
        supply: { id: 'sup-1', code: 'OAT', name: 'Oats', unit: 'KG' },
        requestedBy: { id: 'groom-1', fullName: 'Lê Groom', role: 'GROOM' },
      });

      const approved = await service.reviewRestockRequest(
        'req-1',
        { action: 'APPROVE', approvedQuantity: 50 },
        managerUser,
      );
      expect(approved.status).toBe(RestockStatus.APPROVED);
      expect(notifications.notifyUsers).toHaveBeenCalled();

      // 3. Deliver (Confirm receipt and auto-increment stock)
      prisma.restockRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        requestNumber: 'REQ-2610-0001',
        zoneId: 'zone-1',
        supplyId: 'sup-1',
        requestedQuantity: new Prisma.Decimal(50),
        approvedQuantity: new Prisma.Decimal(50),
        status: RestockStatus.APPROVED,
        requestedById: 'groom-1',
        zone: { id: 'zone-1', code: 'ZA', name: 'Zone A' },
        supply: { id: 'sup-1', code: 'OAT', name: 'Oats', unit: 'KG' },
      });

      prisma.restockRequest.update.mockResolvedValue({
        id: 'req-1',
        requestNumber: 'REQ-2610-0001',
        zoneId: 'zone-1',
        supplyId: 'sup-1',
        requestedQuantity: new Prisma.Decimal(50),
        approvedQuantity: new Prisma.Decimal(50),
        status: RestockStatus.DELIVERED,
        requestedById: 'groom-1',
        zone: { id: 'zone-1', code: 'ZA', name: 'Zone A' },
        supply: { id: 'sup-1', code: 'OAT', name: 'Oats', unit: 'KG' },
        requestedBy: { id: 'groom-1', fullName: 'Lê Groom', role: 'GROOM' },
        reviewedBy: { id: 'mgr-1', fullName: 'Trần Quản Lý', role: 'CLUB_MANAGER' },
        deliveredBy: { id: 'mgr-1', fullName: 'Trần Quản Lý', role: 'CLUB_MANAGER' },
      });

      prisma.stockBalance.upsert.mockResolvedValue({
        id: 'sb-1',
        quantity: new Prisma.Decimal(100),
      });

      const delivered = await service.deliverRestockRequest(
        'req-1',
        { receivedQuantity: 50, deliveryNotes: 'Đã nhận đủ' },
        managerUser,
      );
      expect(delivered.status).toBe(RestockStatus.DELIVERED);
      expect(prisma.stockBalance.upsert).toHaveBeenCalled();
    });
  });
});
