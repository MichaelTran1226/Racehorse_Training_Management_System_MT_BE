import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CounterService } from './counter.service';
import { auditRequestContext } from './audit-context.middleware';

describe('AuditService query', () => {
  const prisma = {
    auditLog: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new AuditService(prisma as unknown as PrismaService, {} as CounterService);
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(42);
    prisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it('filters and paginates deterministically without exposing user credentials', async () => {
    const result = await service.list({
      page: 2,
      pageSize: 10,
      userId: 'manager',
      action: 'PERMISSIONS_CHANGED',
      entityName: 'User',
      from: '2026-09-01T00:00:00Z',
      to: '2026-09-30T23:59:59Z',
    });
    expect(result).toEqual({ logs: [], total: 42, page: 2, pageSize: 10 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        include: { user: { select: { id: true, fullName: true } } },
        where: {
          userId: 'manager',
          action: 'PERMISSIONS_CHANGED',
          entityName: 'User',
          timestamp: {
            gte: new Date('2026-09-01T00:00:00Z'),
            lte: new Date('2026-09-30T23:59:59Z'),
          },
        },
      }),
    );
    expect(prisma.auditLog.count.mock.calls[0][0].where).toEqual(
      prisma.auditLog.findMany.mock.calls[0][0].where,
    );
  });

  it('defaults to bounded first page and returns an empty collection', async () => {
    prisma.auditLog.count.mockResolvedValue(0);
    expect(await service.list({})).toEqual({ logs: [], total: 0, page: 1, pageSize: 20 });
  });

  it('filters the current actor name and uses a consistent count snapshot', async () => {
    await service.list({ actor: 'manager' });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user: { fullName: { contains: 'manager', mode: 'insensitive' } } },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array), {
      isolationLevel: 'RepeatableRead',
    });
  });

  it('does not disguise a database read failure as an empty result', async () => {
    prisma.auditLog.findMany.mockRejectedValueOnce(new Error('offline'));
    await expect(service.list({})).rejects.toThrow('offline');
  });

  it('rejects reversed date ranges before querying', async () => {
    await expect(
      service.list({ from: '2026-10-01T00:00:00Z', to: '2026-09-01T00:00:00Z' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('records request metadata and snapshots on the supplied transaction', async () => {
    const tx = { auditLog: { create: jest.fn().mockResolvedValue({}) } };
    await auditRequestContext.run({ ipAddress: '127.0.0.1', userAgent: 'test' }, () =>
      service.record(
        { id: 'actor', name: 'Manager' },
        'PERMISSIONS_CHANGED',
        'Changed',
        'target',
        { oldValues: { viewAudit: false }, newValues: { viewAudit: true } },
        tx as unknown as import('@prisma/client').Prisma.TransactionClient,
      ),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'actor',
        entityId: 'target',
        ipAddress: '127.0.0.1',
        userAgent: 'test',
        oldValuesJson: JSON.stringify({ viewAudit: false }),
        newValuesJson: JSON.stringify({
          actor: 'Manager',
          detail: 'Changed',
          values: { viewAudit: true },
        }),
      }),
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('propagates transactional write errors so the business change rolls back', async () => {
    const tx = { auditLog: { create: jest.fn().mockRejectedValue(new Error('unavailable')) } };
    await expect(
      service.record(
        { id: 'actor', name: 'Manager' },
        'CHANGE',
        'Changed',
        'target',
        {},
        tx as unknown as import('@prisma/client').Prisma.TransactionClient,
      ),
    ).rejects.toThrow('unavailable');
  });
});
