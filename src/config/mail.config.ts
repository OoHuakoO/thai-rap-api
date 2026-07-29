import { registerAs } from '@nestjs/config';

// Both providers submit over STARTTLS on 587; 465 (implicit TLS) is legacy for
// Gmail and not offered by Outlook at all.
const SMTP_PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
  gmail: { host: 'smtp.gmail.com', port: 587, secure: false },
  outlook: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
  office365: { host: 'smtp.office365.com', port: 587, secure: false },
};

export default registerAs('mail', () => {
  const preset = SMTP_PRESETS[process.env.SMTP_PROVIDER ?? ''];
  const user = process.env.SMTP_USER;

  return {
    provider: process.env.SMTP_PROVIDER ?? '',
    host: process.env.SMTP_HOST || preset?.host,
    port: parseInt(process.env.SMTP_PORT ?? '', 10) || preset?.port || 587,
    secure: process.env.SMTP_SECURE
      ? String(process.env.SMTP_SECURE) === 'true'
      : (preset?.secure ?? false),
    user,
    password: process.env.SMTP_PASSWORD,
    // Gmail and Outlook rewrite or reject a From that is not the authenticated
    // mailbox, so the signed-in address is the safe default over a made-up one.
    from:
      process.env.MAIL_FROM || (user ? `Thai Rap <${user}>` : 'Thai Rap <no-reply@thai-rap.local>'),
    otpExpiresInMinutes: parseInt(process.env.PASSWORD_RESET_OTP_TTL_MINUTES ?? '10', 10),
    otpMaxAttempts: parseInt(process.env.PASSWORD_RESET_OTP_MAX_ATTEMPTS ?? '5', 10),
  };
});
