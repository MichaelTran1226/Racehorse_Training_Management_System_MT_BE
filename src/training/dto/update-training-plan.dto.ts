import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { TrackSurface } from '@prisma/client';

export class UpdateTrainingPlanDto {
  @ApiPropertyOptional({ description: 'Training phase title / name' })
  @IsOptional()
  @IsString()
  @Length(3, 150, { message: 'Tên giáo án phải từ 3 đến 150 ký tự.' })
  phaseName?: string;

  @ApiPropertyOptional({ description: 'Mục tiêu giáo án (10-1000 ký tự)' })
  @IsOptional()
  @IsString()
  @Length(10, 1000, { message: 'Mục tiêu phải từ 10 đến 1000 ký tự.' })
  objective?: string;

  @ApiPropertyOptional({ description: 'Ghi chú (≤ 1000 ký tự)' })
  @IsOptional()
  @IsString()
  @Length(0, 1000, { message: 'Ghi chú tối đa 1000 ký tự.' })
  notes?: string;

  @ApiPropertyOptional({ description: 'Target average speed in km/h' })
  @IsOptional()
  @IsNumber()
  @Min(5)
  targetSpeed?: number;

  @ApiPropertyOptional({ description: 'Target cumulative distance in meters' })
  @IsOptional()
  @IsInt()
  @Min(200)
  targetDistance?: number;

  @ApiPropertyOptional({ description: 'Target track surface', enum: TrackSurface })
  @IsOptional()
  @IsEnum(TrackSurface)
  trackSurface?: TrackSurface;

  @ApiPropertyOptional({ description: 'Plan cycle start date (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Plan cycle end date (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Multi-phase structured training plan breakdown' })
  @IsOptional()
  phases?: any;
}
