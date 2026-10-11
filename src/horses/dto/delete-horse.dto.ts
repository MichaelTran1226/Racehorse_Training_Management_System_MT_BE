import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteHorseDto {
  @ApiProperty({
    description: 'Lý do xóa (10-500 ký tự)',
    example: 'Hồ sơ tạo nhầm, trùng với HR-000012.',
  })
  @IsString({ message: 'Vui lòng nhập lý do.' })
  @MinLength(10, { message: 'Lý do phải từ 10 đến 500 ký tự.' })
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự.' })
  reason: string;

  @ApiProperty({ description: 'Gõ lại tên ngựa để xác nhận (không phân biệt hoa thường)' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên ngựa để xác nhận.' })
  @IsString()
  confirmName: string;
}
