import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateInjuryDto {
  @ApiProperty({ description: 'ID chiến mã' })
  @IsUUID()
  horseId: string;

  @ApiPropertyOptional({ description: 'ID bệnh án liên quan' })
  @IsOptional()
  @IsUUID()
  medicalRecordId?: string;

  @ApiProperty({ description: 'Tọa độ X chuẩn hóa (0.0 - 1.0)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  coordinateX: number;

  @ApiProperty({ description: 'Tọa độ Y chuẩn hóa (0.0 - 1.0)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  coordinateY: number;

  @ApiPropertyOptional({ description: 'Góc nhìn: LEFT | RIGHT', default: 'LEFT' })
  @IsOptional()
  @IsString()
  viewSide?: string;

  @ApiPropertyOptional({ description: 'Lớp hiển thị: MUSCLE | BONE', default: 'MUSCLE' })
  @IsOptional()
  @IsString()
  layer?: string;

  @ApiProperty({ description: 'Vùng giải phẫu' })
  @IsString()
  anatomicalZone: string;

  @ApiPropertyOptional({ enum: BodySide, default: BodySide.LEFT })
  @IsOptional()
  @IsEnum(BodySide)
  bodySide?: BodySide;

  @ApiProperty({ description: 'Loại tổn thương (Viêm gân, Rách dây chằng, Bong gân, ...)' })
  @IsString()
  injuryType: string;

  @ApiPropertyOptional({ enum: SeverityLevel, default: SeverityLevel.MODERATE })
  @IsOptional()
  @IsEnum(SeverityLevel)
  severity?: SeverityLevel;

  @ApiPropertyOptional({
    description: 'Giai đoạn ban đầu: ACUTE | SUBACUTE | RECOVERING | HEALED',
    default: 'ACUTE',
  })
  @IsOptional()
  @IsString()
  stage?: string;

  @ApiPropertyOptional({ description: 'Ngày phát hiện (ISO date string)' })
  @IsOptional()
  @IsDateString()
  discoveryDate?: string;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết điểm chấn thương' })
  @IsOptional()
  @IsString()
  description?: string;
}
