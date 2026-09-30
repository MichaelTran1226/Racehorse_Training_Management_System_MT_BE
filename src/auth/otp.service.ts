import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpCode, OtpPurpose, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { apiError } from '../common/exceptions/api-error';
import { ROLE_LABEL } from '../users/permissions';

// Hạn dùng: 10 phút (đăng ký, quên mật khẩu) — 48 giờ với lời mời nhân viên.
export const OTP_TTL = 10 * 60 * 1000;
const INVITE_TTL = 48 * 3600 * 1000;
const OTP_COOLDOWN = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const FIXED_CODE = '123456';

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** FE gửi mục đích dạng chữ thường ("signup" | "reset" | "invite"). */
export function purposeOf(value: unknown): OtpPurpose {
  if (value === 'signup') return OtpPurpose.SIGNUP;
  if (value === 'invite') return OtpPurpose.INVITE;
  return OtpPurpose.RESET;
}

/** FE đọc các mốc này dạng số mili-giây (bộ đếm ngược ở màn nhập mã). */
export function otpTimes(r: OtpCode) {
  return {
    sentAt: r.sentAt.getTime(),
    expiresAt: r.expiresAt.getTime(),
    resendAt: r.resendAt.getTime(),
  };
}

/**
 * Mã OTP 6 số gửi qua email: sai 5 lần thì mã bị khóa, gửi lại sau 60 giây, xin mã mới thì mã cũ
 * bị thay. Chỉ lưu bản băm SHA-256. DEV_FIXED_OTP=true => mã luôn là 123456 (tiện test).
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  find(email: string, purpose: OtpPurpose) {
    return this.prisma.otpCode.findUnique({ where: { email_purpose: { email, purpose } } });
  }

  /**
   * Tạo mã mới (thay mã cũ). `deliver` = false khi email không thuộc tài khoản phù hợp: vẫn tạo
   * bản ghi để phản hồi giống hệt (không lộ email có tồn tại hay không) nhưng không gửi mail.
   */
  async issue(email: string, purpose: OtpPurpose, deliver: boolean): Promise<OtpCode> {
    const fixed = this.config.get<string>('DEV_FIXED_OTP') === 'true';
    const code = fixed ? FIXED_CODE : String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const now = Date.now();
    const times = {
      codeHash: sha256(code),
      sentAt: new Date(now),
      expiresAt: new Date(now + (purpose === OtpPurpose.INVITE ? INVITE_TTL : OTP_TTL)),
      resendAt: new Date(now + OTP_COOLDOWN),
      attempts: 0,
    };
    const record = await this.prisma.otpCode.upsert({
      where: { email_purpose: { email, purpose } },
      create: { email, purpose, ...times },
      update: times,
    });
    if (deliver) await this.sendMail(email, purpose, code);
    return record;
  }

  /** Đúng mã => xóa mã (dùng một lần). `valid` = false: email không hợp lệ cho bước này, báo lỗi như sai mã. */
  async check(email: string, purpose: OtpPurpose, code: string, valid = true): Promise<void> {
    const record = await this.find(email, purpose);
    if (!record) throw apiError(HttpStatus.NOT_FOUND, 'OTP_NOT_FOUND', 'No code');
    if (Date.now() > record.expiresAt.getTime()) {
      throw apiError(HttpStatus.BAD_REQUEST, 'OTP_EXPIRED', 'Code expired');
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw apiError(HttpStatus.TOO_MANY_REQUESTS, 'OTP_ATTEMPTS_EXCEEDED', 'Too many attempts');
    }

    const match = crypto.timingSafeEqual(Buffer.from(sha256(code)), Buffer.from(record.codeHash));
    if (!valid || !match) {
      const updated = await this.prisma.otpCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      const left = OTP_MAX_ATTEMPTS - updated.attempts;
      if (left <= 0) {
        throw apiError(HttpStatus.TOO_MANY_REQUESTS, 'OTP_ATTEMPTS_EXCEEDED', 'Too many attempts');
      }
      throw apiError(HttpStatus.BAD_REQUEST, 'OTP_INVALID', 'Wrong code', { attemptsLeft: left });
    }
    await this.prisma.otpCode.delete({ where: { id: record.id } });
  }

  /** GET /auth/otp — mốc thời gian của mã đang có (cho bộ đếm ngược). */
  async times(email: string, purpose: OtpPurpose) {
    const record = await this.find(email, purpose);
    if (!record) throw apiError(HttpStatus.NOT_FOUND, 'OTP_NOT_FOUND', 'No code');
    return otpTimes(record);
  }

  /** Mã vừa gửi chưa qua 60 giây => 429 OTP_COOLDOWN. */
  async assertCooldown(email: string, purpose: OtpPurpose): Promise<void> {
    const existing = await this.find(email, purpose);
    if (existing && existing.resendAt.getTime() > Date.now()) {
      throw apiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'OTP_COOLDOWN',
        'Wait before requesting a new code',
        { resendAt: existing.resendAt.getTime() },
      );
    }
  }

  /** POST /auth/otp/resend — chỉ gửi mail tới đúng người cho từng mục đích. */
  async resend(email: string, purpose: OtpPurpose) {
    await this.assertCooldown(email, purpose);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const deliver =
      purpose === OtpPurpose.SIGNUP
        ? user?.status === UserStatus.PENDING_EMAIL
        : purpose === OtpPurpose.INVITE
          ? user?.status === UserStatus.INVITED
          : Boolean(user);
    return otpTimes(await this.issue(email, purpose, deliver));
  }

  private async sendMail(email: string, purpose: OtpPurpose, code: string): Promise<void> {
    const appUrl = (this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173').replace(
      /\/+$/,
      '',
    );
    if (purpose === OtpPurpose.INVITE) {
      const user = await this.prisma.user.findUnique({ where: { email } });
      const role = user ? ROLE_LABEL[user.role] : 'a staff member';
      const by = user?.invitedBy ?? 'The Club Manager';
      await this.mail.send(
        email,
        `EquiFlow invitation code: ${code}`,
        `${by} invited you to EquiFlow as ${role}.\n\n` +
          `Open ${appUrl}/accept-invite?email=${encodeURIComponent(email)} and enter the code ${code} to set your password.\n\n` +
          'The code expires in 48 hours and can be used once. If you did not expect this invitation, you can ignore this email.',
      );
      return;
    }
    const what =
      purpose === OtpPurpose.SIGNUP ? 'verify your email address' : 'reset your password';
    await this.mail.send(
      email,
      `EquiFlow verification code: ${code}`,
      `Your EquiFlow code to ${what} is ${code}.\n\n` +
        'It expires in 10 minutes and can be used once. If you did not ask for it, you can ignore this email.',
    );
  }
}
