// DTO của quản lý tài khoản và hồ sơ cá nhân. DTO chỉ kiểm tra kiểu dữ liệu; luật nghiệp vụ
// nằm ở service để trả đúng mã lỗi FE đọc.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class InviteAccountDto {
  @ApiProperty({ example: 'Ngô Thanh Tùng' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'tung.ngo@gmail.com' })
  @IsString()
  email: string;

  @ApiProperty({
    example: 'GROOM',
    description: 'HEAD_TRAINER | VETERINARIAN | GROOM | CLUB_MANAGER',
  })
  @IsString()
  role: string;
}

export class UpdateAccountDto {
  @ApiProperty({ example: 'Trần Văn Nam' })
  @IsString()
  fullName: string;

  @ApiPropertyOptional({ example: '0912 445 118' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class ReasonDto {
  @ApiPropertyOptional({ example: 'Contract ended on 30 June 2026.', maxLength: 300 })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdatePermissionsDto {
  @ApiProperty({ example: { editHorses: true, viewAudit: false } })
  @IsObject()
  permissions: Record<string, unknown>;
}

export class UpdateProfileDto {
  @ApiProperty({ example: 'Mai Quang Minh' })
  @IsString()
  fullName: string;

  @ApiPropertyOptional({ example: '0989 100 200' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateNotificationDto {
  @ApiProperty({ example: 'dailyDigest' })
  @IsString()
  key: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  value: boolean;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  current: string;

  @ApiProperty()
  @IsString()
  next: string;
}
