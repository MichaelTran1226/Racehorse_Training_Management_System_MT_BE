import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { NotificationCategory, Prisma, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/exceptions/api-error';
import { defaultNotify, NotifyKey } from '../users/permissions';

export interface NotifyInput {
  type: string; // mã sự kiện, FE dịch theo mã này
  category: NotificationCategory;
  title: string; // bản tiếng Anh dự phòng
  message: string;
  params?: Record<string, string | number>;
  link?: string;
  senderName?: string;
  dedupeKey?: string; // sự kiện chỉ báo 1 lần cho mỗi người nhận
}

// Sự kiện gắn với công tắc thông báo của người dùng (trang Notification settings).
const SETTING_OF: Record<string, NotifyKey> = {
  WORKOUT_ABNORMAL: 'thresholdAlert',
  LOCK_LIFTED: 'lockLifted',
};

/**
 * Thông báo trong ứng dụng (C-01). Các service khác gọi notify…() SAU khi ghi DB thành công.
 * Gửi thông báo là việc phụ: lỗi chỉ ghi log, không làm hỏng thao tác chính.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notifyUsers(
    userIds: (string | null | undefined)[],
    input: NotifyInput,
    excludeUserId?: string,
  ) {
    try {
      const ids = [...new Set(userIds.filter((id): id is string => !!id && id !== excludeUserId))];
      if (ids.length === 0) return;
      const recipients = await this.prisma.user.findMany({
        where: { id: { in: ids }, status: UserStatus.ACTIVE },
        select: { id: true, role: true, notify: true },
      });
      const settingKey = SETTING_OF[input.type];
      const allowed = recipients.filter((u) => {
        if (!settingKey) return true;
        const stored = (u.notify ?? {}) as Partial<Record<NotifyKey, boolean>>;
        return stored[settingKey] ?? defaultNotify(u.role)[settingKey];
      });
      if (allowed.length === 0) return;
      await this.prisma.notification.createMany({
        data: allowed.map((u) => ({
          userId: u.id,
          type: input.type,
          category: input.category,
          title: input.title,
          message: input.message,
          params: input.params,
          link: input.link,
          senderName: input.senderName,
          dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${u.id}` : undefined,
        })),
        skipDuplicates: true,
      });
    } catch (err) {
      this.logger.warn(`Could not send notification ${input.type}: ${(err as Error).message}`);
    }
  }

  async notifyRoles(roles: Role[], input: NotifyInput, excludeUserId?: string) {
    try {
      const users = await this.prisma.user.findMany({
        where: { role: { in: roles }, status: UserStatus.ACTIVE },
        select: { id: true },
      });
      await this.notifyUsers(
        users.map((u) => u.id),
        input,
        excludeUserId,
      );
    } catch (err) {
      this.logger.warn(`Could not send notification ${input.type}: ${(err as Error).message}`);
    }
  }

  /** Người liên quan tới 1 con ngựa: các vai trò được chọn + chủ ngựa + groom đang chăm (tùy chọn). */
  async horseAudience(horseId: string, opts: { roles?: Role[]; owner?: boolean; groom?: boolean }) {
    const horse = await this.prisma.horse.findUnique({
      where: { id: horseId },
      select: {
        ownerId: true,
        stallAllocations: { where: { isActive: true }, select: { assignedGroomUserId: true } },
      },
    });
    const ids: (string | null | undefined)[] = [];
    if (opts.roles?.length) {
      const staff = await this.prisma.user.findMany({
        where: { role: { in: opts.roles }, status: UserStatus.ACTIVE },
        select: { id: true },
      });
      ids.push(...staff.map((u) => u.id));
    }
    if (opts.owner) ids.push(horse?.ownerId);
    if (opts.groom) ids.push(...(horse?.stallAllocations ?? []).map((a) => a.assignedGroomUserId));
    return ids;
  }

  async notifyHorse(
    horseId: string,
    opts: { roles?: Role[]; owner?: boolean; groom?: boolean },
    input: NotifyInput,
    excludeUserId?: string,
  ) {
    try {
      await this.notifyUsers(await this.horseAudience(horseId, opts), input, excludeUserId);
    } catch (err) {
      this.logger.warn(`Could not send notification ${input.type}: ${(err as Error).message}`);
    }
  }

  // ------------------------------------------------------------------ API của người nhận

  async list(userId: string, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 200);
    const [notifications, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { notifications: notifications.map(toPublic), unreadCount };
  }

  async markRead(userId: string, ids: string[]) {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION',
        'ids must be a list of notification ids',
      );
    }
    await this.prisma.notification.updateMany({
      where: { userId, id: { in: ids }, readAt: null },
      data: { readAt: new Date() },
    });
    return this.list(userId);
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return this.list(userId);
  }

  async clear(userId: string) {
    await this.prisma.notification.deleteMany({ where: { userId } });
    return { notifications: [], unreadCount: 0 };
  }
}

// Hình dạng FE đọc (khớp AppNotification ở FE src/shared/lib/notifications.ts).
function toPublic(n: Prisma.NotificationGetPayload<object>) {
  return {
    id: n.id,
    type: n.type,
    category: n.category,
    title: n.title,
    message: n.message,
    params: n.params ?? undefined,
    link: n.link ?? undefined,
    senderName: n.senderName ?? undefined,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  };
}
