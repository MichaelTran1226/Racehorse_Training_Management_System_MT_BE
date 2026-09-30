import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose, Prisma, Role, User, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditActor, AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { OtpService, otpTimes } from '../auth/otp.service';
import { apiError } from '../common/exceptions/api-error';
import { EMAIL_RE, normEmail, str } from '../common/utils/input';
import { normalizePermissions, PERMISSIONS, ROLE_LABEL, ROLES } from '../users/permissions';
import { permissionsOf } from '../users/public-user';
import { InviteAccountDto, ReasonDto, UpdateAccountDto } from './dto/accounts.dto';

export type AccountAction = 'approve' | 'decline' | 'lock' | 'unlock' | 'deactivate' | 'reactivate';

const REASON_MAX = 300;

// Chỉ xóa hẳn được tài khoản CHƯA TỪNG hoạt động; tài khoản đã dùng thì vô hiệu hóa để giữ lịch sử.
const DELETABLE: UserStatus[] = [UserStatus.INVITED, UserStatus.PENDING_EMAIL, UserStatus.REJECTED];

/** Quản lý tài khoản — chỉ người có quyền manageAccounts (controller đã chặn). */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly otp: OtpService,
    private readonly config: ConfigService,
  ) {}

  list(): Promise<User[]> {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async find(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw apiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Account not found');
    return user;
  }

  // ------------------------------------------------------------------ mời nhân viên

  /** Tạo tài khoản INVITED (chưa có mật khẩu) + gửi email kèm mã mời 48 giờ. */
  async invite(actor: AuditActor, dto: InviteAccountDto): Promise<User> {
    const email = normEmail(dto.email);
    const fullName = str(dto.fullName);
    const role = dto.role as Role;
    if (!fullName || !EMAIL_RE.test(email) || !ROLES.includes(role)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Invalid input');
    }
    // Horse Owner tự đăng ký ở trang Sign Up, không được mời.
    if (role === Role.HORSE_OWNER) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION',
        'Horse Owners request their own account',
      );
    }
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw apiError(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'Email taken');
    }

    const user = await this.prisma.user.create({
      data: { fullName, email, role, status: UserStatus.INVITED, invitedBy: actor.name },
    });
    await this.otp.issue(email, OtpPurpose.INVITE, true);
    await this.audit.record(
      actor,
      'ACCOUNT_INVITED',
      `${fullName} invited as ${ROLE_LABEL[role]}`,
      user.id,
    );
    return user;
  }

  /** Gửi lại email mời (mã mới, mã cũ hết hiệu lực). */
  async resendInvite(actor: AuditActor, id: string) {
    const target = await this.find(id);
    if (target.status !== UserStatus.INVITED) {
      throw apiError(HttpStatus.CONFLICT, 'INVALID_STATE', 'Not an open invitation');
    }
    await this.otp.assertCooldown(target.email, OtpPurpose.INVITE);
    const record = await this.otp.issue(target.email, OtpPurpose.INVITE, true);
    await this.audit.record(actor, 'INVITE_RESENT', target.fullName, target.id);
    return { account: target, ...otpTimes(record) };
  }

  // ------------------------------------------------------------------ sửa thông tin

  /** Sửa họ tên + số điện thoại. Email (tên đăng nhập) và vai trò không đổi ở đây. */
  async update(actor: AuditActor, id: string, dto: UpdateAccountDto): Promise<User> {
    const fullName = str(dto.fullName);
    const phone = str(dto.phone);
    if (!fullName) {
      throw apiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Full name is required.', {
        field: 'fullName',
      });
    }
    if (phone.length > 30) {
      throw apiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Phone number is too long.', {
        field: 'phone',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const target = await this.lockAccount(tx, id);
      const oldPhone = target.phoneNumber ?? '';
      const changes: string[] = [];
      if (fullName !== target.fullName) changes.push(`name ${target.fullName} → ${fullName}`);
      if (phone !== oldPhone) changes.push(`phone ${oldPhone || '—'} → ${phone || '—'}`);
      if (changes.length === 0) return target;

      const user = await tx.user.update({
        where: { id: target.id },
        data: { fullName, phoneNumber: phone || null },
      });
      await this.audit.record(
        actor,
        'ACCOUNT_EDITED',
        `${target.fullName}: ${changes.join(', ')}`,
        target.id,
        {
          oldValues: { fullName: target.fullName, phoneNumber: target.phoneNumber },
          newValues: { fullName, phoneNumber: phone || null },
        },
        tx,
      );
      return user;
    });
  }

  // ------------------------------------------------------------------ đổi trạng thái

  /** Không tự khóa / vô hiệu hóa / xóa chính mình; CLB luôn còn ít nhất 1 Club Manager hoạt động. */
  private async assertCanRemove(actor: AuditActor, target: User, selfCode: string) {
    if (target.id === actor.id) {
      throw apiError(HttpStatus.CONFLICT, selfCode, 'Not allowed on your own account');
    }
    if (target.role === Role.CLUB_MANAGER && target.status === UserStatus.ACTIVE) {
      const activeManagers = await this.prisma.user.count({
        where: { role: Role.CLUB_MANAGER, status: UserStatus.ACTIVE },
      });
      if (activeManagers <= 1) throw apiError(HttpStatus.CONFLICT, 'LAST_MANAGER', 'Last manager');
    }
  }

  /** approve / decline / lock / unlock / deactivate / reactivate — body có thể kèm { reason }. */
  async changeStatus(
    actor: AuditActor,
    id: string,
    action: AccountAction,
    dto: ReasonDto,
  ): Promise<User> {
    const reason = str(dto.reason);
    if (reason.length > REASON_MAX) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION',
        `Reason must be at most ${REASON_MAX} characters.`,
        { field: 'reason' },
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const target = await this.lockAccount(tx, id);
      let data: Prisma.UserUpdateInput;

      switch (action) {
        case 'approve':
        case 'decline':
          if (target.status !== UserStatus.PENDING_APPROVAL) {
            throw apiError(HttpStatus.CONFLICT, 'INVALID_STATE', 'Not waiting for approval');
          }
          data =
            action === 'approve'
              ? { status: UserStatus.ACTIVE, statusReason: null }
              : { status: UserStatus.REJECTED, statusReason: reason || null };
          break;
        case 'lock':
          if (target.status !== UserStatus.ACTIVE) {
            throw apiError(
              HttpStatus.CONFLICT,
              'INVALID_STATE',
              'Only an active account can be locked',
            );
          }
          await this.assertCanRemove(actor, target, 'CANNOT_LOCK_SELF');
          data = { status: UserStatus.LOCKED, lockedAt: new Date(), statusReason: reason || null };
          break;
        case 'unlock':
          if (target.status !== UserStatus.LOCKED) {
            throw apiError(HttpStatus.CONFLICT, 'INVALID_STATE', 'Not locked');
          }
          data = { status: UserStatus.ACTIVE, lockedAt: null, statusReason: null };
          break;
        case 'deactivate':
          if (target.status !== UserStatus.ACTIVE && target.status !== UserStatus.LOCKED) {
            throw apiError(
              HttpStatus.CONFLICT,
              'INVALID_STATE',
              'Only an active or locked account can be deactivated',
            );
          }
          await this.assertCanRemove(actor, target, 'CANNOT_CHANGE_SELF');
          data = { status: UserStatus.INACTIVE, lockedAt: null, statusReason: reason || null };
          break;
        case 'reactivate':
          if (target.status !== UserStatus.INACTIVE) {
            throw apiError(HttpStatus.CONFLICT, 'INVALID_STATE', 'Not inactive');
          }
          data = { status: UserStatus.ACTIVE, statusReason: null };
          break;
      }

      const changed = await tx.user.update({
        where: { id: target.id },
        data: { ...data, statusChangedAt: new Date(), statusChangedBy: actor.name },
      });
      await this.audit.record(
        actor,
        `ACCOUNT_${action.toUpperCase()}`,
        reason ? `${target.fullName} — ${reason}` : target.fullName,
        target.id,
        {
          oldValues: { status: target.status, statusReason: target.statusReason },
          newValues: { status: changed.status, statusReason: changed.statusReason },
        },
        tx,
      );
      return changed;
    });
    // Inactive accounts are rejected by JwtStrategy even if session cleanup fails.
    if (updated.status !== UserStatus.ACTIVE) await this.auth.revokeAllTokens(updated.id);
    if (action === 'approve') await this.mailApproved(updated);
    if (action === 'decline') await this.mailDeclined(updated);
    return updated;
  }

  private appUrl(): string {
    return (this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173').replace(/\/+$/, '');
  }

  private async mailApproved(user: User): Promise<void> {
    await this.mail.send(
      user.email,
      'Your EquiFlow account is approved',
      `Hello ${user.fullName},\n\n` +
        `The Club Manager approved your ${ROLE_LABEL[user.role]} account (request ${user.requestCode ?? '—'}).\n` +
        `You can sign in now at ${this.appUrl()}/login with the email and password you chose.`,
    );
  }

  private async mailDeclined(user: User): Promise<void> {
    await this.mail.send(
      user.email,
      'Your EquiFlow account request was declined',
      `Hello ${user.fullName},\n\n` +
        `The Club Manager declined your account request ${user.requestCode ?? ''}.\n` +
        (user.statusReason ? `Reason: ${user.statusReason}\n` : '') +
        `\nIf the details were wrong, you can send a new request at ${this.appUrl()}/sign-up.`,
    );
  }

  // ------------------------------------------------------------------ xóa hẳn

  async remove(actor: AuditActor, id: string): Promise<{ ok: true }> {
    await this.prisma.$transaction(async (tx) => {
      const target = await this.lockAccount(tx, id);
      if (target.id === actor.id) {
        throw apiError(
          HttpStatus.CONFLICT,
          'CANNOT_CHANGE_SELF',
          'Not allowed on your own account',
        );
      }
      if (!DELETABLE.includes(target.status)) {
        throw apiError(
          HttpStatus.CONFLICT,
          'CANNOT_DELETE_USED',
          'This account has been used; deactivate it instead',
        );
      }
      // Dọn dữ liệu phụ theo email (không có khóa ngoại tới User).
      await tx.otpCode.deleteMany({ where: { email: target.email } });
      await tx.resetToken.deleteMany({ where: { email: target.email } });
      await tx.loginAttempt.deleteMany({ where: { email: target.email } });
      await tx.user.delete({ where: { id: target.id } });
      await this.audit.record(
        actor,
        'ACCOUNT_DELETED',
        `${target.fullName} (${target.email}, ${target.status})`,
        target.id,
        { oldValues: { fullName: target.fullName, email: target.email, status: target.status } },
        tx,
      );
    });
    return { ok: true };
  }

  // ------------------------------------------------------------------ quyền

  async updatePermissions(actor: AuditActor, id: string, incoming: Record<string, unknown>) {
    return this.prisma.$transaction(async (tx) => {
      const target = await this.lockAccount(tx, id);
      const current = permissionsOf(target);
      const next = normalizePermissions(target.role, { ...current, ...incoming });

      let granted = 0;
      let revoked = 0;
      for (const { key } of PERMISSIONS) {
        if (next[key] && !current[key]) granted += 1;
        if (!next[key] && current[key]) revoked += 1;
      }

      const changed = await tx.user.update({
        where: { id: target.id },
        data: {
          permissions: next,
          permissionsChangedAt: new Date(),
          permissionsChangedBy: actor.name,
        },
      });
      await this.audit.record(
        actor,
        'PERMISSIONS_CHANGED',
        `${target.fullName}: ${granted} granted, ${revoked} revoked`,
        target.id,
        { oldValues: current, newValues: next },
        tx,
      );
      return { user: changed, granted, revoked };
    });
  }

  private async lockAccount(tx: Prisma.TransactionClient, id: string): Promise<User> {
    // Read after acquiring the row lock: before-values must reflect the last committed writer.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id } });
    if (!user) throw apiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Account not found');
    return user;
  }
}
