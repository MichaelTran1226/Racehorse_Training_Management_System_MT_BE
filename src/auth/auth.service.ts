import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto, RefreshTokenResponseDto, UserProfileDto } from './dto/auth-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Hashes a raw cryptographic token with SHA-256 for secure database storage
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Maps user role to their dedicated system dashboard URL
   */
  getDashboardUrlForRole(role: Role): string {
    switch (role) {
      case Role.CLUB_MANAGER:
        return '/manager/dashboard';
      case Role.HEAD_TRAINER:
        return '/trainer/dashboard';
      case Role.VETERINARIAN:
        return '/vet/dashboard';
      case Role.GROOM:
        return '/groom/dashboard';
      case Role.HORSE_OWNER:
        return '/owner/dashboard';
      default:
        return '/dashboard';
    }
  }

  /**
   * Authenticates user credentials, validates account lifecycle, and issues tokens
   */
  async login(
    loginDto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const normalizedEmail = loginDto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordMatching = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isPasswordMatching) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Lifecycle status checks
    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException(
        'Your account has been suspended. Please contact administrator.',
      );
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new ForbiddenException(
        'Account is pending email verification. Please verify your email.',
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active.');
    }

    // Generate Access Token (15m expiry)
    const jwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };
    const accessToken = await this.jwtService.signAsync(jwtPayload);

    // Generate Refresh Token (7 days expiry)
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    // Record immutable audit log
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'AUTH_LOGIN',
          entityName: 'User',
          entityId: user.id,
          newValuesJson: JSON.stringify({ role: user.role, email: user.email }),
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });
    } catch (auditError) {
      this.logger.warn(`Failed to create audit log for login: ${auditError}`);
    }

    const dashboardUrl = this.getDashboardUrlForRole(user.role);

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status,
        dashboardUrl,
      },
    };
  }

  /**
   * Refreshes JWT tokens with strict token rotation and revocation
   */
  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<RefreshTokenResponseDto> {
    const tokenHash = this.hashToken(refreshTokenDto.refreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (storedToken.user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User account is not active');
    }

    // Token rotation: Revoke current refresh token
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    // Generate new Access and Refresh tokens
    const jwtPayload = {
      sub: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
      fullName: storedToken.user.fullName,
    };
    const newAccessToken = await this.jwtService.signAsync(jwtPayload);

    const newRawRefreshToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = this.hashToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: newTokenHash,
        userId: storedToken.user.id,
        expiresAt: newExpiresAt,
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: 900,
      tokenType: 'Bearer',
    };
  }

  /**
   * Logs out user and revokes refresh token
   */
  async logout(
    userId?: string,
    refreshToken?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revoked: false },
        data: { revoked: true },
      });
    }

    if (userId) {
      try {
        await this.prisma.auditLog.create({
          data: {
            userId,
            action: 'AUTH_LOGOUT',
            entityName: 'User',
            entityId: userId,
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
          },
        });
      } catch (auditError) {
        this.logger.warn(`Failed to create audit log for logout: ${auditError}`);
      }
    }

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  /**
   * Retrieves profile of currently authenticated user
   */
  async getMe(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      status: user.status,
      dashboardUrl: this.getDashboardUrlForRole(user.role),
    };
  }
}
