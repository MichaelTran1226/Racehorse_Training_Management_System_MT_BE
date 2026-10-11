import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { OtpPurpose, Role, User, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto, RefreshTokenResponseDto, UserProfileDto } from './dto/auth-response.dto';
import {
  RegisterDto,
  ResetPasswordDto,
  VerifyOtpDto,
  ForgotPasswordDto,
} from './dto/account-flow.dto';
import { apiError } from '../common/exceptions/api-error';
import { EMAIL_RE, normEmail, raw, str, yymm } from '../common/utils/input';
import { hashPassword, passwordError, verifyPassword } from '../common/utils/password';
import { AuditService } from '../audit/audit.service';
import { CounterService } from '../audit/counter.service';
import { ROLE_LABEL } from '../users/permissions';
import { toPublicUser } from '../users/public-user';
import { OTP_TTL, OtpService, otpTimes, sha256 } from './otp.service';

const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK = 15 * 60 * 1000;
const REFRESH_TTL = 7 * 24 * 60 * 60 * 1000;
const REMEMBER_TTL = 30 * 24 * 60 * 60 * 1000; // "Remember me": giữ đăng nhập 30 ngày
// Refresh token đã đổi sang token mới mà bị dùng lại sau khoảng này => coi là bị đánh cắp.
// 30 giây đầu bỏ qua: 2 tab trình duyệt có thể cùng làm mới một lúc.
const REUSE_GRACE = 30 * 1000;

