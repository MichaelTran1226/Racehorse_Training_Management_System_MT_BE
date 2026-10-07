import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReturnStallDto {
  @ApiPropertyOptional({ description: 'Ghi chú trả ô' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
