import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** SC-2.06 Ghi kết quả buổi tập (HT). */
export class RecordWorkoutResultDto {
  @ApiPropertyOptional({ description: 'Thời gian thực tế (giây)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  actualTimeSeconds?: number;

  @ApiPropertyOptional({ description: 'Nhịp tim tối đa (bpm)' })
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(260)
  heartRatePeak?: number;

  @ApiPropertyOptional({ description: 'Nhịp tim hồi phục (bpm)' })
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(220)
  heartRateRecovery?: number;

  @ApiPropertyOptional({ description: 'Tốc độ trung bình (km/h)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(80)
  averageSpeedKmh?: number;

  @ApiPropertyOptional({ description: 'Tốc độ cao nhất (km/h)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(80)
  topSpeedKmh?: number;

  @ApiPropertyOptional({ description: 'Điểm phong độ 1-10' })
  @IsOptional()
  @IsNumber()
  @Min(1, { message: 'Điểm phong độ phải từ 1 đến 10.' })
  @Max(10, { message: 'Điểm phong độ phải từ 1 đến 10.' })
  performanceScore?: number;

  @ApiPropertyOptional({ description: 'Nhận xét chuyên môn' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  trainerNotes?: string;

  @ApiPropertyOptional({ description: 'Có dấu hiệu bất thường -> báo VET' })
  @IsOptional()
  @IsBoolean()
  abnormalSigns?: boolean;

  @ApiPropertyOptional({ description: 'Mô tả dấu hiệu bất thường (10-500, bắt buộc khi có)' })
  @IsOptional()
  @IsString()
  @Length(10, 500, { message: 'Mô tả dấu hiệu phải từ 10 đến 500 ký tự.' })
  abnormalNotes?: string;
}
