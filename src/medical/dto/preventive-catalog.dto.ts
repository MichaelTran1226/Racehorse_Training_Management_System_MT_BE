import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  Length,
} from 'class-validator';
import { PreventiveType } from '@prisma/client';

export class CreatePreventiveTypeCatalogDto {
  @ApiProperty({ description: 'Mã loại (in hoa, 2-30 ký tự: A-Z, 0-9, _)', example: 'VAC_RABIES' })
  @IsNotEmpty({ message: 'The type code is required' })
  @IsString()
  @Matches(/^[A-Z0-9_]{2,30}$/, {
    message: 'The code uses capital letters, digits and underscores, 2 to 30 characters',
  })
  code: string;

  @ApiProperty({ description: 'Tên loại chăm sóc (2-100 ký tự)', example: 'Tiêm phòng dại' })
  @IsNotEmpty({ message: 'The type name is required' })
  @IsString()
  @Length(2, 100, { message: 'The type name must be 2 to 100 characters' })
  name: string;

  @ApiProperty({
    enum: PreventiveType,
    description: 'Nhóm (VACCINATION | DEWORMING | FARRIER_HOOF_CARE | DENTAL)',
  })
  @IsEnum(PreventiveType, { message: 'The preventive care category is not valid' })
  category: PreventiveType;

  @ApiProperty({ description: 'Chu kỳ lặp lại (7 - 730 ngày)', example: 180 })
  @IsInt({ message: 'The interval must be a whole number of days' })
  @Min(7, { message: 'The interval must be at least 7 days' })
  @Max(730, { message: 'The interval can be at most 730 days' })
  intervalDays: number;

  @ApiPropertyOptional({ description: 'Số ngày nhắc trước (1 - 60 ngày)', default: 7 })
  @IsOptional()
  @IsInt({ message: 'The reminder days must be a whole number' })
  @Min(1, { message: 'The reminder days must be at least 1' })
  @Max(60, { message: 'The reminder days can be at most 60' })
  advanceNoticeDays?: number;

  @ApiPropertyOptional({ description: 'Áp dụng mặc định cho chiến mã mới tạo', default: true })
  @IsOptional()
  @IsBoolean()
  applyToNewHorses?: boolean;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết' })
  @IsOptional()
  @IsString()
  @Length(0, 500, { message: 'The description can be at most 500 characters' })
  description?: string;
}

export class UpdatePreventiveTypeCatalogDto {
  @ApiPropertyOptional({ description: 'Tên loại chăm sóc (2-100 ký tự)' })
  @IsOptional()
  @IsString()
  @Length(2, 100, { message: 'The type name must be 2 to 100 characters' })
  name?: string;

  @ApiPropertyOptional({ description: 'Chu kỳ lặp lại (7 - 730 ngày)' })
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(730)
  intervalDays?: number;

  @ApiPropertyOptional({ description: 'Số ngày nhắc trước (1 - 60 ngày)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  advanceNoticeDays?: number;

  @ApiPropertyOptional({ description: 'Áp dụng mặc định cho chiến mã mới tạo' })
  @IsOptional()
  @IsBoolean()
  applyToNewHorses?: boolean;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Trạng thái hoạt động (true = Đang dùng, false = Ngừng dùng)',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
