import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { EMAIL_RE } from '../../common/utils/input';

export class LoginDto {
  @ApiProperty({
    example: 'manager@gmail.com',
    description: 'Registered user email address',
  })
  @IsNotEmpty({ message: 'Email must not be empty' })
  @IsEmail({}, { message: 'Must be a valid email format' })
  // Mọi luồng tài khoản chỉ nhận @gmail.com (giống đăng ký, mời, quên mật khẩu).
  @Matches(EMAIL_RE, { message: 'Email must be a @gmail.com address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @ApiProperty({
    example: 'EquiFlow@2026',
    description: 'Account password (minimum 6 characters)',
  })
  @IsNotEmpty({ message: 'Password must not be empty' })
  @IsString({ message: 'Password must be a string' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @ApiPropertyOptional({
    example: true,
    description: '"Remember me": refresh token sống 30 ngày thay vì 7 ngày',
  })
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
