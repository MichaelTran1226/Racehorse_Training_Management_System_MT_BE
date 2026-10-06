import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class FinalizeRecordDto {
  @IsOptional()
  @IsBoolean()
  applyProposedStatus?: boolean;

  @IsOptional()
  @IsBoolean()
  proposeMedicalLock?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  lockExpectedRestDays?: number;

  @IsOptional()
  @IsString()
  lockReason?: string;

  @IsOptional()
  @IsString()
  lockUnlockConditions?: string;
}
