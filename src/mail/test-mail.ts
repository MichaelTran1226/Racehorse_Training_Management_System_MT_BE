import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

async function main() {
  const targetEmail = process.argv[2] || process.env.SMTP_USER || 'delivered@resend.dev';
  console.log(`\n========================================`);
  console.log(`EquiFlow Mail Service Test Script`);
  console.log(`========================================`);
  console.log(`EMAIL_PROVIDER: ${process.env.EMAIL_PROVIDER || 'mock'}`);
  console.log(`Target Recipient: ${targetEmail}`);
  console.log(`----------------------------------------`);

  const config = new ConfigService();
  const mailService = new MailService(config);

  const otp = '346356';
  console.log(`Sending invite email with direct activation button to ${targetEmail}...`);
  await mailService.sendOtp(targetEmail, {
    code: otp,
    purpose: 'invite',
    expiresInMinutes: 48 * 60,
    userName: 'Itachi',
    brandName: 'TMEC',
    actionUrl: `http://localhost:5173/accept-invite?email=${encodeURIComponent(targetEmail)}&code=${otp}`,
    actionUrlLabel: 'KÍCH HOẠT TÀI KHOẢN & ĐẶT MẬT KHẨU',
  });
  console.log(`Finished send invocation. Check your inbox or console log above.\n`);
}

main().catch((err) => {
  console.error('Error during test-mail:', err);
  process.exit(1);
});
