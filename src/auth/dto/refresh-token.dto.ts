import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Cryptographic refresh token string',
    example: 'a4f8d29b1c7e2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c',
  })
  @IsNotEmpty({ message: 'Refresh token must not be empty' })
  @IsString({ message: 'Refresh token must be a string' })
  refreshToken: string;
}

export class LogoutDto {
  @ApiPropertyOptional({
    description: 'Optional refresh token to revoke on logout',
    example: 'a4f8d29b1c7e2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c',
  })
  @IsOptional()
  @IsString({ message: 'Refresh token must be a string' })
  refreshToken?: string;
}
