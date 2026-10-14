import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListNotificationsDto {
  @ApiPropertyOptional({ example: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class MarkReadDto {
  @ApiProperty({ example: ['8f6c…'] })
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}
