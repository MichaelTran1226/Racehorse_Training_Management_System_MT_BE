import { IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { VitalsDto } from './create-medical-record.dto';

export class CreateFollowUpDto {
  @IsOptional()
  @IsString()
  visitDate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VitalsDto)
  vitals?: VitalsDto;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  progressNotes: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adjustments?: string;
}
