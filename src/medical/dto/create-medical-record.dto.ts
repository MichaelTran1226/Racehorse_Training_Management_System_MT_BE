import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SeverityLevel } from '@prisma/client';

export class LabTestDto {
  @IsString()
  testType: string;

  @IsString()
  datePerformed: string;

  @IsString()
  @MinLength(5, { message: 'Lab test result must be at least 5 characters' })
  @MaxLength(2000, { message: 'Lab test result cannot exceed 2000 characters' })
  result: string;
}

export class VitalsDto {
  @IsNumber({}, { message: 'Body temperature must be a valid number' })
  @Min(35.0, { message: 'Body temperature must be between 35.0°C and 43.0°C' })
  @Max(43.0, { message: 'Body temperature must be between 35.0°C and 43.0°C' })
  temperature: number;

  @IsNumber({}, { message: 'Resting heart rate must be a valid number' })
  @Min(20, { message: 'Resting heart rate must be between 20 and 120 bpm' })
  @Max(120, { message: 'Resting heart rate must be between 20 and 120 bpm' })
  restingHeartRate: number;

  @IsNumber({}, { message: 'Respiratory rate must be a valid number' })
  @Min(4, { message: 'Respiratory rate must be between 4 and 60 breaths/min' })
  @Max(60, { message: 'Respiratory rate must be between 4 and 60 breaths/min' })
  respiratoryRate: number;

  @IsOptional()
  @IsNumber({}, { message: 'Weight must be a valid number' })
  @Min(200, { message: 'Horse weight must be between 200 and 800 kg' })
  @Max(800, { message: 'Horse weight must be between 200 and 800 kg' })
  weightKg?: number;

  @IsString()
  @MinLength(10, { message: 'Clinical examination notes must be at least 10 characters' })
  @MaxLength(4000, { message: 'Clinical examination notes cannot exceed 4000 characters' })
  clinicalExamination: string;
}

export class CreateMedicalRecordDto {
  @IsUUID('4', { message: 'Please select a valid horse' })
  horseId: string;

  @IsOptional()
  @IsString()
  examinationDate?: string;

  @IsString()
  examinationType: string;

  @IsString()
  @MinLength(5, { message: 'Reason for examination must be at least 5 characters' })
  @MaxLength(500, { message: 'Reason for examination cannot exceed 500 characters' })
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Symptoms cannot exceed 2000 characters' })
  symptoms?: string;

  @IsOptional()
  @IsString()
  discoverySource?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VitalsDto)
  vitals?: VitalsDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabTestDto)
  labTests?: LabTestDto[];

  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'Definitive diagnosis must be at least 5 characters' })
  @MaxLength(1000, { message: 'Definitive diagnosis cannot exceed 1000 characters' })
  diagnosis?: string;

  @IsOptional()
  @IsEnum(SeverityLevel)
  severity?: SeverityLevel;

  @IsOptional()
  @IsString()
  recommendedHorseStatus?: string;

  @IsOptional()
  @IsBoolean()
  isDraft?: boolean;
}
