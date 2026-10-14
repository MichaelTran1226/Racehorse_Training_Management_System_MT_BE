import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryTrainingPlanDto {
  @ApiPropertyOptional({ description: 'Filter by horse UUID' })
  @IsOptional()
  @IsString()
  horseId?: string;

  @ApiPropertyOptional({
    description:
      'Filter by plan lifecycle status (single status or comma-separated list, e.g. DRAFT,ACTIVE)',
    type: String,
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Search query for phase title or horse name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size limit', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}
