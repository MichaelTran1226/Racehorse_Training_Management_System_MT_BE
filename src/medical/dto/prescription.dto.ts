import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePrescriptionDto {
  @IsString()
  medicationName: string;

  @IsString()
  dosage: string;

  @IsOptional()
  @IsString()
  administrationRoute?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsString()
  startDate: string;

  @IsString()
  endDate: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  withdrawalDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsNumber()
  frequencyPerDay?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  daysCount?: number;
}

export class UpdatePrescriptionDto {
  @IsOptional()
  @IsString()
  medicationName?: string;

  @IsOptional()
  @IsString()
  dosage?: string;

  @IsOptional()
  @IsString()
  administrationRoute?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  withdrawalDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class StopPrescriptionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
