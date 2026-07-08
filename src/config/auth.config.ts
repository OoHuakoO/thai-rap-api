import { registerAs } from '@nestjs/config';

const UNIT_TO_DAYS: Record<string, number> = { s: 1 / 86400, m: 1 / 1440, h: 1 / 24, d: 1 };

function parseExpiresInToDays(expiresIn: string, fallbackDays: number): number {
  const match = /^(\d+)([smhd])$/.exec(expiresIn);
  if (!match) return fallbackDays;
  return Number(match[1]) * UNIT_TO_DAYS[match[2]];
}

const jwtRefreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';

export default registerAs('auth', () => ({
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET as string,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET as string,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresIn,
  jwtRefreshExpiresInDays: parseExpiresInToDays(jwtRefreshExpiresIn, 7),
  cookieSameSite: (process.env.COOKIE_SAME_SITE ?? 'lax') as 'strict' | 'lax' | 'none',
}));
