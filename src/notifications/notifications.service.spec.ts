import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const prisma = {
    user: { findMany: jest.fn() },
    notification: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const service = new NotificationsService(prisma as unknown as PrismaService);
  const input = { type: 'LOCK_LIFTED', category: 'LOCK' as const, title: 't', message: 'm' };

  beforeEach(() => jest.clearAllMocks());

  it('should not notify the person who did the action', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'u2', role: Role.HEAD_TRAINER, notify: null }]);
    await service.notifyUsers(['u1', 'u2', null], input, 'u1');
    expect(prisma.user.findMany.mock.calls[0][0].where.id.in).toEqual(['u2']);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });

  it('should skip users who switched the matching notification off', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', role: Role.HEAD_TRAINER, notify: { lockLifted: false } },
      { id: 'u2', role: Role.HEAD_TRAINER, notify: null },
    ]);
    await service.notifyUsers(['u1', 'u2'], input);
    const rows = prisma.notification.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { userId: string }) => r.userId)).toEqual(['u2']);
  });

  it('should give each recipient its own dedupe key', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', role: Role.VETERINARIAN, notify: null }]);
    await service.notifyUsers(['u1'], {
      ...input,
      type: 'PREVENTIVE_DUE',
      dedupeKey: 'PREVENTIVE_DUE:s1',
    });
    const call = prisma.notification.createMany.mock.calls[0][0];
    expect(call.data[0].dedupeKey).toBe('PREVENTIVE_DUE:s1:u1');
    expect(call.skipDuplicates).toBe(true);
  });

  it('should never throw when the database fails', async () => {
    prisma.user.findMany.mockRejectedValue(new Error('db down'));
    await expect(service.notifyUsers(['u1'], input)).resolves.toBeUndefined();
  });
});
