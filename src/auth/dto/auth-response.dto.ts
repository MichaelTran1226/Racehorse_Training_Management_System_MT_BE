import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, UserStatus } from '@prisma/client';

export class UserProfileDto {
  @ApiProperty({ example: 'b7c9339e-2f1d-409b-864a-250325492194' })
  id: string;

  @ApiProperty({ example: 'manager@equiflow.com' })
  email: string;

  @ApiProperty({ example: 'Michael Tran (Club Manager)' })
  fullName: string;

  @ApiPropertyOptional({ example: '+84901234567' })
  phoneNumber?: string | null;

  @ApiProperty({ enum: Role, example: Role.CLUB_MANAGER })
  role: Role;

  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE })
  status: UserStatus;

  @ApiProperty({ example: '/manager/dashboard' })
  dashboardUrl: string;
}

export class AuthResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: '7d8f9e0a1b2c3d4e5f6a7b8c9d0e1f2a...' })
  refreshToken: string;

  @ApiProperty({ example: 900, description: 'Access token expiration in seconds' })
  expiresIn: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType: string;

  @ApiProperty({ type: UserProfileDto })
  user: UserProfileDto;
}

export class RefreshTokenResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: '7d8f9e0a1b2c3d4e5f6a7b8c9d0e1f2a...' })
  refreshToken: string;

  @ApiProperty({ example: 900, description: 'Access token expiration in seconds' })
  expiresIn: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType: string;
}
