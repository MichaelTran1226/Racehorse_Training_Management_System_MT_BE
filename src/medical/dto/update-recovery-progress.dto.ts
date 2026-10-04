import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import { SeverityLevel } from '@prisma/client';

export class UpdateRecoveryProgressDto {
  @ApiProperty({ description: 'Giai đoạn mới: ACUTE | SUBACUTE | RECOVERING | HEALED' })
  @IsNotEmpty({ message: 'Vui lòng chọn giai đoạn mới' })
  @IsString()
  stage: string;

  @ApiPropertyOptional({ description: 'Ngày đánh giá (ISO date string)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày đánh giá không hợp lệ' })
  evaluationDate?: string;

  @ApiPropertyOptional({ enum: SeverityLevel, description: 'Mức độ hiện tại' })
  @IsOptional()
  @IsEnum(SeverityLevel, { message: 'Mức độ hiện tại không hợp lệ' })
  currentSeverity?: SeverityLevel;

  @ApiProperty({ description: 'Ghi chú đánh giá / lý do tái phát (10-1000 ký tự)' })
  @IsNotEmpty({ message: 'Ghi chú không được để trống' })
  @IsString()
  @Length(10, 1000, { message: 'Ghi chú phải từ 10 đến 1000 ký tự' })
  notes: string;
}
