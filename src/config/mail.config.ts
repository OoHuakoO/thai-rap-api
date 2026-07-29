import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT ?? '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER,
  password: process.env.SMTP_PASSWORD,
  from: process.env.MAIL_FROM ?? 'Thai Rap <no-reply@thai-rap.local>',
  otpExpiresInMinutes: parseInt(process.env.PASSWORD_RESET_OTP_TTL_MINUTES ?? '10', 10),
  otpMaxAttempts: parseInt(process.env.PASSWORD_RESET_OTP_MAX_ATTEMPTS ?? '5', 10),
}));
