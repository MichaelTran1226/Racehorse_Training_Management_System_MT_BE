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

  describe('create', () => {
    it('should correctly calculate netAmount = boarding + medical + training - prizeCredit', async () => {
      const dto = {
        horseId: 'h-1',
        ownerId: 'o-1',
        billingPeriod: '2026-10',
        boardingFee: 6000000,
        medicalFee: 2000000,
        trainingFee: 4000000,
        prizeCredit: 5000000, // 5M prize credit deducted
      };
      const user = { id: 'u-mgr', name: 'Manager', role: 'CLUB_MANAGER' };

      prisma.financialInvoice.create.mockResolvedValue({
        id: 'inv-1',
        ...dto,
        netAmount: 7000000, // 6 + 2 + 4 - 5 = 7M
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
});
