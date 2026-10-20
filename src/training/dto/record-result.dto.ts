import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  ABNORMAL_SIGNS,
  COMPLETION_LEVELS,
  TRACK_CONDITIONS,
  WORKOUT_SURFACES,
} from '../training-rules';

/** SC-2.06 Ghi / sửa kết quả buổi tập (HT). Kiểm phụ thuộc giữa các ô ở service. */
export class RecordWorkoutResultDto {
  @ApiProperty({ description: 'Cự ly thực tế (m), đã gồm các hiệp' })
  @IsInt({ message: 'Cự ly thực tế phải là số nguyên.' })
  @Min(50, { message: 'Cự ly thực tế phải từ 50 đến 10 000 m.' })
  @Max(10000, { message: 'Cự ly thực tế phải từ 50 đến 10 000 m.' })
  actualDistanceMeters: number;

  @ApiPropertyOptional({
    description: 'Thời gian chạy (giây, 5.0-3599.9). Bắt buộc trừ Đi bộ, Bơi, Máy đi bộ',
  })
  @IsOptional()
  @IsNumber()
  @Min(5, { message: 'Thời gian chạy không hợp lệ.' })
  @Max(3599.9, { message: 'Thời gian chạy không hợp lệ.' })
  actualTimeSeconds?: number;

  @ApiPropertyOptional({ enum: WORKOUT_SURFACES, description: 'Mặt sân thực tế' })
  @IsOptional()
  @IsIn([...WORKOUT_SURFACES], { message: 'Vui lòng chọn mặt sân.' })
  actualSurface?: string;

  @ApiPropertyOptional({ enum: TRACK_CONDITIONS, description: 'Tình trạng mặt sân' })
  @IsOptional()
  @IsIn([...TRACK_CONDITIONS])
  trackCondition?: string;

  @ApiPropertyOptional({ description: 'Nhịp tim tối đa (bpm)' })
  @IsOptional()
  @IsInt()
  @Min(20, { message: 'Nhịp tim tối đa phải từ 20 đến 260 bpm.' })
  @Max(260, { message: 'Nhịp tim tối đa phải từ 20 đến 260 bpm.' })
  heartRatePeak?: number;

  @ApiPropertyOptional({ description: 'Nhịp tim sau 10 phút nghỉ (bpm)' })
  @IsOptional()
  @IsInt()
  @Min(20, { message: 'Nhịp tim sau 10 phút phải từ 20 đến 200 bpm.' })
  @Max(200, { message: 'Nhịp tim sau 10 phút phải từ 20 đến 200 bpm.' })
  heartRateRecovery?: number;

  @ApiPropertyOptional({ description: 'Tốc độ cao nhất (km/h)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(80)
  topSpeedKmh?: number;

  @ApiProperty({ description: 'Điểm phong độ (số nguyên 1-10)' })
  @IsInt({ message: 'Vui lòng chấm điểm phong độ.' })
  @Min(1, { message: 'Điểm phong độ phải từ 1 đến 10.' })
  @Max(10, { message: 'Điểm phong độ phải từ 1 đến 10.' })
  performanceScore: number;

  @ApiProperty({ enum: COMPLETION_LEVELS, description: 'Mức hoàn thành' })
  @IsIn([...COMPLETION_LEVELS], { message: 'Vui lòng chọn mức hoàn thành.' })
  completionLevel: string;

  @ApiProperty({ description: 'Nhận xét chuyên môn (2-2000)' })
  @IsString({ message: 'Vui lòng nhập nhận xét.' })
  @Length(2, 2000, { message: 'Nhận xét phải từ 2 đến 2000 ký tự.' })
  trainerNotes: string;

  @ApiPropertyOptional({ enum: ABNORMAL_SIGNS, isArray: true, description: 'Dấu hiệu bất thường' })
  @IsOptional()
  @IsArray()
  @IsIn([...ABNORMAL_SIGNS], { each: true })
  abnormalSignTypes?: string[];

  @ApiPropertyOptional({ description: 'Mô tả dấu hiệu (2-500, bắt buộc khi có dấu hiệu)' })
  @IsOptional()
  @IsString()
  @Length(2, 500, { message: 'Vui lòng mô tả dấu hiệu bất thường (2-500 ký tự).' })
  abnormalNotes?: string;
}
