import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { WorkoutStatus } from '@prisma/client';

export class CreateWorkoutSessionDto {
  @ApiProperty({
    description: 'Scheduled workout date (ISO 8601)',
    example: '2026-10-15T08:00:00Z',
  })
  @IsNotEmpty({ message: 'Scheduled date is required.' })
  @IsISO8601({}, { message: 'Scheduled date must be a valid ISO 8601 date string.' })
  scheduledDate: string;

  @ApiProperty({ description: 'Target distance in meters', example: 1200 })
  @IsNotEmpty({ message: 'Target distance is required.' })
  @IsInt({ message: 'Distance must be an integer in meters.' })
  @Min(100, { message: 'Distance must be at least 100 meters.' })
  distanceMeters: number;

  @ApiPropertyOptional({ description: 'Target duration in seconds', example: 75 })
  @IsOptional()
  @IsInt()
  @Min(10)
  targetDurationSeconds?: number;

  @ApiPropertyOptional({ description: 'Assigned staff or jockey user ID' })
  @IsOptional()
  @IsString()
  assignedStaffUserId?: string;

  @ApiPropertyOptional({ description: 'Trainer notes or workout instructions' })
  @IsOptional()
  @IsString()
  trainerNotes?: string;

  @ApiPropertyOptional({
    description: 'Initial status of the workout',
    enum: WorkoutStatus,
    default: WorkoutStatus.SCHEDULED,
  })
  @IsOptional()
  @IsEnum(WorkoutStatus)
  status?: WorkoutStatus;

  @ApiPropertyOptional({ description: 'Workout type', example: 'REGULAR' })
  @IsOptional()
  @IsString()
  workoutType?: string;

  @ApiPropertyOptional({ description: 'Workout intensity level', example: 'MODERATE' })
  @IsOptional()
  @IsString()
  intensity?: string;

  @ApiPropertyOptional({ description: 'Track surface', example: 'TURF' })
  @IsOptional()
  @IsString()
  trackSurface?: string;

  @ApiPropertyOptional({ description: 'Assigned jockey name', example: 'Alex Turner' })
  @IsOptional()
  @IsString()
  jockeyName?: string;

  @ApiPropertyOptional({ description: 'Starting gate number', example: 4 })
  @IsOptional()
  @IsInt()
  gateNumber?: number;

  @ApiPropertyOptional({ description: 'Average speed in km/h' })
  @IsOptional()
  averageSpeedKmh?: number;

  @ApiPropertyOptional({ description: 'Top sprint speed in km/h' })
  @IsOptional()
  topSpeedKmh?: number;

  @ApiPropertyOptional({ description: 'Recovery time in minutes post-workout' })
  @IsOptional()
  recoveryTimeMinutes?: number;

  @ApiPropertyOptional({ description: 'Calculated stamina score (1 - 100)' })
  @IsOptional()
  staminaScore?: number;

  @ApiPropertyOptional({ description: 'Injury risk level assessment', example: 'LOW' })
  @IsOptional()
  @IsString()
  injuryRiskLevel?: string;
}
