import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { BodySide, SeverityLevel } from '@prisma/client';

export class CreateInjuryDto {
  @IsUUID()
  horseId: string;

  @IsOptional()
  @IsUUID()
  medicalRecordId?: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  coordinateX: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  coordinateY: number;

  @IsString()
  anatomicalZone: string;

  @IsOptional()
  @IsEnum(BodySide)
  bodySide?: BodySide;

  @IsString()
  injuryType: string;

  @IsOptional()
  @IsEnum(SeverityLevel)
  severity?: SeverityLevel;

  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsString()
  treatmentProtocol?: string;

  @IsOptional()
  @IsString()
  prescription?: string;
}
