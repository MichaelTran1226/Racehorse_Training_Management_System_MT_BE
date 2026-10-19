import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TrackSurface, TournamentStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateTournamentDto {
  @ApiProperty({ description: 'Tên giải đua', example: 'Grand Spring Cup 2026' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Ngày diễn ra giải đua (ISO string)',
    example: '2026-11-20T08:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  raceDate: string;

  @ApiProperty({ description: 'Địa điểm tổ chức', example: 'Trường đua Phú Thọ' })
  @IsString()
  @IsNotEmpty()
  location: string;

  @ApiProperty({ description: 'Cự ly thi đấu (mét)', example: 1600, minimum: 800, maximum: 3600 })
  @IsInt()
  @Min(800)
  @Max(3600)
  distanceMeters: number;

  @ApiPropertyOptional({
    description: 'Loại mặt sân',
    enum: TrackSurface,
    default: TrackSurface.TURF,
  })
  @IsEnum(TrackSurface)
  @IsOptional()
  trackType?: TrackSurface = TrackSurface.TURF;

  @ApiPropertyOptional({
    description: 'Tổng quỹ tiền thưởng (VNĐ)',
    example: 100000000,
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  prizePool?: number = 0;

  @ApiProperty({ description: 'Hạn chót đăng ký (ISO string)', example: '2026-11-15T23:59:59Z' })
  @IsDateString()
  @IsNotEmpty()
  registrationDeadline: string;

  @ApiPropertyOptional({
    description: 'Trạng thái giải đấu',
    enum: TournamentStatus,
    default: TournamentStatus.UPCOMING,
  })
  @IsEnum(TournamentStatus)
  @IsOptional()
  status?: TournamentStatus = TournamentStatus.UPCOMING;
}
