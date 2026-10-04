import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class InjuryQueryDto {
  @ApiPropertyOptional({ description: 'Hiện chấn thương đã lành (true/false)', default: 'false' })
  @IsOptional()
  @IsString()
  includeHealed?: string;

  @ApiPropertyOptional({
    description: 'Lọc xem mô hình chấn thương tại một mốc ngày trong quá khứ',
  })
  @IsOptional()
  @IsDateString()
  asOfDate?: string;

  @ApiPropertyOptional({ description: 'Lọc theo góc nhìn: LEFT | RIGHT' })
  @IsOptional()
  @IsString()
  viewSide?: string;

  @ApiPropertyOptional({ description: 'Lọc theo lớp hiển thị: MUSCLE | BONE' })
  @IsOptional()
  @IsString()
  layer?: string;
}
