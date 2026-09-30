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
  @MinLength(5)
  @MaxLength(2000)
  result: string;
}

export class VitalsDto {
  @IsNumber()
  @Min(35.0)
  @Max(43.0)
  temperature: number;

  @IsNumber()
  @Min(20)
  @Max(120)
  restingHeartRate: number;

  @IsNumber()
  @Min(4)
  @Max(60)
  respiratoryRate: number;

  @IsOptional()
  @IsNumber()
  @Min(200)
  @Max(800)
  weightKg?: number;

  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  clinicalExamination: string;
}

export class CreateMedicalRecordDto {
  @IsUUID()
  horseId: string;

  @IsOptional()
  @IsString()
  examinationDate?: string;

  @IsString()
  examinationType: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
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
  @MinLength(5)
  @MaxLength(1000)
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
