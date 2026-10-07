import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TransferHorseOwnerDto {
  @ApiProperty({
    description: 'ID của chủ sở hữu mới (Người dùng phải có vai trò HORSE_OWNER)',
    example: 'd3b07384-d113-4e89-a2a2-3f62df94dfb1',
  })
  @IsNotEmpty({ message: 'New owner ID is required.' })
  @IsString({ message: 'New owner ID must be a string.' })
  newOwnerId: string;

  @ApiProperty({
    description: 'Lý do chuyển nhượng quyền sở hữu ngựa',
    example: 'Sold via registered syndicate agreement.',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Transfer reason must be a string.' })
  reason?: string;
}
