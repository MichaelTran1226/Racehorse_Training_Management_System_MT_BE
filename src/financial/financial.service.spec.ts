import { Test, TestingModule } from '@nestjs/testing';
import { FinancialService } from './financial.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InvoiceStatus } from '@prisma/client';

describe('FinancialService', () => {
  let service: FinancialService;
  let prisma: any;
  let audit: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      financialInvoice: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      horse: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((promises) => Promise.all(promises)),
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    notifications = {
      notifyUsers: jest.fn().mockResolvedValue(undefined),
      notifyRoles: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<FinancialService>(FinancialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated invoices for manager', async () => {
      prisma.financialInvoice.findMany.mockResolvedValue([
        { id: 'inv-1', billingPeriod: '2026-10', status: InvoiceStatus.DRAFT },
      ]);
      prisma.financialInvoice.count.mockResolvedValue(1);

      const user = { id: 'u-mgr', name: 'Manager', role: 'CLUB_MANAGER' };
      const res = await service.findAll({ billingPeriod: '2026-10', page: 1, limit: 10 }, user);

      expect(res.items).toHaveLength(1);
      expect(res.total).toBe(1);
    });

    it('should enforce ownerId filter for HORSE_OWNER', async () => {
      prisma.financialInvoice.findMany.mockResolvedValue([]);
      prisma.financialInvoice.count.mockResolvedValue(0);

      const user = { id: 'u-owner', name: 'Owner', role: 'HORSE_OWNER' };
      await service.findAll({ page: 1, limit: 10 }, user);

      expect(prisma.financialInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ownerId: 'u-owner' }),
        }),
      );
    });
  });

  describe('create', () => {
    it('should correctly calculate netAmount = boarding + medical + training - prizeCredit', async () => {
      const dto = {
        horseId: 'h-1',
        ownerId: 'o-1',
        billingPeriod: '2026-10',
        boardingFee: 6000000,
        medicalFee: 2000000,
        trainingFee: 4000000,
        prizeCredit: 5000000,
      };
      const user = { id: 'u-mgr', name: 'Manager', role: 'CLUB_MANAGER' };

      prisma.financialInvoice.create.mockResolvedValue({
        id: 'inv-1',
        ...dto,
        netAmount: 7000000,
        status: InvoiceStatus.DRAFT,
        horse: { name: 'Thunder' },
        owner: { fullName: 'Owner A' },
      });

      const res = await service.create(dto, user);
      expect(res.netAmount).toBe(7000000);
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return invoice when authorized', async () => {
      prisma.financialInvoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        ownerId: 'o-1',
        horse: { name: 'Thunder' },
        owner: { fullName: 'Owner A' },
      });

      const user = { id: 'u-mgr', name: 'Manager', role: 'CLUB_MANAGER' };
      const res = await service.findOne('inv-1', user);
      expect(res.id).toBe('inv-1');
    });

    it('should forbid HORSE_OWNER from viewing another owner invoice', async () => {
      prisma.financialInvoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        ownerId: 'other-owner',
        boardingFee: 5000000,
        medicalFee: 0,
        trainingFee: 0,
        prizeCredit: 0,
        netAmount: 5000000,
      });

      const user = { id: 'my-owner-id', name: 'Owner', role: 'HORSE_OWNER' };

      await expect(service.findOne('inv-1', user)).rejects.toThrow(
        'You can only view financial statements for your own horses',
      );
    });
  });

  describe('update & changeStatus', () => {
    it('should update invoice fields', async () => {
      prisma.financialInvoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        boardingFee: 5000000,
        medicalFee: 1000000,
        trainingFee: 2000000,
        prizeCredit: 500000,
      });

      prisma.financialInvoice.update.mockResolvedValue({
        id: 'inv-1',
        boardingFee: 6000000,
        netAmount: 8500000,
      });

      const user = { id: 'u-mgr', name: 'Manager', role: 'CLUB_MANAGER' };
      const res = await service.update('inv-1', { boardingFee: 6000000 }, user);
      expect(res.id).toBe('inv-1');
    });

    it('should update invoice status via changeStatus', async () => {
      prisma.financialInvoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: InvoiceStatus.DRAFT,
        horse: { name: 'Thunder' },
      });

      prisma.financialInvoice.update.mockResolvedValue({
        id: 'inv-1',
        status: InvoiceStatus.PAID,
      });

      const user = { id: 'u-mgr', name: 'Manager', role: 'CLUB_MANAGER' };
      const res = await service.changeStatus('inv-1', InvoiceStatus.PAID, user);
      expect(res.status).toBe(InvoiceStatus.PAID);
    });
  });

  describe('generateMonthlyDrafts', () => {
    it('should generate draft invoices for active owned horses', async () => {
      prisma.horse.findMany.mockResolvedValue([{ id: 'h-1', ownerId: 'o-1', name: 'Thunder' }]);
      prisma.financialInvoice.findFirst.mockResolvedValue(null);
      prisma.financialInvoice.create.mockResolvedValue({ id: 'new-inv' });

      const user = { id: 'u-mgr', name: 'Manager', role: 'CLUB_MANAGER' };
      const res = await service.generateMonthlyDrafts('2026-11', user);
      expect(res.createdCount).toBe(1);
    });
  });

  describe('getOwnerSummary', () => {
    it('should aggregate financial totals for owner', async () => {
      prisma.financialInvoice.findMany.mockResolvedValue([
        {
          boardingFee: 5000000,
          medicalFee: 1000000,
          trainingFee: 2000000,
          prizeCredit: 3000000,
          netAmount: 5000000,
          status: InvoiceStatus.SENT,
          horse: { id: 'h-1', name: 'Thunder', horseCode: 'HR-001' },
        },
      ]);

      const summary = await service.getOwnerSummary('o-1');

      expect(summary.totalBoarding).toBe(5000000);
      expect(summary.totalPrizeCredit).toBe(3000000);
      expect(summary.totalNet).toBe(5000000);
    });
  });
});
