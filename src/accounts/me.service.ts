import { HttpStatus, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { apiError } from '../common/exceptions/api-error';
import { raw, str } from '../common/utils/input';
import { hashPassword, passwordError, verifyPassword } from '../common/utils/password';
import { isNotifyLocked, NOTIFY_KEYS, NotifyKey } from '../users/permissions';
import { notifyOf } from '../users/public-user';
import { ChangePasswordDto, UpdateNotificationDto, UpdateProfileDto } from './dto/accounts.dto';

const PASSWORD_MAX_AGE_DAYS = 180;

/** Hồ sơ của người đang đăng nhập: tên + số điện thoại, công tắc thông báo, đổi mật khẩu. */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  private async current(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw apiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Session expired');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.current(userId);
    const fullName = str(dto.fullName);
    if (!fullName) {
      throw apiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Full name is required.', {
        field: 'fullName',
      });
    }
    if (fullName !== user.fullName) {
      await this.audit.record(
        { id: user.id, name: user.fullName },
        'NAME_CHANGED',
        `${user.fullName} → ${fullName}`,
      );
    }
    return this.prisma.user.update({
      where: { id: user.id },
      data: { fullName, phoneNumber: str(dto.phone) || null },
    });
  }

  async updateNotification(userId: string, dto: UpdateNotificationDto): Promise<User> {
    const user = await this.current(userId);
    const key = dto.key as NotifyKey;
    if (!NOTIFY_KEYS.includes(key)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Unknown notification');
    }
    if (isNotifyLocked(user.role, key)) {
      throw apiError(HttpStatus.CONFLICT, 'LOCKED', 'This notification cannot be changed');
    }
    const notify = { ...notifyOf(user), [key]: dto.value === true };
    return this.prisma.user.update({ where: { id: user.id }, data: { notify } });
  }

  /**
   * Đổi mật khẩu xong: thu hồi mọi refresh token (đăng xuất các thiết bị khác) rồi cấp cặp token
   * mới cho thiết bị hiện tại để người dùng không bị đăng xuất.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.current(userId);
    const currentPw = raw(dto.current);
    const next = raw(dto.next);
    if (!(await verifyPassword(currentPw, user.passwordHash))) {
      throw apiError(HttpStatus.BAD_REQUEST, 'WRONG_PASSWORD', 'Current password is wrong');
    }
    if (next === currentPw)
      throw apiError(HttpStatus.BAD_REQUEST, 'SAME_PASSWORD', 'Same password');
    const weak = passwordError(next);
    if (weak) throw apiError(HttpStatus.BAD_REQUEST, 'WEAK_PASSWORD', weak);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(next) },
    });
    await this.auth.revokeAllTokens(user.id);
    await this.audit.record(
      { id: user.id, name: user.fullName },
      'PASSWORD_CHANGED',
      'Changed in My Profile',
    );
    return {
      nextChangeDue: new Date(Date.now() + PASSWORD_MAX_AGE_DAYS * 24 * 3600 * 1000).toISOString(),
      ...(await this.auth.issueTokens(updated)),
    };
  }
}
