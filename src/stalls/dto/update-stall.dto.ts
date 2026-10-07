import { PartialType } from '@nestjs/swagger';
import { CreateStallDto } from './create-stall.dto';
import { StallStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateStallDto extends PartialType(CreateStallDto) {
  @ApiPropertyOptional({ enum: StallStatus })
  @IsEnum(StallStatus)
  @IsOptional()
  status?: StallStatus;
}
