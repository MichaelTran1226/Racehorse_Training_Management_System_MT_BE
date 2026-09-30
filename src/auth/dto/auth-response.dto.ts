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

  // Các trường dưới đây khớp PublicAccount bên FE (src/shared/types/auth.ts)
  @ApiPropertyOptional({ example: '0989 100 200' })
  phone?: string;

  @ApiPropertyOptional()
  createdAt?: Date;

  @ApiPropertyOptional()
  updatedAt?: Date;

  @ApiPropertyOptional({ nullable: true })
  lastActive?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  requestedAt?: Date | null;

  @ApiPropertyOptional({ example: 'REQ-2609-014', nullable: true })
  requestCode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  lockedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  invitedBy?: string | null;

  @ApiPropertyOptional({ nullable: true })
  statusReason?: string | null;

  @ApiPropertyOptional({ nullable: true })
  statusChangedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  statusChangedBy?: string | null;

  @ApiPropertyOptional({ example: { viewHorses: true, manageAccounts: true } })
  permissions?: Record<string, boolean>;

  @ApiPropertyOptional({ nullable: true })
  permissionsChangedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  permissionsChangedBy?: string | null;

  @ApiPropertyOptional({ example: { lockLifted: true, dailyDigest: false } })
  notify?: Record<string, boolean>;
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
