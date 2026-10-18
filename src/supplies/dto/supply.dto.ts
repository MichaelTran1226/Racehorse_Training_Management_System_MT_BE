import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplyCategory, SupplyUnit } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** DL-4.15 Thêm vật tư mới (CM) */
export class CreateSupplyCatalogDto {
  @ApiProperty({ example: 'SUP_HAY_ALFALFA' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9_-]{2,30}$/, {
    message: 'Mã chỉ gồm chữ in hoa, chữ số, dấu gạch dưới và gạch ngang, từ 2 đến 30 ký tự.',
  })
  code: string;

  @ApiProperty({ example: 'Cỏ khô Alfalfa' })
  @Transform(trim)
  @IsString()
  @Length(2, 150, { message: 'Tên phải từ 2 đến 150 ký tự.' })
  name: string;

  @ApiProperty({ enum: SupplyCategory, example: SupplyCategory.FEED_HAY })
  @IsEnum(SupplyCategory, { message: 'Nhóm vật tư không hợp lệ.' })
  category: SupplyCategory;

  @ApiProperty({ enum: SupplyUnit, example: SupplyUnit.KG })
  @IsEnum(SupplyUnit, { message: 'Đơn vị tính không hợp lệ.' })
  unit: SupplyUnit;

  @ApiPropertyOptional({ example: 45000, description: 'Đơn vị: VNĐ' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Đơn giá phải là số hợp lệ.' })
  @Min(0, { message: 'Đơn giá phải từ 0 đến 1.000.000.000 VNĐ.' })
  @Max(1000000000, { message: 'Đơn giá phải từ 0 đến 1.000.000.000 VNĐ.' })
  unitPrice?: number;

  @ApiPropertyOptional({ example: 7, description: 'Thời gian ngưng thuốc trước giải (ngày)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Thời gian ngưng thuốc phải là số nguyên từ 0 đến 365 ngày.' })
  @Min(0, { message: 'Thời gian ngưng thuốc phải từ 0 đến 365 ngày.' })
  @Max(365, { message: 'Thời gian ngưng thuốc phải từ 0 đến 365 ngày.' })
  withdrawalDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  description?: string;
}

/** DL-4.15 Sửa thông tin vật tư: Mã không sửa được */
export class UpdateSupplyCatalogDto {
  @ApiPropertyOptional({ example: 'Cỏ khô Alfalfa cao cấp' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 150, { message: 'Tên phải từ 2 đến 150 ký tự.' })
  name?: string;

  @ApiPropertyOptional({ enum: SupplyCategory })
  @IsOptional()
  @IsEnum(SupplyCategory, { message: 'Nhóm vật tư không hợp lệ.' })
  category?: SupplyCategory;

  @ApiPropertyOptional({ enum: SupplyUnit })
  @IsOptional()
  @IsEnum(SupplyUnit, { message: 'Đơn vị tính không hợp lệ.' })
  unit?: SupplyUnit;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Đơn giá phải là số hợp lệ.' })
  @Min(0, { message: 'Đơn giá phải từ 0 đến 1.000.000.000 VNĐ.' })
  @Max(1000000000, { message: 'Đơn giá phải từ 0 đến 1.000.000.000 VNĐ.' })
  unitPrice?: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Thời gian ngưng thuốc phải là số nguyên từ 0 đến 365 ngày.' })
  @Min(0, { message: 'Thời gian ngưng thuốc phải từ 0 đến 365 ngày.' })
  @Max(365, { message: 'Thời gian ngưng thuốc phải từ 0 đến 365 ngày.' })
  withdrawalDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  description?: string;
}

/** BTN-4.49 Ngừng dùng / Dùng lại vật tư */
export class SetSupplyStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

export class QuerySupplyCatalogDto {
  @ApiPropertyOptional({ enum: SupplyCategory })
  @IsOptional()
  @IsEnum(SupplyCategory)
  category?: SupplyCategory;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'ALL'], default: 'ALL' })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'ALL'])
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
