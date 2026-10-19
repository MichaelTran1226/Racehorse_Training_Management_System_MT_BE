import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class SingleResultDto {
  @ApiProperty({
    description: 'ID đăng ký tham gia giải (registrationId)',
    example: 'uuid-reg-123',
  })
  @IsUUID()
  @IsNotEmpty()
  registrationId: string;

  @ApiProperty({ description: 'Thứ hạng về đích (1, 2, 3...)', example: 1 })
  @IsInt()
  @Min(1)
  finalRank: number;

  @ApiProperty({ description: 'Thời gian hoàn thành (tính bằng giây)', example: 98.45 })
  @IsNumber()
  @Min(1)
  finishTimeSeconds: number;

  @ApiPropertyOptional({
    description:
      'Tốc độ trung bình (km/h). Nếu để trống, hệ thống tự động tính = (distanceMeters / finishTimeSeconds) * 3.6',
    example: 58.5,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  avgSpeedKmh?: number;

  @ApiPropertyOptional({ description: 'Tiền thưởng đạt được (VNĐ)', example: 50000000, default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  prizeMoneyWon?: number = 0;

  @ApiPropertyOptional({ description: 'Ghi chú chính thức của trọng tài / ban giám sát' })
  @IsString()
  @IsOptional()
  officialNotes?: string;
}

export class BatchRecordResultsDto {
  @ApiProperty({ description: 'Danh sách kết quả thi đấu', type: [SingleResultDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SingleResultDto)
  results: SingleResultDto[];

  @ApiPropertyOptional({
    description:
      'Nếu true, Club Manager chốt luôn kết quả (Lock Results), chuyển giải sang COMPLETED và chia thưởng',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  lockResults?: boolean = false;
}
