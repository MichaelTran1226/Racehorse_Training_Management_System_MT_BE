import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Gửi email (mã OTP, lời mời, kết quả duyệt tài khoản) qua SMTP.
 * EMAIL_PROVIDER=mock hoặc chưa có SMTP_USER => chỉ in nội dung ra log (tiện khi dev).
 * Lỗi gửi mail KHÔNG làm hỏng request: ghi log, người dùng có thể bấm "Resend".
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const user = config.get<string>('SMTP_USER') || '';
    const mock = (config.get<string>('EMAIL_PROVIDER') || 'mock') === 'mock';
    this.from =
      config.get<string>('EMAIL_FROM') || user || 'EquiFlow System <noreply@equiflow.com>';
    this.transporter =
      mock || !user
        ? null
        : nodemailer.createTransport({
            host: config.get<string>('SMTP_HOST'),
            port: Number(config.get<string>('SMTP_PORT') || 587),
            auth: { user, pass: config.get<string>('SMTP_PASS') || '' },
          });
    if (!this.transporter) {
      this.logger.warn(
        'Email is NOT sent (EMAIL_PROVIDER=mock or SMTP_USER empty): OTP codes are printed to this log. See .env.example.',
      );
    }
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[mail:console] to=${to} | ${subject}\n${text}`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text });
      this.logger.log(`[mail] sent to ${to} | ${subject.replace(/\d{6}/, '******')}`);
    } catch (err) {
      this.logger.error(`[mail] failed to send "${subject}" to ${to}: ${String(err)}`);
    }
  }
}
