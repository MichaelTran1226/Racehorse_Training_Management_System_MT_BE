import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum UrgencyFilter {
  ALL = 'ALL',
  NORMAL = 'NORMAL',
  ATTENTION = 'ATTENTION',
  URGENT = 'URGENT',
}

export class ObservationNotesQueryDto {
  @ApiPropertyOptional({ description: 'Từ ngày (ISO date string YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (ISO date string YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ enum: UrgencyFilter, description: 'Mức độ lưu ý' })
  @IsOptional()
  @IsEnum(UrgencyFilter)
  urgency?: UrgencyFilter;
}
