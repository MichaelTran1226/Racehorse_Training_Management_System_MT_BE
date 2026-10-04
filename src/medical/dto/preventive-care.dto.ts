import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PreventiveType } from '@prisma/client';

export class RecordPreventiveCareDto {
  @ApiPropertyOptional({ description: 'ID chiến mã (dành cho ghi nhận đơn lẻ)' })
  @IsOptional()
  @IsUUID()
  horseId?: string;

  @ApiPropertyOptional({ description: 'Danh sách ID chiến mã (dành cho ghi nhận hàng loạt)' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  horseIds?: string[];

  @ApiProperty({ description: 'ID loại chăm sóc định kỳ' })
  @IsNotEmpty({ message: 'Vui lòng chọn loại chăm sóc định kỳ' })
  @IsUUID()
  typeCatalogId: string;

  @ApiPropertyOptional({ description: 'Ngày thực hiện (ISO date string, mặc định hôm nay)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày thực hiện không hợp lệ' })
  performedDate?: string;

  @ApiPropertyOptional({
    description: 'Người thực hiện: SELF (Bác sĩ thú y) | EXTERNAL (Người ngoài)',
    default: 'SELF',
  })
  @IsOptional()
  @IsString()
  performedByMode?: string;

  @ApiPropertyOptional({ description: 'Tên người thực hiện (bắt buộc khi chọn EXTERNAL)' })
  @IsOptional()
  @IsString()
  @Length(2, 100, { message: 'Tên người thực hiện phải từ 2 đến 100 ký tự' })
  performedByName?: string;

  @ApiPropertyOptional({ description: 'Sản phẩm / Vaccine / Thuốc tẩy giun đã dùng' })
  @IsOptional()
  @IsString()
  productAdministered?: string;

  @ApiPropertyOptional({ description: 'Số lô sản phẩm' })
  @IsOptional()
  @IsString()
  @Length(0, 50, { message: 'Số lô tối đa 50 ký tự' })
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Ghi chú thêm' })
  @IsOptional()
  @IsString()
  @Length(0, 500, { message: 'Ghi chú tối đa 500 ký tự' })
  notes?: string;

  @ApiPropertyOptional({ description: 'Ngày đến hạn tiếp theo (tự tính hoặc chỉnh tay)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày đến hạn tiếp theo không hợp lệ' })
  customNextDueDate?: string;
}

export class HorseTypeSetupItemDto {
  @ApiProperty({ description: 'ID loại chăm sóc định kỳ' })
  @IsUUID()
  typeCatalogId: string;

  @ApiProperty({ description: 'Bật/tắt theo dõi loại này cho ngựa' })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({
    description: 'Ngày đến hạn đầu tiên (bắt buộc nếu bật và ngựa chưa có lịch sử)',
  })
  @IsOptional()
  @IsDateString()
  initialDueDate?: string;
}

export class SetupHorsePreventiveDto {
  @ApiProperty({ description: 'ID chiến mã' })
  @IsUUID()
  horseId: string;

  @ApiProperty({
    type: [HorseTypeSetupItemDto],
    description: 'Danh sách các loại định kỳ cần thiết lập',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HorseTypeSetupItemDto)
  schedules: HorseTypeSetupItemDto[];
}

export class PreventiveQueryDto {
  @ApiPropertyOptional({ description: 'ID chiến mã' })
  @IsOptional()
  @IsUUID()
  horseId?: string;

  @ApiPropertyOptional({
    enum: PreventiveType,
    description: 'Lọc theo nhóm: VACCINATION | DEWORMING | FARRIER_HOOF_CARE | DENTAL',
  })
  @IsOptional()
  @IsEnum(PreventiveType)
  category?: PreventiveType;

  @ApiPropertyOptional({ description: 'Lọc theo ID loại định kỳ cụ thể' })
  @IsOptional()
  @IsUUID()
  typeCatalogId?: string;

  @ApiPropertyOptional({
    description:
      'Lọc theo trạng thái: NORMAL | UPCOMING | OVERDUE | NODATA | UPCOMING_7 | UPCOMING_30',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Lọc theo khu chuồng' })
  @IsOptional()
  @IsString()
  zone?: string;

  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm (tên ngựa, mã chip, tên loại)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Trang hiện tại (default 1)' })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ description: 'Số bản ghi / trang (default 10)' })
  @IsOptional()
  @IsString()
  limit?: string;
}
