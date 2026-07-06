import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { ValidationAppException } from '../src/common/exceptions/app.exception';
import { hashPassword } from '../src/shared/hash.util';
import type { ValidationError } from 'class-validator';

describe('Assessment (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let assessorToken: string;
  let storeId: string;
  let assessmentId: string;

  const runId = Date.now();
  const adminEmail = `assess-admin-${runId}@example.com`;
  const assessorEmail = `assess-assessor-${runId}@example.com`;

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
        name: 'Assess Test Admin',
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
      name: 'Assess Test Assessor',
      email: assessorEmail,
      password: 'P@ssw0rd123',
      role: 'ASSESSOR',
    });
    assessorToken = assessorRes.body.data.tokens.accessToken;

    const storeRes = await request(app.getHttpServer())
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `ร้านประเมินทดสอบ ${runId}`,
        province: 'ชลบุรี',
        storeType: 'อาหารตามสั่ง',
        ownerName: 'สมศรี ใจดี',
        phone: '0812345678',
        address: '123 หมู่ 4 ต.บางพระ',
      });
    storeId = storeRes.body.data.id;
  });

  afterAll(async () => {
    await prisma.redFlag.deleteMany({ where: { assessmentId } });
    await prisma.score.deleteMany({ where: { assessmentId } });
    await prisma.assessment.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, assessorEmail] } } });
    await app.close();
  });

  describe('POST /api/v1/assessments', () => {
    it('creates a draft assessment with all 50 questions unscored', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${assessorToken}`)
        .send({ storeId, round: 'T0' })
        .expect(201);

      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.questions).toHaveLength(50);
      expect(
        res.body.data.questions.every((q: { rawScore: number | null }) => q.rawScore === null),
      ).toBe(true);
      assessmentId = res.body.data.id;
    });

    it('rejects a duplicate (storeId, round) assessment', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Authorization', `Bearer ${assessorToken}`)
        .send({ storeId, round: 'T0' })
        .expect(409);

      expect(res.body.error.code).toBe('ASSESS_002');
    });
  });

  describe('scoring', () => {
    it('upserts a single question score', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/assessments/${assessmentId}/scores/1`)
        .set('Authorization', `Bearer ${assessorToken}`)
        .send({ rawScore: 4 })
        .expect(200);

      expect(res.body.data.rawScore).toBe(4);
    });

    it('rejects an out-of-range score', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/assessments/${assessmentId}/scores/2`)
        .set('Authorization', `Bearer ${assessorToken}`)
        .send({ rawScore: 9 })
        .expect(422);

      expect(res.body.error.code).toBe('VALID_001');
    });

    it('bulk-scores the remaining 49 questions — question 13 (Legal) intentionally scored 0', async () => {
      const scores = Array.from({ length: 50 }, (_, i) => i + 1)
        .filter((questionNo) => questionNo !== 1)
        .map((questionId) => ({ questionId, rawScore: questionId === 13 ? 0 : 4 }));

      const res = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${assessmentId}/scores/bulk`)
        .set('Authorization', `Bearer ${assessorToken}`)
        .send({ scores })
        .expect(201);

      expect(res.body.data.scored).toBe(50);
      expect(res.body.data.total).toBe(50);
    });

    it('reports scoring progress', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assessments/${assessmentId}/scores/progress`)
        .set('Authorization', `Bearer ${assessorToken}`)
        .expect(200);

      expect(res.body.data).toEqual({ scored: 50, total: 50 });
    });
  });

  describe('POST /api/v1/assessments/:id/submit', () => {
    it('computes total score, zone, and red flags', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${assessmentId}/submit`)
        .set('Authorization', `Bearer ${assessorToken}`)
        .expect(201);

      expect(res.body.data.status).toBe('SUBMITTED');
      expect(res.body.data.totalScore).toBeCloseTo(97.857, 1);
      expect(res.body.data.zone).toBe('Model Zone');
      expect(res.body.data.redFlags).toHaveLength(1);
      expect(res.body.data.redFlags[0]).toMatchObject({
        type: 'LEGAL',
        severity: 'CRITICAL',
        triggerQuestions: [13],
      });
    });

    it('rejects scoring a submitted assessment', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/assessments/${assessmentId}/scores/1`)
        .set('Authorization', `Bearer ${assessorToken}`)
        .send({ rawScore: 2 })
        .expect(400);

      expect(res.body.error.code).toBe('ASSESS_004');
    });

    it('rejects deleting a submitted assessment', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/assessments/${assessmentId}`)
        .set('Authorization', `Bearer ${assessorToken}`)
        .expect(400);

      expect(res.body.error.code).toBe('ASSESS_003');
    });
  });
});
