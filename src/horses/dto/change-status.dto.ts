import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { HorseStatus, RetireReason } from '@prisma/client';

export class ChangeHorseStatusDto {
  @ApiProperty({ enum: HorseStatus, description: 'Trạng thái mới' })
  @IsEnum(HorseStatus, { message: 'Trạng thái không hợp lệ.' })
  status: HorseStatus;

  // Bắt buộc với VET và CM (service kiểm), tùy chọn với HT.
  @ApiPropertyOptional({ description: 'Lý do chuyển trạng thái (10-500 ký tự)' })
  @IsOptional()
  @IsString({ message: 'Vui lòng nhập lý do.' })
  @MinLength(10, { message: 'Lý do phải từ 10 đến 500 ký tự.' })
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự.' })
  reason?: string;

  // Chỉ dùng khi status = RETIRED (Ngừng quản lý).
  @ApiPropertyOptional({ enum: RetireReason, description: 'Lý do ngừng quản lý' })
  @IsOptional()
  @IsEnum(RetireReason, { message: 'Vui lòng chọn lý do ngừng quản lý.' })
  retireReason?: RetireReason;
}
