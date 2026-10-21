import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { buildOtpEmail, OtpEmailOptions } from './templates/otp-email.template';

/**
 * Gửi email (mã OTP, lời mời, kết quả duyệt tài khoản) qua Resend hoặc SMTP.
 * - EMAIL_PROVIDER=resend => gửi qua Resend HTTP API (cần RESEND_API_KEY).
 * - EMAIL_PROVIDER=smtp   => gửi qua SMTP (Gmail, Resend SMTP, v.v.).
 * - EMAIL_PROVIDER=mock   hoặc chưa cấu hình credentials => chỉ in log (tiện dev/test).
 * Lỗi gửi mail KHÔNG làm hỏng request: ghi log, người dùng có thể bấm "Resend".
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly provider: 'resend' | 'smtp' | 'mock';
  private readonly resend: Resend | null = null;
  private readonly transporter: nodemailer.Transporter | null = null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const provider = (config.get<string>('EMAIL_PROVIDER') || 'mock').toLowerCase();
    const resendApiKey = config.get<string>('RESEND_API_KEY') || '';
    const smtpUser = config.get<string>('SMTP_USER') || '';

    if (provider === 'resend') {
      if (!resendApiKey) {
        this.logger.warn(
          'EMAIL_PROVIDER=resend nhưng RESEND_API_KEY đang trống. Chuyển sang chế độ MOCK (in log).',
        );
        this.provider = 'mock';
      } else {
        this.provider = 'resend';
        this.resend = new Resend(resendApiKey);
      }
    } else if (provider === 'smtp') {
      if (!smtpUser) {
        this.logger.warn(
          'EMAIL_PROVIDER=smtp nhưng SMTP_USER đang trống. Chuyển sang chế độ MOCK (in log).',
        );
        this.provider = 'mock';
      } else {
        this.provider = 'smtp';
        this.transporter = nodemailer.createTransport({
          host: config.get<string>('SMTP_HOST'),
          port: Number(config.get<string>('SMTP_PORT') || 587),
          auth: { user: smtpUser, pass: config.get<string>('SMTP_PASS') || '' },
        });
      }
    } else {
      this.provider = 'mock';
    }

    const defaultFrom =
      this.provider === 'resend'
        ? 'TMEC System <noreply@tmec.site>'
        : smtpUser || 'TMEC System <noreply@tmec.site>';

    this.from = config.get<string>('EMAIL_FROM') || defaultFrom;

    if (this.provider === 'mock') {
      this.logger.warn(
        'Email is NOT sent (EMAIL_PROVIDER=mock or credentials empty): OTP codes are printed to this log. See .env.example.',
      );
    } else {
      this.logger.log(
        `MailService initialized with provider: ${this.provider.toUpperCase()} (From: ${this.from})`,
      );
    }
  }

  /**
   * Gửi OTP với cấu trúc chuẩn hoá để kích hoạt tính năng thông minh của Gmail (nút "Sao chép mã" native).
   */
  async sendOtp(to: string, options: OtpEmailOptions): Promise<void> {
    const { subject, text, html } = buildOtpEmail(options);
    await this.send(to, subject, text, html);
  }

  async send(to: string, subject: string, text: string, html?: string): Promise<void> {
    if (this.provider === 'mock') {
      this.logger.log(`[mail:console] to=${to} | ${subject}\n${text}`);
      return;
    }

    if (this.provider === 'resend' && this.resend) {
      try {
        const { data, error } = await this.resend.emails.send({
          from: this.from,
          to,
          subject,
          text,
          html: html || this.wrapDefaultHtml(subject, text),
        });
        if (error) {
          this.logger.error(`[mail:resend] error sending "${subject}" to ${to}: ${error.message}`);
        } else {
          this.logger.log(
            `[mail:resend] sent to ${to} (id: ${data?.id}) | ${subject.replace(/\d{6}/, '******')}`,
          );
        }
      } catch (err) {
        this.logger.error(`[mail:resend] failed to send "${subject}" to ${to}: ${String(err)}`);
      }
      return;
    }

    if (this.provider === 'smtp' && this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.from,
          to,
          subject,
          text,
          html: html || this.wrapDefaultHtml(subject, text),
        });
        this.logger.log(`[mail:smtp] sent to ${to} | ${subject.replace(/\d{6}/, '******')}`);
      } catch (err) {
        this.logger.error(`[mail:smtp] failed to send "${subject}" to ${to}: ${String(err)}`);
      }
    }
  }

  private wrapDefaultHtml(subject: string, text: string): string {
    const formattedBody = text
      .split('\n\n')
      .map(
        (p) =>
          `<p style="margin: 0 0 16px 0; line-height: 1.6; color: #cbd5e1;">${p.replace(/\n/g, '<br/>')}</p>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 32px 0; background-color: #080d0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding: 12px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="560" style="background-color: #0e1612; border-radius: 12px; border: 1px solid #1c2e26; overflow: hidden; box-shadow: 0 12px 30px -5px rgba(0, 0, 0, 0.7);">
          <tr>
            <td height="4" style="background-color: #315D4B; font-size: 1px; line-height: 1px;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding: 32px 40px; font-size: 15px; line-height: 1.6; color: #94a3b8;">
              <div style="font-size: 22px; font-weight: 800; letter-spacing: 2px; color: #f8fafc; text-transform: uppercase; margin-bottom: 4px;">
                TMEC
              </div>
              <div style="font-size: 12px; font-weight: 500; color: #6ee7b7; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 24px;">
                Hệ thống Quản lý Huấn luyện Ngựa đua
              </div>
              <h3 style="color: #f1f5f9; margin-top: 0; margin-bottom: 18px; font-size: 17px; font-weight: 600;">${subject}</h3>
              <div>
                ${formattedBody}
              </div>
              <div style="border-top: 1px solid #1c2e26; margin-top: 28px; padding-top: 16px; font-size: 12px; color: #52635a;">
                © ${new Date().getFullYear()} TMEC Racehorse Training & Management System. All rights reserved.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}
