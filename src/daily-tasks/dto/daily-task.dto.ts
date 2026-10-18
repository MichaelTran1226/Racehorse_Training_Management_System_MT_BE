import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { DailyTaskType } from '@prisma/client';

export class QueryDailyTasksDto {
  @ApiPropertyOptional({ description: 'Ngày cần lấy danh sách (YYYY-MM-DD), mặc định là hôm nay' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID khu chuồng (StallZone)' })
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID con ngựa' })
  @IsOptional()
  @IsUUID()
  horseId?: string;

  @ApiPropertyOptional({ enum: DailyTaskType, description: 'Lọc theo loại công việc' })
  @IsOptional()
  @IsEnum(DailyTaskType)
  taskType?: DailyTaskType;

  @ApiPropertyOptional({ description: 'Lọc công việc đã xong / chưa xong' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isCompleted?: boolean;

  @ApiPropertyOptional({
    description: 'Chỉ lấy công việc được phân công cho tôi hoặc trong ca của tôi',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  onlyMine?: boolean;

  @ApiPropertyOptional({
    description: 'Chỉ lấy công việc được phân công cho tôi hoặc trong ca của tôi (alias onlyMine)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  onlyMyTasks?: boolean;

  @ApiPropertyOptional({ description: 'Trang hiện tại', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Số lượng mục trên một trang', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}

export class GenerateDailyTasksDto {
  @ApiPropertyOptional({ description: 'Ngày sinh công việc (YYYY-MM-DD), mặc định là hôm nay' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: 'Chỉ sinh cho khu chuồng cụ thể (tuỳ chọn)' })
  @IsOptional()
  @IsUUID()
  zoneId?: string;
}

export class CompleteDailyTaskDto {
  @ApiPropertyOptional({ description: 'Ghi chú thực tế khi hoàn thành công việc' })
  @IsOptional()
  @IsString()
  notes?: string;
}
