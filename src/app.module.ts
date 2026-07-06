import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

import {
  appConfig,
  authConfig,
  databaseConfig,
  throttleConfig,
  envValidationSchema,
} from './config';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { StoreModule } from './modules/store/store.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

@Module({
  imports: [
    // ── Config (global) ──────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig, databaseConfig, throttleConfig],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: true },
    }),

    // ── Logger (global) ──────────────────────────────────────────────────────
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get<string>('app.env') === 'production';
        return {
          transports: [
            new winston.transports.Console({
              format: isProduction
                ? winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.errors({ stack: true }),
                    winston.format.json(),
                  )
                : winston.format.combine(
                    winston.format.colorize(),
                    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                    winston.format.errors({ stack: true }),
                    winston.format.printf(({ timestamp, level, message, context, stack }) => {
                      const ctx = context ? `[${context}]` : '';
                      const stackTrace = stack ? `\n${stack}` : '';
                      return `${timestamp} ${ctx} ${level}: ${message}${stackTrace}`;
                    }),
                  ),
            }),
          ],
        };
      },
    }),

    // ── Rate Limiting ────────────────────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttl', 60000),
            limit: config.get<number>('throttle.limit', 100),
          },
        ],
      }),
    }),

    // ── Database ─────────────────────────────────────────────────────────────
    PrismaModule,

    // ── Feature Modules ──────────────────────────────────────────────────────
    AuthModule,
    StoreModule,
    AssessmentModule,
  ],

  providers: [
    // Global exception filter — catches all unhandled exceptions
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },

    // Global JWT guard — all routes require auth unless @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    // Global rate limiting guard
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    // Global response transform — wraps in { success: true, data: ... }
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },

    // Global request/response logging
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
