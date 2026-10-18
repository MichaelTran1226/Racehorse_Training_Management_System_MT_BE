import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** DL-4.16 Thêm ca trực mới (CM) */
export class CreateShiftCatalogDto {
  @ApiProperty({ example: 'SHIFT_MORNING' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9_-]{2,20}$/, {
    message:
      'Mã ca trực chỉ gồm chữ in hoa, chữ số, dấu gạch dưới và gạch ngang, từ 2 đến 20 ký tự.',
  })
  code: string;

  @ApiProperty({ example: 'Ca Sáng (05:00 - 13:00)' })
  @Transform(trim)
  @IsString()
  @Length(2, 50, { message: 'Tên ca phải từ 2 đến 50 ký tự.' })
  name: string;

  @ApiProperty({ example: '05:00', description: 'Định dạng HH:mm bước 15 phút' })
  @Transform(trim)
  @Matches(TIME_REGEX, { message: 'Giờ bắt đầu phải theo định dạng HH:mm (00:00 - 23:59).' })
  startTime: string;

  @ApiProperty({ example: '13:00', description: 'Định dạng HH:mm bước 15 phút' })
  @Transform(trim)
  @Matches(TIME_REGEX, { message: 'Giờ kết thúc phải theo định dạng HH:mm (00:00 - 23:59).' })
  endTime: string;

  @ApiPropertyOptional({ default: 0, description: 'Thứ tự hiển thị 0-99' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Thứ tự ca phải là số nguyên từ 0 đến 99.' })
  @Min(0, { message: 'Thứ tự ca phải từ 0 đến 99.' })
  @Max(99, { message: 'Thứ tự ca phải từ 0 đến 99.' })
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  description?: string;
}

/** DL-4.16 Sửa ca trực (CM) */
export class UpdateShiftCatalogDto {
  @ApiPropertyOptional({ example: 'Ca Sáng Sớm' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 50, { message: 'Tên ca phải từ 2 đến 50 ký tự.' })
  name?: string;

  @ApiPropertyOptional({ example: '05:00' })
  @IsOptional()
  @Transform(trim)
  @Matches(TIME_REGEX, { message: 'Giờ bắt đầu phải theo định dạng HH:mm (00:00 - 23:59).' })
  startTime?: string;

  @ApiPropertyOptional({ example: '13:00' })
  @IsOptional()
  @Transform(trim)
  @Matches(TIME_REGEX, { message: 'Giờ kết thúc phải theo định dạng HH:mm (00:00 - 23:59).' })
  endTime?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Thứ tự ca phải là số nguyên từ 0 đến 99.' })
  @Min(0, { message: 'Thứ tự ca phải từ 0 đến 99.' })
  @Max(99, { message: 'Thứ tự ca phải từ 0 đến 99.' })
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  description?: string;
}

/** BTN-4.52 Ngừng dùng / Dùng lại ca trực */
export class SetShiftStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

export class QueryShiftCatalogDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'ALL'], default: 'ALL' })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'ALL'])
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';

  @ApiPropertyOptional({ description: 'Truyền true để lấy cả ca Ngừng dùng' })
  @IsOptional()
  includeInactive?: string | boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
