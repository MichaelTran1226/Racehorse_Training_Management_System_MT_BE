import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class RegisterHorseDto {
  @ApiProperty({ description: 'ID con ngựa đăng ký thi đấu', example: 'uuid-horse-123' })
  @IsUUID()
  @IsNotEmpty()
  horseId: string;

  @ApiPropertyOptional({ description: 'Ghi chú chiến thuật / Nài ngựa dự kiến' })
  @IsString()
  @IsOptional()
  notes?: string;
}
