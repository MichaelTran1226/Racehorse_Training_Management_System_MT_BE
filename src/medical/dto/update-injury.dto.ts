import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { BodySide, SeverityLevel } from '@prisma/client';

export class UpdateInjuryDto {
  @ApiPropertyOptional({ description: 'ID bệnh án liên quan' })
  @IsOptional()
  @IsUUID()
  medicalRecordId?: string;

  @ApiPropertyOptional({ description: 'Tọa độ X chuẩn hóa (0.0 - 1.0)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  coordinateX?: number;

  @ApiPropertyOptional({ description: 'Tọa độ Y chuẩn hóa (0.0 - 1.0)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  coordinateY?: number;

  @ApiPropertyOptional({ description: 'Góc nhìn: LEFT | RIGHT' })
  @IsOptional()
  @IsString()
  viewSide?: string;

  @ApiPropertyOptional({ description: 'Lớp hiển thị: MUSCLE | BONE' })
  @IsOptional()
  @IsString()
  layer?: string;

  @ApiPropertyOptional({ description: 'Vùng giải phẫu' })
  @IsOptional()
  @IsString()
  anatomicalZone?: string;

  @ApiPropertyOptional({ enum: BodySide })
  @IsOptional()
  @IsEnum(BodySide)
  bodySide?: BodySide;

  @ApiPropertyOptional({ description: 'Loại tổn thương' })
  @IsOptional()
  @IsString()
  injuryType?: string;

  @ApiPropertyOptional({ enum: SeverityLevel })
  @IsOptional()
  @IsEnum(SeverityLevel)
  severity?: SeverityLevel;

  @ApiPropertyOptional({
    description: 'Giai đoạn hồi phục: ACUTE | SUBACUTE | RECOVERING | HEALED',
  })
  @IsOptional()
  @IsString()
  stage?: string;

  @ApiPropertyOptional({ description: 'Ngày phát hiện (ISO date string)' })
  @IsOptional()
  @IsDateString()
  discoveryDate?: string;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết' })
  @IsOptional()
  @IsString()
  description?: string;
}
