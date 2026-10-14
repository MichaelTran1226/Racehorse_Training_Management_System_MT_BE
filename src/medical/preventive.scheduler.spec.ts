import { PreventiveStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PreventiveScheduler } from './preventive.scheduler';

describe('PreventiveScheduler (C-02, FR-3.15)', () => {
  const now = new Date('2026-10-14T00:00:00Z');
  const day = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);
  const schedule = (id: string, dueDate: Date, advanceNoticeDays?: number) => ({
    id,
    horseId: `h-${id}`,
    dueDate,
    scheduleType: 'VACCINATION',
    status: PreventiveStatus.PENDING,
    horse: { id: `h-${id}`, name: `Horse ${id}` },
    typeCatalog: advanceNoticeDays ? { name: 'Rabies', advanceNoticeDays } : null,
  });
  const prisma = { preventiveSchedule: { findMany: jest.fn() } };
  const notifications = { notifyHorse: jest.fn().mockResolvedValue(undefined) };
  const scheduler = new PreventiveScheduler(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('should remind within the notice window and for overdue schedules only', async () => {
    prisma.preventiveSchedule.findMany.mockResolvedValue([
      schedule('soon', day(2)), // không danh mục => nhắc trước 3 ngày
      schedule('later', day(10), 7),
      schedule('late', day(-1), 7),
    ]);
    const sent = await scheduler.dailyReminders(now);
    expect(sent).toBe(2);
    const types = notifications.notifyHorse.mock.calls.map((c) => c[2].type);
    expect(types).toEqual(['PREVENTIVE_DUE', 'PREVENTIVE_OVERDUE']);
    expect(notifications.notifyHorse.mock.calls[0][2].dedupeKey).toBe(
      'PREVENTIVE_DUE:soon:2026-10-16',
    );
  });

  it('should not throw when the database fails', async () => {
    prisma.preventiveSchedule.findMany.mockRejectedValue(new Error('db down'));
    await expect(scheduler.dailyReminders(now)).resolves.toBe(0);
  });
});
