import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { ValidationAppException } from '../src/common/exceptions/app.exception';
import { hashPassword } from '../src/shared/hash.util';
import type { ValidationError } from 'class-validator';

describe('Store (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let assessorToken: string;
  let storeId: string;

  const runId = Date.now();
  const adminEmail = `store-admin-${runId}@example.com`;
  const assessorEmail = `store-assessor-${runId}@example.com`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
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

    // RegisterDto blocks self-registering as ADMIN, so seed an admin directly.
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await prisma.user.create({
      data: {
        name: 'Store Test Admin',
        email: adminEmail,
        password: await hashPassword('P@ssw0rd123'),
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'P@ssw0rd123' });
    adminToken = adminLoginRes.body.data.tokens.accessToken;

    const assessorRes = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      name: 'Store Test Assessor',
      email: assessorEmail,
      password: 'P@ssw0rd123',
      role: 'ASSESSOR',
    });
    assessorToken = assessorRes.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, assessorEmail] } } });
    await app.close();
  });

  describe('POST /api/v1/stores', () => {
    it('creates a store as ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `ร้านทดสอบ ${runId}`,
          province: 'ชลบุรี',
          storeType: 'อาหารตามสั่ง',
          ownerName: 'สมศรี ใจดี',
          phone: '0812345678',
          address: '123 หมู่ 4 ต.บางพระ',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('REGISTERED');
      storeId = res.body.data.id;
    });

    it('rejects creation from a non-admin role', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/stores')
        .set('Authorization', `Bearer ${assessorToken}`)
        .send({
          name: 'Should Fail',
          province: 'ชลบุรี',
          storeType: 'อาหารตามสั่ง',
          ownerName: 'X',
          phone: '0812345678',
          address: 'X',
        })
        .expect(403);

      expect(res.body.error.code).toBe('PERM_001');
    });
  });

  describe('GET /api/v1/stores', () => {
    it('lists stores with pagination meta', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.meta.total).toBeGreaterThan(0);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('gets a store by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/stores/${storeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(storeId);
    });

    it('returns 404 for a missing store', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/stores/does-not-exist')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body.error.code).toBe('STORE_001');
    });
  });

  describe('PATCH /api/v1/stores/:id', () => {
    it('updates store fields as ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/stores/${storeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ avgRevenueMin: 20000, avgRevenueMax: 30000 })
        .expect(200);

      expect(res.body.data.avgRevenueMin).toBe(20000);
      expect(res.body.data.avgRevenueMax).toBe(30000);
    });

    it('updates store status as ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/stores/${storeId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'T0_COMPLETED' })
        .expect(200);

      expect(res.body.data.status).toBe('T0_COMPLETED');
    });
  });

  describe('DELETE /api/v1/stores/:id', () => {
    it('deletes the store as ADMIN', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/stores/${storeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/stores/${storeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });
});
