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
  @IsNotEmpty({ message: 'Mã loại không được để trống' })
  @IsString()
  @Matches(/^[A-Z0-9_]{2,30}$/, {
    message: 'Mã chỉ gồm chữ in hoa, chữ số và dấu gạch dưới, từ 2 đến 30 ký tự',
  })
  code: string;

  @ApiProperty({ description: 'Tên loại chăm sóc (2-100 ký tự)', example: 'Tiêm phòng dại' })
  @IsNotEmpty({ message: 'Tên loại không được để trống' })
  @IsString()
  @Length(2, 100, { message: 'Tên loại phải từ 2 đến 100 ký tự' })
  name: string;

  @ApiProperty({
    enum: PreventiveType,
    description: 'Nhóm (VACCINATION | DEWORMING | FARRIER_HOOF_CARE | DENTAL)',
  })
  @IsEnum(PreventiveType, { message: 'Nhóm chăm sóc định kỳ không hợp lệ' })
  category: PreventiveType;

  @ApiProperty({ description: 'Chu kỳ lặp lại (7 - 730 ngày)', example: 180 })
  @IsInt({ message: 'Chu kỳ phải là số nguyên ngày' })
  @Min(7, { message: 'Chu kỳ tối thiểu là 7 ngày' })
  @Max(730, { message: 'Chu kỳ tối đa là 730 ngày' })
  intervalDays: number;

  @ApiPropertyOptional({ description: 'Số ngày nhắc trước (1 - 60 ngày)', default: 7 })
  @IsOptional()
  @IsInt({ message: 'Số ngày nhắc trước phải là số nguyên' })
  @Min(1, { message: 'Số ngày nhắc trước tối thiểu là 1' })
  @Max(60, { message: 'Số ngày nhắc trước tối đa là 60' })
  advanceNoticeDays?: number;

  @ApiPropertyOptional({ description: 'Áp dụng mặc định cho chiến mã mới tạo', default: true })
  @IsOptional()
  @IsBoolean()
  applyToNewHorses?: boolean;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết' })
  @IsOptional()
  @IsString()
  @Length(0, 500, { message: 'Mô tả tối đa 500 ký tự' })
  description?: string;
}

export class UpdatePreventiveTypeCatalogDto {
  @ApiPropertyOptional({ description: 'Tên loại chăm sóc (2-100 ký tự)' })
  @IsOptional()
  @IsString()
  @Length(2, 100, { message: 'Tên loại phải từ 2 đến 100 ký tự' })
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
