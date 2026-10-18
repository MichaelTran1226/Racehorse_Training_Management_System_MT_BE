import { ApiPropertyOptional } from '@nestjs/swagger';
import { TournamentStatus, TrackSurface } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class QueryTournamentDto {
  @ApiPropertyOptional({ description: 'Trang hiện tại', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Số lượng mỗi trang', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái giải đấu', enum: TournamentStatus })
  @IsEnum(TournamentStatus)
  @IsOptional()
  status?: TournamentStatus;

  @ApiPropertyOptional({ description: 'Lọc theo loại mặt sân', enum: TrackSurface })
  @IsEnum(TrackSurface)
  @IsOptional()
  trackType?: TrackSurface;

  @ApiPropertyOptional({ description: 'Tìm kiếm theo tên giải hoặc địa điểm' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Từ ngày (raceDate)' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (raceDate)' })
  @IsDateString()
  @IsOptional()
  to?: string;
}
