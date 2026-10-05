import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { HorseStatus } from '@prisma/client';

export class ChangeHorseStatusDto {
  @ApiProperty({ enum: HorseStatus, description: 'Trạng thái mới' })
  @IsEnum(HorseStatus, { message: 'Trạng thái không hợp lệ.' })
  status: HorseStatus;

  @ApiProperty({ description: 'Lý do chuyển trạng thái' })
  @IsString({ message: 'Vui lòng nhập lý do.' })
  @MinLength(10, { message: 'Lý do phải từ 10 đến 500 ký tự.' })
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự.' })
  reason: string;
}
