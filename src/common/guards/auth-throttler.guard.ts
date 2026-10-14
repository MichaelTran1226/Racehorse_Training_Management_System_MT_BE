import { HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { apiError } from '../exceptions/api-error';

/**
 * C-04: giới hạn số lần gọi các API xác thực công khai theo IP (đăng nhập, đăng ký, OTP, quên mật khẩu…).
 * Vượt ngưỡng => 429 RATE_LIMITED (cùng dạng lỗi apiError để FE hiện đúng câu).
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlingException(): Promise<void> {
    throw apiError(
      HttpStatus.TOO_MANY_REQUESTS,
      'RATE_LIMITED',
      'Too many requests from this address. Try again in a minute.',
    );
  }
}
