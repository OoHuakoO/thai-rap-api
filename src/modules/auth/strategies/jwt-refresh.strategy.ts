import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { JwtPayload } from '@common/decorators/current-user.decorator';

export interface RefreshJwtPayload extends JwtPayload {
  refreshToken: string;
}

function extractRefreshTokenFromCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.refreshToken ?? null;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractRefreshTokenFromCookie]),
      secretOrKey: configService.get<string>('auth.jwtRefreshSecret'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: { sub: string; email: string; role: string }): RefreshJwtPayload {
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      refreshToken: extractRefreshTokenFromCookie(req) ?? '',
    };
  }
}
