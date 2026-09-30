import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class HealthBoardQueryDto {
  @ApiPropertyOptional({
    description:
      'Tab cần xem: overview, medical-records, injuries, medical-locks, preventive, observations',
    example: 'overview',
  })
  @IsOptional()
  @IsString()
  tab?: string;
}
