// DTO của các luồng đăng ký / OTP / đặt lại mật khẩu. DTO chỉ kiểm tra kiểu dữ liệu;
// luật nghiệp vụ (email @gmail.com, độ mạnh mật khẩu…) nằm ở AuthService để trả đúng mã lỗi FE đọc.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const PURPOSES = ['signup', 'reset', 'invite'];

export class RegisterDto {
  @ApiProperty({ example: 'Nguyễn Hoàng Anh' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'anh.nguyen@gmail.com', description: 'Chỉ nhận địa chỉ @gmail.com' })
  @IsString()
  email: string;

  @ApiProperty({ example: 'Horse@2026', description: '≥ 8 ký tự, có chữ hoa/số/ký hiệu' })
  @IsString()
  password: string;

  @ApiProperty({ example: 'HORSE_OWNER', description: 'Chỉ HORSE_OWNER được tự đăng ký' })
  @IsString()
  role: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'anh.nguyen@gmail.com' })
  @IsString()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  code: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'anh.nguyen@gmail.com' })
  @IsString()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Vé nhận từ /auth/reset-password/verify hoặc /auth/accept-invite/verify',
  })
  @IsString()
  resetToken: string;

  @ApiProperty({ example: 'NewHorse@2026' })
  @IsString()
  password: string;
}

export class OtpQueryDto {
  @ApiProperty({ example: 'anh.nguyen@gmail.com' })
  @IsString()
  email: string;

  @ApiPropertyOptional({ enum: PURPOSES, default: 'reset' })
  @IsOptional()
  @IsIn(PURPOSES)
  purpose?: string;
}

export class ResendOtpDto extends OtpQueryDto {}
