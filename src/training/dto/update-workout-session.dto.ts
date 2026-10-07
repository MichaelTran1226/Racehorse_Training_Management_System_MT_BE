import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { WorkoutStatus } from '@prisma/client';

export class UpdateWorkoutSessionDto {
  @ApiPropertyOptional({ description: 'Scheduled workout date (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  scheduledDate?: string;

  @ApiPropertyOptional({ description: 'Target distance in meters' })
  @IsOptional()
  @IsInt()
  @Min(100)
  distanceMeters?: number;

  @ApiPropertyOptional({ description: 'Target duration in seconds' })
  @IsOptional()
  @IsInt()
  @Min(10)
  targetDurationSeconds?: number;

  @ApiPropertyOptional({ description: 'Actual recorded completion time in seconds' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualTimeSeconds?: number;

  @ApiPropertyOptional({ description: 'Peak heart rate observed (bpm)' })
  @IsOptional()
  @IsInt()
  @Min(40)
  @Max(250)
  heartRatePeak?: number;

  @ApiPropertyOptional({ description: 'Recovery heart rate observed 5 mins post-workout (bpm)' })
  @IsOptional()
  @IsInt()
  @Min(40)
  @Max(200)
  heartRateRecovery?: number;

  @ApiPropertyOptional({ description: 'Calculated performance score (0 - 10)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  performanceScore?: number;

  @ApiPropertyOptional({ description: 'Trainer clinical notes or debrief' })
  @IsOptional()
  @IsString()
  trainerNotes?: string;

  @ApiPropertyOptional({ description: 'Assigned staff/jockey user ID' })
  @IsOptional()
  @IsString()
  assignedStaffUserId?: string;

  @ApiPropertyOptional({ description: 'Workout execution status', enum: WorkoutStatus })
  @IsOptional()
  @IsEnum(WorkoutStatus)
  status?: WorkoutStatus;
}
