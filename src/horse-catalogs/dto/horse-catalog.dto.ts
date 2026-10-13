import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HorseCatalogType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
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

/** DL-1.13 Thêm mục danh mục Giống / Màu lông. */
export class CreateHorseCatalogItemDto {
  @ApiProperty({ enum: HorseCatalogType })
  @IsEnum(HorseCatalogType, { message: 'Loại danh mục không hợp lệ.' })
  type: HorseCatalogType;

  @ApiProperty({ example: 'THOROUGHBRED' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9_]{2,30}$/, {
    message: 'Mã chỉ gồm chữ in hoa, chữ số và dấu gạch dưới, từ 2 đến 30 ký tự.',
  })
  code: string;

  @ApiProperty({ example: 'Thoroughbred' })
  @Transform(trim)
  @IsString()
  @Length(2, 100, { message: 'Tên phải từ 2 đến 100 ký tự.' })
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  description?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt({ message: 'Thứ tự hiển thị phải từ 0 đến 9999.' })
  @Min(0, { message: 'Thứ tự hiển thị phải từ 0 đến 9999.' })
  @Max(9999, { message: 'Thứ tự hiển thị phải từ 0 đến 9999.' })
  sortOrder?: number;
}

/** DL-1.13 Sửa mục danh mục: Mã chỉ đọc, không đổi được loại. */
export class UpdateHorseCatalogItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 100, { message: 'Tên phải từ 2 đến 100 ký tự.' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt({ message: 'Thứ tự hiển thị phải từ 0 đến 9999.' })
  @Min(0, { message: 'Thứ tự hiển thị phải từ 0 đến 9999.' })
  @Max(9999, { message: 'Thứ tự hiển thị phải từ 0 đến 9999.' })
  sortOrder?: number;
}

/** BTN-1.28 / BTN-1.29 Ngừng dùng / Dùng lại. */
export class SetHorseCatalogStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

export class QueryHorseCatalogDto {
  @ApiPropertyOptional({ enum: HorseCatalogType })
  @IsOptional()
  @IsEnum(HorseCatalogType)
  type?: HorseCatalogType;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'ALL'], default: 'ALL' })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'ALL'])
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
