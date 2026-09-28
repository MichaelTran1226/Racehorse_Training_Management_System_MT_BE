import { Controller, Post, Get, Body, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto, LogoutDto } from './dto/refresh-token.dto';
import { AuthResponseDto, RefreshTokenResponseDto, UserProfileDto } from './dto/auth-response.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate user and issue JWT Access & Refresh tokens',
    description:
      'Validates user credentials, ensures account is ACTIVE, generates 15m Access Token & 7d Refresh Token, records immutable audit log, and resolves dedicated role dashboard URL.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful, returns JWT tokens and role dashboard URL',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid email or password',
  })
  @ApiResponse({
    status: 403,
    description: 'Account is suspended or pending verification',
  })
  async login(@Body() loginDto: LoginDto, @Req() req: Request): Promise<AuthResponseDto> {
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];
    return this.authService.login(loginDto, ipAddress, userAgent);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate and refresh JWT Access token using Refresh token',
    description:
      'Validates cryptographic refresh token against hashed database record, enforces single-use token rotation, and issues a new pair of tokens.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully with rotated refresh token',
    type: RefreshTokenResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid, expired, or previously revoked refresh token',
  })
  @ApiResponse({
    status: 403,
    description: 'User account is not active',
  })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto): Promise<RefreshTokenResponseDto> {
    return this.authService.refreshToken(refreshTokenDto);
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout and revoke active session/refresh token',
    description:
      'Revokes stored refresh token in database to prevent reuse and logs logout event in AuditLog.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
  })
  async logout(
    @Body() logoutDto: LogoutDto,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    const user = (req as any).user;
    const userId = user?.userId || user?.id;
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];
    return this.authService.logout(userId, logoutDto.refreshToken, ipAddress, userAgent);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get profile and dashboard URL for currently authenticated user',
    description:
      'Extracts identity from Bearer JWT token and retrieves fresh profile data from database.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    type: UserProfileDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing, invalid, or expired JWT Bearer token',
  })
  async getMe(@CurrentUser('userId') userId: string): Promise<UserProfileDto> {
    return this.authService.getMe(userId);
  }
}
