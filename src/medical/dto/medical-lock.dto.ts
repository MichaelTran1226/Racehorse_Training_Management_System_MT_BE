import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { HorseStatus } from '@prisma/client';

export class CreateMedicalLockDto {
  @IsUUID()
  horseId: string;

  @IsInt()
  @Min(1)
  @Max(365)
  expectedRestDays: number;

  @IsString()
  @MinLength(5)
  lockReason: string;

  @IsString()
  @MinLength(5)
  unlockConditions: string;

  @IsOptional()
  @IsEnum(HorseStatus)
  medicalStatus?: HorseStatus;
}

export class ReleaseMedicalLockDto {
  @IsString()
  @MinLength(10)
  unlockReason: string;

  @IsOptional()
  @IsEnum(HorseStatus)
  newHorseStatus?: HorseStatus;
}

export class ExtendMedicalLockDto {
  @IsInt()
  @Min(1)
  @Max(365)
  additionalDays: number;

  @IsOptional()
  @IsString()
  recheckNotes?: string;
}
