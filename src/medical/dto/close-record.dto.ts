import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CloseMedicalRecordDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  conclusion: string;

  // Kết quả điều trị (vd: RECOVERED, PARTIAL, UNCHANGED)
  @IsOptional()
  @IsString()
  treatmentResult?: string;
}

export class ReopenMedicalRecordDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}
