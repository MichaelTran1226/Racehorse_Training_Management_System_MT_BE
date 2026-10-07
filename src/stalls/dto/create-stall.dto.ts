import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateStallDto {
  @ApiProperty({ description: 'Mã ô chuồng (VD: A-01)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;

  @ApiProperty({ description: 'Khu chuồng' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  zone: string;

  @ApiPropertyOptional({ description: 'Ghi chú' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
