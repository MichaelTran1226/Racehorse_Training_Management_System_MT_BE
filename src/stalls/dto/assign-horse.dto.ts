import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AssignHorseDto {
  @ApiProperty({ description: 'ID ngựa cần gán' })
  @IsUUID()
  @IsNotEmpty()
  horseId: string;

  @ApiPropertyOptional({ description: 'ID người chăm sóc' })
  @IsUUID()
  @IsOptional()
  assignedGroomUserId?: string;

  @ApiPropertyOptional({ description: 'Ghi chú' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
