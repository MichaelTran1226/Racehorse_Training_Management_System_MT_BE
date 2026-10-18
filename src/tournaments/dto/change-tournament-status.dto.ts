import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TournamentStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ChangeTournamentStatusDto {
  @ApiProperty({ description: 'Trạng thái mới của giải đấu', enum: TournamentStatus })
  @IsEnum(TournamentStatus)
  @IsNotEmpty()
  status: TournamentStatus;

  @ApiPropertyOptional({ description: 'Lý do đổi trạng thái (nếu có, đặc biệt khi CANCELLED)' })
  @IsString()
  @IsOptional()
  reason?: string;
}
