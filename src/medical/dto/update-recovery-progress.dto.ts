import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { SeverityLevel } from '@prisma/client';

export class UpdateRecoveryProgressDto {
  @ApiProperty({ description: 'Giai đoạn mới: ACUTE | SUBACUTE | RECOVERING | HEALED' })
  @IsNotEmpty({ message: 'Choose the new stage' })
  @IsString()
  @IsIn(['ACUTE', 'SUBACUTE', 'RECOVERING', 'HEALED'], {
    message: 'The stage must be one of ACUTE, SUBACUTE, RECOVERING, HEALED',
  })
  stage: string;

  @ApiPropertyOptional({ description: 'Ngày đánh giá (ISO date string)' })
  @IsOptional()
  @IsDateString({}, { message: 'The assessment date is not valid' })
  evaluationDate?: string;

  @ApiPropertyOptional({ enum: SeverityLevel, description: 'Mức độ hiện tại' })
  @IsOptional()
  @IsEnum(SeverityLevel, { message: 'The current severity is not valid' })
  currentSeverity?: SeverityLevel;

  @ApiProperty({ description: 'Ghi chú đánh giá / lý do tái phát (10-1000 ký tự)' })
  @IsNotEmpty({ message: 'Notes are required' })
  @IsString()
  @Length(10, 1000, { message: 'Notes must be 10 to 1000 characters' })
  notes: string;
}
