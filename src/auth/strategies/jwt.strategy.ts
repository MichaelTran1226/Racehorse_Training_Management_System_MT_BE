import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { apiError } from '../../common/exceptions/api-error';
import { permissionsOf } from '../../users/public-user';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  fullName: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const jwtSecret =
      configService.get<string>('JWT_SECRET') ||
      'equiflow-secure-jwt-secret-replace-in-production-2026';

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload || !payload.sub || !payload.role) {
      throw new UnauthorizedException('Invalid JWT token claims');
    }

    // Đọc lại tài khoản mỗi request: bị khóa / vô hiệu hóa giữa chừng thì token hết tác dụng ngay,
    // và quyền (permissions) luôn là bản mới nhất do Club Manager bật/tắt.
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw apiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Session expired');
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      permissions: permissionsOf(user),
    };
  }
}
