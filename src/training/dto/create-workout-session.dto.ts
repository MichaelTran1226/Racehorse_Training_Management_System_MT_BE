import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { INTENSITIES, WORKOUT_SURFACES, WORKOUT_TYPES } from '../training-rules';

/** DL-2.01 Thêm buổi tập (HT). Luật nghiệp vụ (khóa y tế, 3 buổi/ngày...) kiểm ở service. */
export class CreateWorkoutSessionDto {
  @ApiProperty({
    description: 'Ngày + giờ bắt đầu (ISO 8601, nên kèm múi giờ)',
    example: '2026-10-15T06:30:00+07:00',
  })
  @IsNotEmpty({ message: 'Ngày tập là bắt buộc.' })
  @IsISO8601({}, { message: 'Ngày tập không hợp lệ.' })
  scheduledDate: string;

  @ApiProperty({ description: 'Giai đoạn của giáo án (id trong TrainingPlan.phases)' })
  @IsNotEmpty({ message: 'Vui lòng chọn giai đoạn.' })
  @IsString()
  phaseId: string;

  @ApiProperty({ enum: WORKOUT_TYPES, description: 'Loại bài tập' })
  @IsIn([...WORKOUT_TYPES], { message: 'Vui lòng chọn loại bài tập.' })
  workoutType: string;

  @ApiProperty({ enum: INTENSITIES, description: 'Cường độ' })
  @IsIn([...INTENSITIES], { message: 'Vui lòng chọn cường độ.' })
  intensity: string;

  @ApiProperty({ description: 'Cự ly mỗi hiệp (m)', example: 1200 })
  @IsInt({ message: 'Cự ly phải là số nguyên.' })
  @Min(100, { message: 'Cự ly phải từ 100 đến 5000 m.' })
  @Max(5000, { message: 'Cự ly phải từ 100 đến 5000 m.' })
  distanceMeters: number;

  @ApiPropertyOptional({ description: 'Số hiệp', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Số hiệp phải từ 1 đến 10.' })
  @Max(10, { message: 'Số hiệp phải từ 1 đến 10.' })
  repetitions?: number;

  @ApiPropertyOptional({ description: 'Tốc độ mục tiêu km/h (bắt buộc với BREEZE, TRIAL)' })
  @IsOptional()
  @IsNumber()
  @Min(10, { message: 'Tốc độ mục tiêu phải từ 10 đến 70 km/h.' })
  @Max(70, { message: 'Tốc độ mục tiêu phải từ 10 đến 70 km/h.' })
  targetSpeedKmh?: number;

  @ApiProperty({ enum: WORKOUT_SURFACES, description: 'Mặt sân' })
  @IsIn([...WORKOUT_SURFACES], { message: 'Vui lòng chọn mặt sân.' })
  trackSurface: string;

  @ApiPropertyOptional({ description: 'Tên nài ngựa (bắt buộc với BREEZE, TRIAL)' })
  @IsOptional()
  @IsString()
  @Length(2, 100, { message: 'Tên nài ngựa phải từ 2 đến 100 ký tự.' })
  jockeyName?: string;

  @ApiProperty({ description: 'Nhân viên chăm sóc (GROOM) phụ trách' })
  @IsNotEmpty({ message: 'Vui lòng chọn nhân viên chăm sóc.' })
  @IsString()
  assignedStaffUserId: string;

  @ApiPropertyOptional({ description: 'Ghi chú chỉ dẫn (≤ 500 ký tự)' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự.' })
  trainerNotes?: string;

  @ApiPropertyOptional({
    description:
      'DL-2.06: HT xác nhận đã trao đổi với VET khi xếp bài nặng lúc ngựa ở trạng thái y tế',
  })
  @IsOptional()
  @IsBoolean()
  vetConsulted?: boolean;

  @ApiPropertyOptional({
    description: 'Bấm Lưu lần 2 sau khi đã xem cảnh báo (vượt định mức, nặng < 48h, trùng giờ)',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeWarnings?: boolean;
}

/** DL-2.01 "Lặp lại hằng tuần": tạo nhiều buổi cùng giờ, tối đa 60 buổi mỗi lần. */
export class RepeatWorkoutDto extends CreateWorkoutSessionDto {
  @ApiProperty({
    description: 'Các thứ trong tuần: 1 = Thứ Hai ... 7 = Chủ nhật',
    example: [1, 3, 5],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Vui lòng chọn ít nhất 1 thứ trong tuần.' })
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays: number[];

  @ApiProperty({ description: 'Lặp đến ngày (YYYY-MM-DD, ≤ ngày kết thúc giai đoạn)' })
  @IsISO8601({}, { message: 'Ngày không hợp lệ.' })
  until: string;
}
