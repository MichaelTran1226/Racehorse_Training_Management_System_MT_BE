import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryHorseDto {
  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm (tên, mã ngựa, microchip, RFID)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc trạng thái (hoặc nhiều trạng thái cách nhau dấu phẩy)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Lọc khóa huấn luyện y tế (true/false)' })
  @IsOptional()
  @IsString()
  isMedicalLocked?: string;

  @ApiPropertyOptional({ description: 'Lọc theo giống ngựa' })
  @IsOptional()
  @IsString()
  breed?: string;

  @ApiPropertyOptional({ description: 'Lọc theo giới tính' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: 'Trường sắp xếp (name, horseCode, status, createdAt, dob)' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ description: 'Số trang (bắt đầu từ 1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Số dòng mỗi trang (20, 50, 100)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
