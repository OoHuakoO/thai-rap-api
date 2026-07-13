import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ValidationAppException } from './common/exceptions/app.exception';
import { UPLOADS_ROOT } from '@shared/file-storage.util';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ValidationError } from 'class-validator';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  // ── Logger ─────────────────────────────────────────────────────────────────
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api');
  const apiVersion = configService.get<string>('app.apiVersion', '1');
  const corsOrigins = configService.get<string[]>('app.corsOrigins', ['http://localhost:3001']);
  const isProduction = configService.get<string>('app.env') === 'production';

  // ── Security Middleware ────────────────────────────────────────────────────
  // CORP must be cross-origin so the web app (different port) can load /uploads files
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // ── Static Files (local uploads) ───────────────────────────────────────────
  app.useStaticAssets(UPLOADS_ROOT, { prefix: '/uploads/' });

  // ── API Versioning & Prefix ────────────────────────────────────────────────
  app.setGlobalPrefix(`${apiPrefix}/v${apiVersion}`);

  // ── Validation Pipe ────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors: ValidationError[]) => {
        const details = errors.flatMap((error) => {
          if (error.constraints) {
            return Object.values(error.constraints).map((msg) => ({
              field: error.property,
              message: msg,
            }));
          }
          // Nested validation errors
          if (error.children?.length) {
            return error.children.flatMap((child) =>
              Object.values(child.constraints ?? {}).map((msg) => ({
                field: `${error.property}.${child.property}`,
                message: msg,
              })),
            );
          }
          return [];
        });
        return new ValidationAppException(details);
      },
    }),
  );

  // ── Swagger ────────────────────────────────────────────────────────────────
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Thai RAP API')
      .setDescription(
        'Thai Restaurant Acceleration Program — REST API\n\n' +
          'All endpoints return `{ success, data }` on success or `{ success, error }` on failure.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token from POST /auth/login',
        },
        'bearerAuth',
      )
      .addTag('Auth', 'Authentication — login, logout, token refresh')
      .addTag('Stores', 'Restaurant store profiles')
      .addTag('Assessment', 'Store assessments (T0–T4)')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
      customSiteTitle: 'Thai RAP API Docs',
    });
  }

  // NestJS lifecycle hooks handle Prisma disconnect via PrismaService.onModuleDestroy
  app.enableShutdownHooks();

  await app.listen(port);
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  logger.log(
    `🚀 Application running on http://localhost:${port}/${apiPrefix}/v${apiVersion}`,
    'Bootstrap',
  );
  if (!isProduction) {
    logger.log(`📖 Swagger docs at http://localhost:${port}/${apiPrefix}/docs`, 'Bootstrap');
  }
}

bootstrap();
