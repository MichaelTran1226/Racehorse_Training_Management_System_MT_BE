import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { EMAIL_MAX, EMAIL_RE } from '../../common/utils/input';
import { PASSWORD_MAX } from '../../common/utils/password';

export class LoginDto {
  @ApiProperty({
    example: 'manager@gmail.com',
    description: 'Registered user email address',
  })
  @IsNotEmpty({ message: 'Email must not be empty' })
  @MaxLength(EMAIL_MAX, { message: 'Email must be at most 254 characters' })
  @IsEmail({}, { message: 'Must be a valid email format' })
  // Mọi luồng tài khoản chỉ nhận @gmail.com (giống đăng ký, mời, quên mật khẩu).
  @Matches(EMAIL_RE, { message: 'Email must be a @gmail.com address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @ApiProperty({
    example: 'EquiFlow@2026',
    description: 'Account password (8-128 characters)',
  })
  @IsNotEmpty({ message: 'Password must not be empty' })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(PASSWORD_MAX, { message: 'Password must be at most 128 characters' })
  password: string;

  @ApiPropertyOptional({
    example: true,
    description: '"Remember me": refresh token sống 30 ngày thay vì 7 ngày',
  })
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
