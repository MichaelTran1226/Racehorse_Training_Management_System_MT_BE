import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PlanStatus, TrackSurface } from '@prisma/client';
import { CreateWorkoutSessionDto } from './create-workout-session.dto';

export class CreateTrainingPlanDto {
  @ApiProperty({
    description: 'Target horse UUID',
    example: 'c0a80123-0000-0000-0000-000000000001',
  })
  @IsNotEmpty({ message: 'Horse ID is required.' })
  @IsString({ message: 'Horse ID must be a valid string.' })
  horseId: string;

  @ApiProperty({ description: 'Training phase title / name', example: 'Stamina Building Phase II' })
  @IsNotEmpty({ message: 'Phase name is required.' })
  @IsString()
  @Length(2, 120, { message: 'Phase name must be between 2 and 120 characters.' })
  phaseName: string;

  @ApiPropertyOptional({ description: 'Target average speed in km/h', example: 42.5 })
  @IsOptional()
  @IsNumber()
  @Min(5)
  targetSpeed?: number;

  @ApiPropertyOptional({ description: 'Target cumulative distance in meters', example: 1600 })
  @IsOptional()
  @IsInt()
  @Min(200)
  targetDistance?: number;

  @ApiPropertyOptional({
    description: 'Target track surface',
    enum: TrackSurface,
    default: TrackSurface.TURF,
  })
  @IsOptional()
  @IsEnum(TrackSurface)
  trackSurface?: TrackSurface;

  @ApiProperty({ description: 'Plan cycle start date (ISO 8601)', example: '2026-10-10' })
  @IsNotEmpty({ message: 'Start date is required.' })
  @IsISO8601({}, { message: 'Start date must be a valid ISO 8601 date string.' })
  startDate: string;

  @ApiProperty({ description: 'Plan cycle end date (ISO 8601)', example: '2026-11-10' })
  @IsNotEmpty({ message: 'End date is required.' })
  @IsISO8601({}, { message: 'End date must be a valid ISO 8601 date string.' })
  endDate: string;

  @ApiPropertyOptional({
    description: 'Plan status',
    enum: PlanStatus,
    default: PlanStatus.APPROVED,
  })
  @IsOptional()
  @IsEnum(PlanStatus)
  status?: PlanStatus;

  @ApiPropertyOptional({
    description: 'Multi-phase structured training plan breakdown (e.g., Conditioning, Speed, Peak)',
  })
  @IsOptional()
  phases?: any;

  @ApiPropertyOptional({
    description: 'Optional initial workout sessions',
    type: [CreateWorkoutSessionDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkoutSessionDto)
  workouts?: CreateWorkoutSessionDto[];
}
