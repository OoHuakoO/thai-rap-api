import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { ValidationAppException } from '../src/common/exceptions/app.exception';
import type { ValidationError } from 'class-validator';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let _prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: (errors: ValidationError[]) => {
          const details = errors.flatMap((e) =>
            Object.values(e.constraints ?? {}).map((msg) => ({
              field: e.property,
              message: msg,
            })),
          );
          return new ValidationAppException(details);
        },
      }),
    );
    await app.init();
    _prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Test Admin',
          email: 'test-admin@example.com',
          password: 'P@ssw0rd123',
          role: 'ADMIN',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('test-admin@example.com');
      expect(res.body.data.user.password).toBeUndefined();
      expect(res.body.data.tokens.accessToken).toBeDefined();
    });

    it('should return 409 when email already exists', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          name: 'Test Admin',
          email: 'test-admin@example.com',
          password: 'P@ssw0rd123',
          role: 'ADMIN',
        })
        .expect(409);
    });

    it('should return 422 when email is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ name: 'Test', email: 'not-an-email', password: 'P@ssw0rd123', role: 'ADMIN' })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALID_001');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test-admin@example.com', password: 'P@ssw0rd123' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens.accessToken).toBeDefined();
    });

    it('should return 401 with invalid password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test-admin@example.com', password: 'wrongpassword' })
        .expect(401);

      expect(res.body.error.code).toBe('AUTH_001');
    });
  });
});
