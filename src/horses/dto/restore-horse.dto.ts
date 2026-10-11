import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RestoreHorseDto {
  // Bắt buộc, trừ khi undo = true (nút Hoàn tác ngay sau khi xóa).
  @ApiPropertyOptional({ description: 'Lý do khôi phục (10-500 ký tự)' })
  @IsOptional()
  @IsString({ message: 'Vui lòng nhập lý do.' })
  @MinLength(10, { message: 'Lý do phải từ 10 đến 500 ký tự.' })
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự.' })
  reason?: string;

  @ApiPropertyOptional({ description: 'true = Hoàn tác thao tác xóa vừa làm (trong 60 giây)' })
  @IsOptional()
  @IsBoolean()
  undo?: boolean;
}
