import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  Length,
} from 'class-validator';
import { HorseStatus } from '@prisma/client';

export class CreateMedicalLockDto {
  @ApiProperty({ description: 'ID chiến mã bị đặt Khóa huấn luyện' })
  @IsUUID()
  horseId: string;

  @ApiPropertyOptional({ description: 'ID bệnh án liên quan' })
  @IsOptional()
  @IsUUID()
  medicalRecordId?: string;

  @ApiPropertyOptional({
    enum: HorseStatus,
    description: 'Trạng thái y tế áp dụng (UNDER_OBSERVATION / INJURED / ISOLATED)',
    default: HorseStatus.INJURED,
  })
  @IsOptional()
  @IsEnum(HorseStatus)
  medicalStatus?: HorseStatus;

  @ApiPropertyOptional({ enum: HorseStatus, description: 'Alias cho medicalStatus' })
  @IsOptional()
  @IsEnum(HorseStatus)
  appliedMedicalStatus?: HorseStatus;

  @ApiProperty({ description: 'Lý do đặt Khóa huấn luyện (10-500 ký tự)' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do đặt khóa' })
  @IsString()
  @Length(10, 500, { message: 'Lý do phải từ 10 đến 500 ký tự' })
  lockReason: string;

  @ApiPropertyOptional({
    description: 'Ngày xem xét lại (ISO date string, từ ngày mai đến 180 ngày)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày xem xét lại không hợp lệ' })
  recheckDate?: string;

  @ApiPropertyOptional({ description: 'Số ngày nghỉ dự kiến (1 - 180 ngày)', default: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  expectedRestDays?: number;

  @ApiPropertyOptional({ description: 'Điều kiện mở khóa / ghi chú bổ sung' })
  @IsOptional()
  @IsString()
  unlockConditions?: string;
}

export class ReleaseMedicalLockDto {
  @ApiProperty({ description: 'Lý do gỡ Khóa huấn luyện / kết luận (10-500 ký tự)' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do gỡ khóa' })
  @IsString()
  @Length(10, 500, { message: 'Lý do gỡ khóa phải từ 10 đến 500 ký tự' })
  unlockReason: string;

  @ApiPropertyOptional({
    enum: HorseStatus,
    description: 'Trạng thái chiến mã sau khi gỡ khóa (RESTING / IN_TRAINING / giữ nguyên)',
  })
  @IsOptional()
  @IsEnum(HorseStatus)
  newHorseStatus?: HorseStatus;
}

export class ExtendMedicalLockDto {
  @ApiPropertyOptional({ description: 'Ngày xem xét lại mới (ISO date string)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày xem xét mới không hợp lệ' })
  recheckDate?: string;

  @ApiPropertyOptional({ description: 'Số ngày gia hạn thêm (1 - 180 ngày)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  additionalDays?: number;

  @ApiProperty({ description: 'Lý do gia hạn (10-500 ký tự)' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do gia hạn' })
  @IsString()
  @Length(10, 500, { message: 'Lý do gia hạn phải từ 10 đến 500 ký tự' })
  recheckNotes?: string;

  @ApiPropertyOptional({ description: 'Alias cho recheckNotes' })
  @IsOptional()
  @IsString()
  extendReason?: string;
}

export class MedicalLockQueryDto {
  @ApiPropertyOptional({ description: 'ID chiến mã' })
  @IsOptional()
  @IsUUID()
  horseId?: string;

  @ApiPropertyOptional({ description: 'Trạng thái khóa (true = đang khóa, false = đã gỡ)' })
  @IsOptional()
  @IsString()
  isLocked?: string;

  @ApiPropertyOptional({ description: 'Tab chế độ: ACTIVE (Đang khóa) | HISTORY (Lịch sử)' })
  @IsOptional()
  @IsString()
  tab?: string;

  @ApiPropertyOptional({ description: 'Chỉ lấy các khóa đã quá ngày xem xét (true/false)' })
  @IsOptional()
  @IsString()
  overdueOnly?: string;

  @ApiPropertyOptional({ enum: HorseStatus, description: 'Lọc theo trạng thái y tế áp dụng' })
  @IsOptional()
  @IsEnum(HorseStatus)
  appliedMedicalStatus?: HorseStatus;

  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm (tên ngựa, mã chip, mã khóa, lý do)' })
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
