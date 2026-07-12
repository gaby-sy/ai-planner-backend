import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthService } from '../auth.service';

export interface JwtRefreshPayload {
  sub: string;
  email: string;
  jti: string; // token id — used for token rotation
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtRefreshPayload) {
    const rawToken: string = req.body?.refreshToken;
    if (!rawToken) throw new UnauthorizedException('No refresh token provided');

    const tokenRecord = await this.authService.validateRefreshToken(
      payload.sub,
      rawToken,
    );

    if (!tokenRecord) throw new UnauthorizedException('Invalid refresh token');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException('User not found');

    return { ...user, refreshTokenId: tokenRecord.id };
  }
}