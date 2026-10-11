import { IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryDeletedHorseDto {
  @ApiPropertyOptional({ description: 'Tên ngựa, mã ngựa, microchip' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Xóa từ ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsISO8601({}, { message: 'Ngày không hợp lệ.' })
  from?: string;

  @ApiPropertyOptional({ description: 'Xóa đến ngày (YYYY-MM-DD, tính cả ngày này)' })
  @IsOptional()
  @IsISO8601({}, { message: 'Ngày không hợp lệ.' })
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
