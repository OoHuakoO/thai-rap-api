import { registerAs } from '@nestjs/config';

const UNIT_TO_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

function parseExpiresInToSeconds(expiresIn: string, fallbackSeconds: number): number {
  const match = /^(\d+)([smhd])$/.exec(expiresIn);
  if (!match) return fallbackSeconds;
  return Number(match[1]) * UNIT_TO_SECONDS[match[2]];
}

function parseExpiresInToDays(expiresIn: string, fallbackDays: number): number {
  return parseExpiresInToSeconds(expiresIn, fallbackDays * 86400) / 86400;
}

const jwtAccessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN ?? '15m';
const jwtRefreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';

export default registerAs('auth', () => ({
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET as string,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET as string,
  jwtAccessExpiresIn,
  jwtAccessExpiresInSeconds: parseExpiresInToSeconds(jwtAccessExpiresIn, 900),
  jwtRefreshExpiresIn,
  jwtRefreshExpiresInDays: parseExpiresInToDays(jwtRefreshExpiresIn, 7),
  cookieSameSite: (process.env.COOKIE_SAME_SITE ?? 'lax') as 'strict' | 'lax' | 'none',
}));