// Trạng thái không được đăng nhập => [mã HTTP, code FE đọc].
const BLOCKED: Partial<Record<UserStatus, [HttpStatus, string]>> = {
  LOCKED: [HttpStatus.LOCKED, 'ACCOUNT_LOCKED'],
  PENDING_APPROVAL: [HttpStatus.FORBIDDEN, 'ACCOUNT_PENDING'],
  PENDING_EMAIL: [HttpStatus.FORBIDDEN, 'EMAIL_NOT_VERIFIED'],
  INVITED: [HttpStatus.FORBIDDEN, 'ACCOUNT_INVITED'],
  INACTIVE: [HttpStatus.FORBIDDEN, 'ACCOUNT_INACTIVE'],
  REJECTED: [HttpStatus.FORBIDDEN, 'ACCOUNT_REJECTED'],
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly otp: OtpService,
    private readonly audit: AuditService,
    private readonly counter: CounterService,
  ) {}

  /**
   * Hashes a raw cryptographic token with SHA-256 for secure database storage
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Maps user role to their dedicated system dashboard URL
   */
  getDashboardUrlForRole(role: Role): string {
    switch (role) {
      case Role.CLUB_MANAGER:
        return '/manager/dashboard';
      case Role.HEAD_TRAINER:
        return '/trainer/dashboard';
      case Role.VETERINARIAN:
        return '/vet/dashboard';
      case Role.GROOM:
        return '/groom/dashboard';
      case Role.HORSE_OWNER:
        return '/owner/dashboard';
      default:
        return '/dashboard';
    }
  }

  /** Hồ sơ gửi FE: đủ trường PublicAccount + phoneNumber, dashboardUrl như trước. */
  toProfile(user: User): UserProfileDto {
    return {
      ...toPublicUser(user),
      phoneNumber: user.phoneNumber,
      dashboardUrl: this.getDashboardUrlForRole(user.role),
    };
  }

  /**
   * Cấp cặp access token (hạn theo JWT_EXPIRES_IN, mặc định 15 phút) + refresh token
   * (7 ngày, 30 ngày khi "Remember me", hoặc đúng `refreshExpiresAt` khi xoay vòng).
   */
  async issueTokens(user: User, remember = false, refreshExpiresAt?: Date) {
    const jwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };
    const accessToken = await this.jwtService.signAsync(jwtPayload);
    // Số giây sống thật của access token, đọc từ chính token (không viết cứng 900).
    const { iat, exp } = this.jwtService.decode<{ iat: number; exp: number }>(accessToken);

    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(rawRefreshToken),
        userId: user.id,
        expiresAt:
          refreshExpiresAt ?? new Date(Date.now() + (remember ? REMEMBER_TTL : REFRESH_TTL)),
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: exp - iat,
      tokenType: 'Bearer',
    };
  }

  /** Đăng xuất mọi thiết bị: thu hồi mọi refresh token còn hiệu lực của tài khoản. */
  async revokeAllTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  /** Email đang bị khóa tạm (sai mật khẩu 5 lần) => 429 ATTEMPTS_EXCEEDED kèm thời điểm mở khóa. */
  async assertNotLockedOut(email: string): Promise<void> {
    const attempt = await this.prisma.loginAttempt.findUnique({ where: { email } });
    if (attempt?.lockedUntil && attempt.lockedUntil.getTime() > Date.now()) {
      throw apiError(HttpStatus.TOO_MANY_REQUESTS, 'ATTEMPTS_EXCEEDED', 'Too many attempts', {
        retryAt: attempt.lockedUntil.toISOString(),
      });
    }
  }

  /**
   * Ghi một lần nhập sai mật khẩu (đăng nhập hoặc đổi mật khẩu dùng chung bộ đếm theo email).
   * Đủ 5 lần => khóa 15 phút và trả `lockedUntil`; chưa đủ => trả số lần còn lại.
   * Hết khóa 15 phút thì đếm lại từ đầu.
   */
  async recordFailedAttempt(email: string): Promise<{ attemptsLeft: number; lockedUntil?: Date }> {
    const attempt = await this.prisma.loginAttempt.findUnique({ where: { email } });
    const fails = (attempt && !attempt.lockedUntil ? attempt.fails : 0) + 1;
    if (fails >= LOGIN_MAX_FAILS) {
      const lockedUntil = new Date(Date.now() + LOGIN_LOCK);
      await this.prisma.loginAttempt.upsert({
        where: { email },
        create: { email, fails: 0, lockedUntil },
        update: { fails: 0, lockedUntil },
      });
      return { attemptsLeft: 0, lockedUntil };
    }
    await this.prisma.loginAttempt.upsert({
      where: { email },
      create: { email, fails },
      update: { fails, lockedUntil: null },
    });
    return { attemptsLeft: LOGIN_MAX_FAILS - fails };
  }

  async clearFailedAttempts(email: string): Promise<void> {
    await this.prisma.loginAttempt.deleteMany({ where: { email } });
  }

  /**
   * Authenticates user credentials, validates account lifecycle, and issues tokens.
   * Sai mật khẩu 5 lần => khóa đăng nhập 15 phút theo email (kể cả email không tồn tại).
   */
  async login(
    loginDto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const normalizedEmail = normEmail(loginDto.email);
    await this.assertNotLockedOut(normalizedEmail);

    const found = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!(await verifyPassword(loginDto.password, found?.passwordHash))) {
      const { attemptsLeft, lockedUntil } = await this.recordFailedAttempt(normalizedEmail);
      if (lockedUntil) {
        await this.audit.record(
          { id: found?.id, name: normalizedEmail || 'anonymous' },
          'LOGIN_LOCKED_OUT',
          'Too many wrong passwords',
        );
        throw apiError(HttpStatus.TOO_MANY_REQUESTS, 'ATTEMPTS_EXCEEDED', 'Too many attempts', {
          retryAt: lockedUntil.toISOString(),
        });
      }
      await this.audit.record(
        { id: found?.id, name: normalizedEmail || 'anonymous' },
        'LOGIN_FAILED',
        'Wrong email or password',
      );
      throw apiError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Invalid email or password', {
        attemptsLeft,
      });
    }
    // Đến đây mật khẩu đúng nên chắc chắn có tài khoản.
    const user = found as User;
    await this.clearFailedAttempts(normalizedEmail);

    // Lifecycle status checks
    const block = BLOCKED[user.status];
    if (block) {
      throw apiError(block[0], block[1], 'Account cannot sign in', {
        fullName: user.fullName,
        roleLabel: ROLE_LABEL[user.role],
        lockedAt: user.lockedAt?.toISOString() ?? null,
        requestedAt: user.requestedAt?.toISOString() ?? null,
        requestCode: user.requestCode ?? null, // PENDING_APPROVAL: mã để nhắc Club Manager
        reason: user.statusReason ?? null, // lý do khóa / từ chối / vô hiệu hóa
      });
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active.');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() },
    });
    const tokens = await this.issueTokens(updated, loginDto.remember === true);

    // Record immutable audit log
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'AUTH_LOGIN',
          entityName: 'User',
          entityId: user.id,
          newValuesJson: JSON.stringify({ role: user.role, email: user.email }),
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });
    } catch (auditError) {
      this.logger.warn(`Failed to create audit log for login: ${auditError}`);
    }

    return { ...tokens, user: this.toProfile(updated) };
  }

  /**
   * Refreshes JWT tokens with strict token rotation and revocation
   */
  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<RefreshTokenResponseDto> {
    const tokenHash = this.hashToken(refreshTokenDto.refreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (storedToken.revoked) {
      // Token đã được đổi sang token mới mà vẫn bị dùng lại => có thể đã bị đánh cắp:
      // thu hồi mọi phiên của tài khoản. Token bị thu hồi do đăng xuất (rotatedAt = null) không tính.
      const reused =
        storedToken.rotatedAt !== null &&
        Date.now() - storedToken.rotatedAt.getTime() > REUSE_GRACE;
      if (reused) {
        await this.revokeAllTokens(storedToken.userId);
        await this.audit.record(
          { id: storedToken.userId, name: storedToken.user.fullName },
          'REFRESH_TOKEN_REUSED',
          'A rotated refresh token was used again; every session was signed out',
        );
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (storedToken.user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User account is not active');
    }

    // Xoay vòng: thu hồi token hiện tại và đánh dấu "đã đổi sang token mới".
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true, rotatedAt: new Date() },
    });

    // Giữ nguyên hạn dài của token "Remember me" khi xoay vòng.
    const newExpiresAt = new Date(
      Math.max(Date.now() + REFRESH_TTL, storedToken.expiresAt.getTime()),
    );
    return this.issueTokens(storedToken.user, false, newExpiresAt);
  }

  /**
   * Đăng xuất: thu hồi refresh token gửi kèm và ghi nhật ký AUTH_LOGOUT.
   * API này công khai (@Public) nên người đăng xuất được xác định qua chính refresh token.
   */
  async logout(
    refreshToken?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const stored = refreshToken
      ? await this.prisma.refreshToken.findUnique({
          where: { tokenHash: this.hashToken(refreshToken) },
        })
      : null;

    if (stored && !stored.revoked) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revoked: true },
      });
      try {
        await this.prisma.auditLog.create({
          data: {
            userId: stored.userId,
            action: 'AUTH_LOGOUT',
            entityName: 'User',
            entityId: stored.userId,
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
          },
        });
      } catch (auditError) {
        this.logger.warn(`Failed to create audit log for logout: ${auditError}`);
      }
    }

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  /**
   * Retrieves profile of currently authenticated user
   */
  async getMe(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return this.toProfile(user);
  }

  // ------------------------------------------------------------------ đăng ký + xác minh email

  private async newRequestCode(): Promise<string> {
    return `REQ-${yymm()}-${String(await this.counter.next('request_code')).padStart(3, '0')}`;
  }

  /**
   * Chỉ Horse Owner tự đăng ký. Cho đăng ký lại cùng email khi: đăng ký dở (PENDING_EMAIL, giữ mã
   * yêu cầu cũ) hoặc đã bị Club Manager từ chối (REJECTED, cấp mã yêu cầu mới).
   */
  async register(dto: RegisterDto) {
    const email = normEmail(dto.email);
    const fullName = str(dto.fullName);
    const password = raw(dto.password);
    if (dto.role !== Role.HORSE_OWNER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'ROLE_NOT_ALLOWED',
        'Only Horse Owner can self-register',
      );
    }
    if (!fullName || !EMAIL_RE.test(email) || passwordError(password)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Invalid input');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    const canReapply =
      existing?.status === UserStatus.PENDING_EMAIL || existing?.status === UserStatus.REJECTED;
    if (existing && !canReapply) {
      throw apiError(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'Email taken');
    }

    const passwordHash = await hashPassword(password);
    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            fullName,
            passwordHash,
            status: UserStatus.PENDING_EMAIL,
            statusReason: null,
            requestedAt: null,
            // Yêu cầu bị từ chối là yêu cầu cũ đã đóng => yêu cầu mới có mã mới.
            requestCode:
              existing.status === UserStatus.REJECTED || !existing.requestCode
                ? await this.newRequestCode()
                : existing.requestCode,
          },
        })
      : await this.prisma.user.create({
          data: {
            fullName,
            email,
            passwordHash,
            role: Role.HORSE_OWNER,
            status: UserStatus.PENDING_EMAIL,
            requestCode: await this.newRequestCode(),
          },
        });

    const record = await this.otp.issue(email, OtpPurpose.SIGNUP, true);
    await this.audit.record(
      { id: user.id, name: fullName },
      'REGISTER',
      `Sign-up request ${user.requestCode}`,
    );
    return { email, ...otpTimes(record) };
  }

  /** Nhập đúng mã => chuyển sang chờ Club Manager duyệt (PENDING_APPROVAL). */
  async verifyEmail(dto: VerifyOtpDto) {
    const email = normEmail(dto.email);
    const pending = await this.prisma.user.findFirst({
      where: { email, status: UserStatus.PENDING_EMAIL },
    });
    await this.otp.check(email, OtpPurpose.SIGNUP, str(dto.code), Boolean(pending));
    if (!pending) throw apiError(HttpStatus.NOT_FOUND, 'OTP_NOT_FOUND', 'No code');

    const user = await this.prisma.user.update({
      where: { id: pending.id },
      data: { status: UserStatus.PENDING_APPROVAL, requestedAt: new Date() },
    });
    await this.audit.record(
      { id: user.id, name: user.fullName },
      'EMAIL_VERIFIED',
      `Request ${user.requestCode} sent for approval`,
    );
    return {
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      requestCode: user.requestCode,
      requestedAt: user.requestedAt,
      reviewer: await this.audit.activeManagerName(),
    };
  }

  // ------------------------------------------------------------------ quên / đặt lại mật khẩu

  /** Luôn trả kết quả giống nhau dù email có tồn tại hay không (thông báo trung tính). */
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = normEmail(dto.email);
    if (!EMAIL_RE.test(email)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_EMAIL', 'Invalid email');
    }

    // Mã vừa gửi còn trong 60 giây chờ => trả lại mốc cũ, không gửi thêm.
    const existing = await this.otp.find(email, OtpPurpose.RESET);
    if (existing && existing.resendAt.getTime() > Date.now()) {
      return { sent: true, ...otpTimes(existing) };
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    const record = await this.otp.issue(email, OtpPurpose.RESET, Boolean(user));
    await this.audit.record(
      { id: user?.id, name: user?.fullName ?? 'anonymous' },
      'PASSWORD_RESET_REQUESTED',
      'OTP issued',
    );
    return { sent: true, ...otpTimes(record) };
  }

  private async issueResetToken(email: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + OTP_TTL;
    await this.prisma.resetToken.create({
      data: { tokenHash: sha256(token), email, expiresAt: new Date(expiresAt) },
    });
    return { resetToken: token, expiresAt };
  }

  /** Nhập đúng OTP quên mật khẩu => nhận vé đặt mật khẩu (dùng ở /auth/reset-password). */
  async verifyResetOtp(dto: VerifyOtpDto) {
    const email = normEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    await this.otp.check(email, OtpPurpose.RESET, str(dto.code), Boolean(user));
    return this.issueResetToken(email);
  }

  /** Nhân viên được mời nhập mã trong email mời => nhận vé đặt mật khẩu lần đầu. */
  async verifyInviteOtp(dto: VerifyOtpDto) {
    const email = normEmail(dto.email);
    const invited = await this.prisma.user.findFirst({
      where: { email, status: UserStatus.INVITED },
    });
    await this.otp.check(email, OtpPurpose.INVITE, str(dto.code), Boolean(invited));
    return {
      ...(await this.issueResetToken(email)),
      fullName: invited?.fullName ?? '',
      role: invited?.role ?? null,
    };
  }

  /** Đặt mật khẩu bằng vé. Tài khoản INVITED đặt lần đầu => kích hoạt luôn. */
  async resetPassword(dto: ResetPasswordDto) {
    const entry = await this.prisma.resetToken.findUnique({
      where: { tokenHash: sha256(raw(dto.resetToken)) },
    });
    if (!entry || entry.expiresAt.getTime() < Date.now()) {
      throw apiError(HttpStatus.BAD_REQUEST, 'RESET_EXPIRED', 'Reset expired');
    }

    const password = raw(dto.password);
    const weak = passwordError(password);
    if (weak) throw apiError(HttpStatus.BAD_REQUEST, 'WEAK_PASSWORD', weak);

    const user = await this.prisma.user.findUnique({ where: { email: entry.email } });
    if (!user) throw apiError(HttpStatus.BAD_REQUEST, 'RESET_EXPIRED', 'Reset expired');

    const accepting = user.status === UserStatus.INVITED;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        ...(accepting ? { status: UserStatus.ACTIVE, statusReason: null } : {}),
      },
    });
    await this.prisma.resetToken.deleteMany({ where: { email: entry.email } });
    await this.prisma.loginAttempt.deleteMany({ where: { email: entry.email } });
    await this.prisma.otpCode.deleteMany({
      where: { email: entry.email, purpose: OtpPurpose.INVITE },
    });
    // Mật khẩu đã đổi => đăng xuất mọi thiết bị đang dùng mật khẩu cũ.
    await this.revokeAllTokens(user.id);
    await this.audit.record(
      { id: user.id, name: user.fullName },
      accepting ? 'INVITE_ACCEPTED' : 'PASSWORD_RESET',
      accepting ? 'Password set; account is active' : 'Password changed with OTP',
    );
    return { ok: true, activated: accepting };
  }
}
