import { IsString, MaxLength, MinLength } from 'class-validator';

export class CloseMedicalRecordDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  conclusion: string;
}

export class ReopenMedicalRecordDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}
