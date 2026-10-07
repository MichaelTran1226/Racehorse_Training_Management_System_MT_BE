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
import { PlanStatus, TrackSurface } from '@prisma/client';

export class UpdateTrainingPlanDto {
  @ApiPropertyOptional({ description: 'Training phase title / name' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  phaseName?: string;

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

  @ApiPropertyOptional({ description: 'Plan status', enum: PlanStatus })
  @IsOptional()
  @IsEnum(PlanStatus)
  status?: PlanStatus;
}
