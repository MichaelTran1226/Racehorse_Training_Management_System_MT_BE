import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PermissionRequestStatus, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/exceptions/api-error';
import { yymm } from '../common/utils/input';
import { CounterService } from './counter.service';

/** Người thực hiện thao tác: id (nếu đã đăng nhập) + tên hiển thị trong nhật ký. */
export interface AuditActor {
  id?: string | null;
  name: string;
}

const REQUEST_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true, role: true } },
} as const;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly counter: CounterService,
  ) {}

  /** Ghi nhật ký bất biến. Lỗi ghi log không làm hỏng thao tác chính. */
  async record(actor: AuditActor, action: string, detail: string, entityId?: string | null) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: actor.id ?? null,
          action,
          entityName: 'User',
          entityId: entityId ?? actor.id ?? null,
          newValuesJson: JSON.stringify({ actor: actor.name, detail }),
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write audit log ${action}: ${String(err)}`);
    }
  }

  /** Tên Club Manager đang hoạt động (người xử lý yêu cầu), hoặc câu chung chung. */
  async activeManagerName(): Promise<string> {
    const manager = await this.prisma.user.findFirst({
      where: { role: Role.CLUB_MANAGER, status: UserStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
    });
    return manager?.fullName ?? 'the Club Manager';
  }

  /** POST /audit/forbidden — ghi ACCESS_DENIED, trả mã tham chiếu để người dùng báo lại. */
  async recordForbidden(actor: AuditActor, screen: string) {
    const reference = `403-${yymm()}-${String(await this.counter.next('forbidden_ref')).padStart(4, '0')}`;
    await this.record(actor, 'ACCESS_DENIED', `${screen} (${reference})`);
    return { reference, managerName: await this.activeManagerName() };
  }

  /** POST /permission-requests — đã có yêu cầu đang chờ cho cùng màn hình thì cập nhật, không tạo trùng. */
  async requestPermission(actor: AuditActor & { id: string }, screen: string, reference: string) {
    const open = await this.prisma.permissionRequest.findFirst({
      where: { userId: actor.id, screen, status: PermissionRequestStatus.OPEN },
    });
    if (open) {
      await this.prisma.permissionRequest.update({
        where: { id: open.id },
        data: { reference, at: new Date() },
      });
    } else {
      await this.prisma.permissionRequest.create({ data: { userId: actor.id, screen, reference } });
    }
    await this.record(actor, 'PERMISSION_REQUESTED', screen);
    return { ok: true };
  }

  /** GET /permission-requests?status=OPEN (mặc định) | ALL */
  async listPermissionRequests(status?: string) {
    const rows = await this.prisma.permissionRequest.findMany({
      where: status === 'ALL' ? {} : { status: PermissionRequestStatus.OPEN },
      include: REQUEST_INCLUDE,
      orderBy: { at: 'desc' },
    });
    return { requests: rows.map(toPublicRequest) };
  }

  /**
   * POST /permission-requests/:id/resolve { status: GRANTED | DISMISSED }.
   * GRANTED chỉ đánh dấu đã xử lý — quyền thật được bật ở màn Permissions của tài khoản.
   */
  async resolvePermissionRequest(actor: AuditActor, id: number, status: string) {
    if (
      status !== PermissionRequestStatus.GRANTED &&
      status !== PermissionRequestStatus.DISMISSED
    ) {
      throw apiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Status must be GRANTED or DISMISSED');
    }
    const request = Number.isInteger(id)
      ? await this.prisma.permissionRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE })
      : null;
    if (!request) throw apiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Request not found');
    if (request.status !== PermissionRequestStatus.OPEN) {
      throw apiError(HttpStatus.CONFLICT, 'INVALID_STATE', 'Request already handled');
    }

    const updated = await this.prisma.permissionRequest.update({
      where: { id },
      data: { status, resolvedAt: new Date(), resolvedBy: actor.name },
      include: REQUEST_INCLUDE,
    });
    await this.record(
      actor,
      `PERMISSION_REQUEST_${status}`,
      `${request.user.fullName}: ${request.screen} (${request.reference})`,
      request.userId,
    );
    return { request: toPublicRequest(updated) };
  }
}

// FE đọc trường `account` (khớp PermissionRequest ở FE src/features/accounts/types.ts).
function toPublicRequest(row: {
  id: number;
  at: Date;
  screen: string;
  reference: string;
  status: string;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  user: unknown;
}) {
  return {
    id: row.id,
    at: row.at,
    screen: row.screen,
    reference: row.reference,
    status: row.status,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
    account: row.user,
  };
}
