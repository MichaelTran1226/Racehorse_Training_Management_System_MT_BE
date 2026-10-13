import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export const CANCEL_WORKOUT_REASONS = [
  'WEATHER',
  'TRACK_CONDITION',
  'HORSE_HEALTH',
  'PLAN_CHANGE',
  'OTHER',
] as const;

/** DL-2.05 Hủy buổi tập (HT). */
export class CancelWorkoutDto {
  @ApiProperty({ enum: CANCEL_WORKOUT_REASONS })
  @IsIn([...CANCEL_WORKOUT_REASONS], { message: 'Vui lòng chọn lý do.' })
  reason: string;

  @ApiPropertyOptional({ description: 'Ghi chú (bắt buộc khi lý do là OTHER, 10-500)' })
  @IsOptional()
  @IsString()
  @Length(10, 500, { message: 'Ghi chú phải từ 10 đến 500 ký tự.' })
  note?: string;
}

/** DL-2.07 Khôi phục buổi tập bị chặn (HT), có thể dời ngày giờ. */
export class RestoreWorkoutDto {
  @ApiPropertyOptional({ description: 'Ngày + giờ mới (ISO 8601). Bỏ trống = giữ ngày cũ' })
  @IsOptional()
  @IsISO8601({}, { message: 'Ngày tập không hợp lệ.' })
  scheduledDate?: string;
}

/** DL-2.02 Kích hoạt · DL-2.04 Hoàn thành · DL-2.03 Hủy giáo án (HT). */
export class ChangePlanStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'] })
  @IsIn(['ACTIVE', 'COMPLETED', 'CANCELLED'], { message: 'Trạng thái không hợp lệ.' })
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

  @ApiPropertyOptional({ description: 'Lý do hủy (10-500, bắt buộc khi CANCELLED)' })
  @IsOptional()
  @IsString()
  @Length(10, 500, { message: 'Lý do phải từ 10 đến 500 ký tự.' })
  reason?: string;

  @ApiPropertyOptional({ description: 'Nhận xét tổng kết (10-2000, bắt buộc khi COMPLETED)' })
  @IsOptional()
  @IsString()
  @Length(10, 2000, { message: 'Nhận xét phải từ 10 đến 2000 ký tự.' })
  summary?: string;

  @ApiPropertyOptional({ description: 'Kích hoạt: chuyển ngựa Nghỉ ngơi sang Đang tập luyện' })
  @IsOptional()
  @IsBoolean()
  moveHorseToTraining?: boolean;

  @ApiPropertyOptional({ description: 'Kích hoạt: đã trao đổi với VET (ngựa ở trạng thái y tế)' })
  @IsOptional()
  @IsBoolean()
  vetConsulted?: boolean;
}

/** DL-2.08 Nhân bản giáo án (HT). Giáo án mới luôn là Nháp. */
export class ClonePlanDto {
  @ApiProperty({ description: 'Ngựa áp dụng' })
  @IsNotEmpty({ message: 'Vui lòng chọn ngựa.' })
  @IsString()
  targetHorseId: string;

  @ApiPropertyOptional({ description: 'Tên giáo án mới (mặc định "{Tên cũ} (bản sao)")' })
  @IsOptional()
  @IsString()
  @Length(3, 150, { message: 'Tên giáo án phải từ 3 đến 150 ký tự.' })
  name?: string;

  @ApiPropertyOptional({ description: 'Ngày bắt đầu mới (≥ hôm nay, mặc định hôm nay)' })
  @IsOptional()
  @IsISO8601({}, { message: 'Ngày bắt đầu không hợp lệ.' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'Sao chép buổi tập (dời ngày theo độ lệch)', default: true })
  @IsOptional()
  @IsBoolean()
  copyWorkouts?: boolean;
}

/** VET ghi nhận cảnh báo dấu hiệu bất thường sau buổi tập (FR-2.14). */
export class AcknowledgeAlertDto {
  @ApiProperty({ description: 'Nhận xét của bác sĩ thú y (2-1000)' })
  @IsString()
  @Length(2, 1000, { message: 'Nhận xét phải từ 2 đến 1000 ký tự.' })
  vetNotes: string;
}
