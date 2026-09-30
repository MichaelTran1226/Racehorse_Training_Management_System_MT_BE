import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ForbiddenDto {
  @ApiProperty({ example: 'Administration / Accounts', description: 'Màn hình bị chặn' })
  @IsString()
  screen: string;
}

export class PermissionRequestDto {
  @ApiProperty({ example: 'Audit Log' })
  @IsString()
  screen: string;

  @ApiProperty({ example: '403-2609-0072', description: 'Mã tham chiếu nhận từ /audit/forbidden' })
  @IsString()
  reference: string;
}

export class ResolvePermissionRequestDto {
  @ApiProperty({ enum: ['GRANTED', 'DISMISSED'] })
  @IsString()
  status: string;
}
