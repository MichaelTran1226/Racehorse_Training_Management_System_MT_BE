import { ConfigService } from '@nestjs/config';

/**
 * Chìa khóa ký JWT phải lấy từ biến môi trường JWT_SECRET. Không có giá trị dự phòng:
 * thiếu biến thì dừng khởi động, tránh chạy bằng một chìa khóa ai đọc repo cũng biết.
 */
export function requireJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Add it to .env (see .env.example).');
  }
  return secret;
}
