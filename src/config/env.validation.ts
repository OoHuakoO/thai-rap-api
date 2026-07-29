import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api'),
  API_VERSION: Joi.string().default('1'),
  CORS_ORIGINS: Joi.string().default('http://localhost:3001'),

  DATABASE_URL: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  COOKIE_SAME_SITE: Joi.string().valid('strict', 'lax', 'none').default('lax'),

  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(100),

  // Leaving both SMTP_PROVIDER and SMTP_HOST unset is a supported development
  // mode: MailService logs the OTP instead of sending it, so the reset flow is
  // testable without a mail server. A provider fills in host/port/secure; an
  // explicit SMTP_HOST overrides it.
  SMTP_PROVIDER: Joi.string().valid('gmail', 'outlook', 'office365').allow('').default(''),
  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().allow('').default(''),
  SMTP_SECURE: Joi.boolean().allow('').default(''),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  // Empty means "use the authenticated mailbox" — see mail.config.ts.
  MAIL_FROM: Joi.string().allow('').default(''),
  PASSWORD_RESET_OTP_TTL_MINUTES: Joi.number().default(10),
  PASSWORD_RESET_OTP_MAX_ATTEMPTS: Joi.number().default(5),
});
