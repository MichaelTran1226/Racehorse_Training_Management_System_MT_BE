import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
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
  @IsIn(['LEFT', 'RIGHT'], { message: 'viewSide phải là LEFT hoặc RIGHT' })
  viewSide?: string;

  @ApiPropertyOptional({
    description: 'Lớp hiển thị: MUSCLE | BONE | TENDON_LIGAMENT',
    default: 'MUSCLE',
  })
  @IsOptional()
  @IsString()
  @IsIn(['MUSCLE', 'BONE', 'TENDON_LIGAMENT'], {
    message: 'layer phải là MUSCLE, BONE hoặc TENDON_LIGAMENT',
  })
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
  @IsIn(['ACUTE', 'SUBACUTE', 'RECOVERING', 'HEALED'], {
    message: 'stage phải là ACUTE, SUBACUTE, RECOVERING hoặc HEALED',
  })
  stage?: string;

  @ApiPropertyOptional({ description: 'Ngày phát hiện (ISO date string)' })
  @IsOptional()
  @IsDateString()
  discoveryDate?: string;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết điểm chấn thương' })
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Mô tả chi tiết chấn thương phải từ 10 ký tự trở lên' })
  @MaxLength(1000, { message: 'Mô tả chi tiết chấn thương không được vượt quá 1000 ký tự' })
  description?: string;
}
