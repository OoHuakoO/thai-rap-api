import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL as string) });

// Wipes all transactional data while keeping seed data (Province, Dimension,
// Question — see seed.ts) and all User / RefreshToken records. Run manually, never in CI/prod.

async function main(): Promise<void> {
  const result = await prisma.$transaction(async (tx) => {
    // Delete children before parents to satisfy FK constraints.
    const evidence = await tx.evidence.deleteMany({});
    const score = await tx.score.deleteMany({});
    const redFlag = await tx.redFlag.deleteMany({});
    const assessment = await tx.assessment.deleteMany({});
    const storeDocument = await tx.storeDocument.deleteMany({});
    const store = await tx.store.deleteMany({});

    return {
      evidence: evidence.count,
      score: score.count,
      redFlag: redFlag.count,
      assessment: assessment.count,
      storeDocument: storeDocument.count,
      store: store.count,
    };
  });

  console.log('Deleted:', result);

  const remaining = {
    User: await prisma.user.count(),
    RefreshToken: await prisma.refreshToken.count(),
    Province: await prisma.province.count(),
    Dimension: await prisma.dimension.count(),
    Question: await prisma.question.count(),
  };
  console.log('Remaining:', remaining);
}

main()
  .catch((error: unknown) => {
    console.error('FAILED:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
