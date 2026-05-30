import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { JwtPayload } from '@common/decorators/current-user.decorator';

export interface RefreshJwtPayload extends JwtPayload {
  refreshToken: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      secretOrKey: configService.get<string>('auth.jwtRefreshSecret'),
      passReqToCallback: true,
    });
  }

  validate(
    req: Request & { body: { refreshToken: string } },
    payload: { sub: string; email: string; role: string },
  ): RefreshJwtPayload {
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      refreshToken: req.body.refreshToken,
    };
  }
}
