import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Trạng thái ô người dùng được chọn (SC-1.07). OCCUPIED do hệ thống tự đặt khi gán ngựa. */
export const SETTABLE_STALL_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'INACTIVE'] as const;
export type SettableStallStatus = (typeof SETTABLE_STALL_STATUSES)[number];

/** DL-1.14 Thêm khu chuồng. */
export class CreateZoneDto {
  @ApiProperty({ example: 'A' })
  @Transform(upper)
  @Matches(/^[A-Z0-9-]{1,20}$/, {
    message: 'Mã khu chỉ gồm chữ in hoa, chữ số và dấu gạch ngang, tối đa 20 ký tự.',
  })
  code: string;

  @ApiProperty({ example: 'Khu A' })
  @Transform(trim)
  @IsString()
  @Length(2, 100, { message: 'Tên khu phải từ 2 đến 100 ký tự.' })
  name: string;

  @ApiProperty({ default: 1 })
  @IsInt()
  @Min(1, { message: 'Số hàng phải từ 1 đến 30.' })
  @Max(30, { message: 'Số hàng phải từ 1 đến 30.' })
  rows: number;

  @ApiProperty({ default: 1 })
  @IsInt()
  @Min(1, { message: 'Số cột phải từ 1 đến 30.' })
  @Max(30, { message: 'Số cột phải từ 1 đến 30.' })
  cols: number;

  @ApiPropertyOptional({ description: 'Tự tạo ô cho toàn bộ lưới, mã {Mã khu}-{số thứ tự}' })
  @IsOptional()
  @IsBoolean()
  autoCreateStalls?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  description?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Thứ tự hiển thị phải từ 0 đến 9999.' })
  @Max(9999, { message: 'Thứ tự hiển thị phải từ 0 đến 9999.' })
  sortOrder?: number;
}

/** DL-1.14 Sửa khu chuồng: Mã chỉ đọc. */
export class UpdateZoneDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 100, { message: 'Tên khu phải từ 2 đến 100 ký tự.' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Số hàng phải từ 1 đến 30.' })
  @Max(30, { message: 'Số hàng phải từ 1 đến 30.' })
  rows?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Số cột phải từ 1 đến 30.' })
  @Max(30, { message: 'Số cột phải từ 1 đến 30.' })
  cols?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Thứ tự hiển thị phải từ 0 đến 9999.' })
  @Max(9999, { message: 'Thứ tự hiển thị phải từ 0 đến 9999.' })
  sortOrder?: number;
}

/** BTN-1.32 Ngừng dùng / Dùng lại khu. */
export class SetZoneStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

/** DL-1.15 Thêm ô chuồng. */
export class CreateStallDto {
  @ApiProperty({ description: 'Khu chuồng' })
  @IsUUID('all', { message: 'Vui lòng chọn khu chuồng.' })
  zoneId: string;

  @ApiProperty({ example: 'A-07' })
  @Transform(upper)
  @Matches(/^[A-Z0-9-]{2,20}$/, {
    message: 'Mã ô chỉ gồm chữ in hoa, chữ số và dấu gạch ngang, từ 2 đến 20 ký tự.',
  })
  code: string;

  @ApiProperty()
  @IsInt()
  @Min(1, { message: 'Hàng không hợp lệ.' })
  row: number;

  @ApiProperty()
  @IsInt()
  @Min(1, { message: 'Cột không hợp lệ.' })
  col: number;

  @ApiPropertyOptional({ enum: SETTABLE_STALL_STATUSES, default: 'AVAILABLE' })
  @IsOptional()
  @IsIn(SETTABLE_STALL_STATUSES, { message: 'Trạng thái ô không hợp lệ.' })
  status?: SettableStallStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự.' })
  notes?: string;
}

/** DL-1.15 Sửa ô chuồng: khu chỉ đọc. */
export class UpdateStallDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z0-9-]{2,20}$/, {
    message: 'Mã ô chỉ gồm chữ in hoa, chữ số và dấu gạch ngang, từ 2 đến 20 ký tự.',
  })
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Hàng không hợp lệ.' })
  row?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Cột không hợp lệ.' })
  col?: number;

  @ApiPropertyOptional({ enum: SETTABLE_STALL_STATUSES })
  @IsOptional()
  @IsIn(SETTABLE_STALL_STATUSES, { message: 'Trạng thái ô không hợp lệ.' })
  status?: SettableStallStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự.' })
  notes?: string;
}

/** BTN-1.35 Đổi trạng thái ô. */
export class SetStallStatusDto {
  @ApiProperty({ enum: SETTABLE_STALL_STATUSES })
  @IsIn(SETTABLE_STALL_STATUSES, { message: 'Trạng thái ô không hợp lệ.' })
  status: SettableStallStatus;
}
