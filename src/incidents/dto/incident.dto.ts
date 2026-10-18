import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { IncidentStatus, SeverityLevel } from '@prisma/client';

export class CreateIncidentDto {
  @ApiProperty({ description: 'ID của con ngựa gặp sự cố' })
  @IsUUID()
  @IsNotEmpty()
  horseId: string;

  @ApiPropertyOptional({ description: 'ID khu chuồng' })
  @IsOptional()
  @IsUUID()
  stallZoneId?: string;

  @ApiProperty({
    enum: SeverityLevel,
    description: 'Mức độ nghiêm trọng của sự cố',
    default: SeverityLevel.MODERATE,
  })
  @IsEnum(SeverityLevel)
  severity: SeverityLevel = SeverityLevel.MODERATE;

  @ApiPropertyOptional({
    description:
      'Danh sách các triệu chứng quan sát được (LOSS_OF_APPETITE, FEVER, COLIC, HOOF_INJURY, LAMENESS, COUGHING, WOUND, OTHER)',
    example: ['LOSS_OF_APPETITE', 'FEVER'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptoms?: string[];

  @ApiPropertyOptional({
    description: 'Danh sách các triệu chứng quan sát được (alias for symptoms)',
    example: ['LOSS_OF_APPETITE', 'FEVER'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptomsJson?: string[];

  @ApiProperty({
    description: 'Mô tả chi tiết quan sát hiện trường (diễn biến, biểu hiện, thân nhiệt...)',
  })
  @IsString()
  @IsNotEmpty()
  description: string;
}

export class ReviewIncidentDto {
  @ApiProperty({ enum: IncidentStatus, description: 'Trạng thái xử lý sự cố' })
  @IsEnum(IncidentStatus)
  status: IncidentStatus;

  @ApiPropertyOptional({
    description: 'Ghi chú chẩn đoán hoặc chỉ đạo y khoa từ Bác sĩ thú y / Quản lý',
  })
  @IsOptional()
  @IsString()
  vetNotes?: string;
}

export class QueryIncidentsDto {
  @ApiPropertyOptional({ description: 'Lọc theo ID con ngựa' })
  @IsOptional()
  @IsUUID()
  horseId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID khu chuồng (StallZone)' })
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @ApiPropertyOptional({ enum: SeverityLevel, description: 'Lọc theo mức độ nghiêm trọng' })
  @IsOptional()
  @IsEnum(SeverityLevel)
  severity?: SeverityLevel;

  @ApiPropertyOptional({ enum: IncidentStatus, description: 'Lọc theo trạng thái xử lý' })
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @ApiPropertyOptional({ description: 'Từ ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Trang hiện tại', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Số lượng mục trên một trang', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
