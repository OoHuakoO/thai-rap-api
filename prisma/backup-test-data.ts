import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL as string) });

// Dumps the same transactional tables reset-test-data.ts wipes (Store,
// StoreDocument, Assessment, Score, RedFlag, Evidence) to a timestamped JSON
// file, so a reset can be undone by hand if needed. Run manually before
// `reset-test-data.ts`, never in CI/prod.

async function main(): Promise<void> {
  const [store, storeDocument, assessment, score, redFlag, evidence] = await Promise.all([
    prisma.store.findMany({}),
    prisma.storeDocument.findMany({}),
    prisma.assessment.findMany({}),
    prisma.score.findMany({}),
    prisma.redFlag.findMany({}),
    prisma.evidence.findMany({}),
  ]);

  const backup = { store, storeDocument, assessment, score, redFlag, evidence };

  const dir = join(__dirname, 'backups');
  mkdirSync(dir, { recursive: true });
  const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const filePath = join(dir, filename);
  writeFileSync(filePath, JSON.stringify(backup, null, 2));

  console.log('Backed up:', {
    store: store.length,
    storeDocument: storeDocument.length,
    assessment: assessment.length,
    score: score.length,
    redFlag: redFlag.length,
    evidence: evidence.length,
  });
  console.log('Written to:', filePath);
}

main()
  .catch((error: unknown) => {
    console.error('FAILED:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
