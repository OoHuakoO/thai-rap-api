import 'dotenv/config';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import bcrypt from 'bcryptjs';
import {
  AssessmentStatus,
  PrismaClient,
  Role,
  Round,
  ScoreStatus,
  StoreStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import {
  buildDimensionInfos,
  computeDimensionScores,
  computeTotalScore,
  detectRedFlags,
  type ScoredQuestion,
} from '../src/modules/assessment/assessment-scoring.util';

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL as string) });

const DEFAULT_WORKBOOK = path.join(
  process.env.HOME ?? '',
  'Downloads/THAI-RAP_Excel_Template_50_Restaurants.xlsx',
);

const STORE_SHEET = '01_ข้อมูลร้าน';
const ASSESSMENT_SHEET = '02_ประเมิน50ร้าน';

const STORE_COL = { code: 1, name: 2, mainProblems: 18, goals: 21 };
const ASSESSMENT_COL = { code: 1, round: 3, firstQuestion: 5, notes: 70 };

const IMPORT_USER_EMAIL = 'import@thai-rap.local';
const IMPORT_USER_NAME = 'ผู้นำเข้าข้อมูล';
const BCRYPT_ROUNDS = 10;

interface ContactRow {
  province: string;
  ownerName?: string;
  phone?: string;
  mapsUrl?: string;
}

// The onboarding contact sheet, keyed by store code because the names on it
// differ from the workbook's by spacing, prefixes and accents ("ร้านคำนิยม" vs
// "คำนิยม", "16Brix …Café" vs "…Cafe") — matching on name silently drops rows.
const CONTACTS: Record<string, ContactRow> = {
  'RAP69-001': { province: 'ฉะเชิงเทรา' },
  'RAP69-003': {
    province: 'ฉะเชิงเทรา',
    ownerName: 'วัลย์ลิกา วนิชกุลพิทักษ์',
    phone: '0864552026',
    mapsUrl: 'https://maps.app.goo.gl/9vW8w4koJmgYJzsHA',
  },
  'RAP69-005': {
    province: 'นครนายก',
    ownerName: 'นัฐวุฒิ ดีอินทร์',
    phone: '0865202212',
    mapsUrl: 'https://maps.app.goo.gl/umWGxsazdMnFcQ6H6',
  },
  'RAP69-006': {
    province: 'ปราจีนบุรี',
    ownerName: 'อภิญญา วงษ์รักษา',
    phone: '0983987944',
    mapsUrl: 'https://maps.app.goo.gl/pyJkJWGzxYQW9X6j7',
  },
  'RAP69-007': {
    province: 'สระแก้ว',
    ownerName: 'จิรกานต์ แร่กาสินธุ์',
    phone: '0922689908',
    mapsUrl: 'https://maps.app.goo.gl/25HcZ3bH4AfNWLAp7',
  },
  'RAP69-011': {
    province: 'ชลบุรี',
    ownerName: 'เมทิกา บัวเคล้า',
    phone: '0872627868',
    mapsUrl: 'https://maps.app.goo.gl/KUguBSiNdzVxgK2D6',
  },
  'RAP69-012': {
    province: 'ชลบุรี',
    ownerName: 'อรุณทิพย์ จุมพลพงษ์',
    phone: '0924378444',
    mapsUrl: 'https://maps.app.goo.gl/L2ZZmNQ3UEabxdon6',
  },
  'RAP69-014': {
    province: 'ชลบุรี',
    ownerName: 'ปิยะพงศ์ จรุงจรรยาพงศ์',
    phone: '082369989',
    mapsUrl: 'https://maps.app.goo.gl/sAJQ4o42s2JG4dEt9',
  },
  'RAP69-018': {
    province: 'ชลบุรี',
    ownerName: 'กุลภัสสร เชื้อปิ่น',
    phone: '0836864578',
    mapsUrl: 'https://share.google/lpVKECp0ZbLKRJE4x',
  },
  'RAP69-019': {
    province: 'ชลบุรี',
    ownerName: 'สถิตย์ คำบุบผา',
    phone: '0952935365',
    mapsUrl: 'https://maps.app.goo.gl/syKVn8VGbartyEcq9',
  },
  'RAP69-020': {
    province: 'ระยอง',
    ownerName: 'อินทรีย์ ใจดี',
    phone: '0952952498',
    mapsUrl: 'https://maps.app.goo.gl/w4oR7wFYeM1LVcHG9',
  },
  'RAP69-022': {
    province: 'จันทบุรี',
    ownerName: 'ภิญญกาญจณ์ บุญมีโชติ',
    phone: '0959655826',
    mapsUrl: 'https://maps.app.goo.gl/CaMcJd7b7HZZP2uYA',
  },
  'RAP69-023': {
    province: 'จันทบุรี',
    ownerName: 'เสริมศักดิ์ มีมาก',
    phone: '0868271553',
    mapsUrl: 'https://maps.app.goo.gl/zCTsvPQkdAAbKr8j8',
  },
  'RAP69-024': {
    province: 'จันทบุรี',
    ownerName: 'วาศินี พงศ์พิศิษฎ์สกุล',
    phone: '0859915695',
    mapsUrl: 'https://maps.app.goo.gl/wUdc7eH44FCNrJgL9',
  },
  'RAP69-031': {
    province: 'ตราด',
    ownerName: 'ศรันย์วีร์ ก้องสุรกานต์',
    phone: '0948299153',
    mapsUrl: 'https://maps.app.goo.gl/kSSRWYsgnUh38Btf8',
  },
  'RAP69-032': { province: 'จันทบุรี', ownerName: 'ธัญญ์วรัตน์ ไชยณรงค์', phone: '0626383574' },
  'RAP69-033': {
    province: 'จันทบุรี',
    ownerName: 'ณัฐชานันท์ สมบัติประธาน',
    phone: '0839990905',
    mapsUrl: 'https://maps.app.goo.gl/sGLGSLkNaHQefjes6',
  },
  'RAP69-035': {
    province: 'จันทบุรี',
    ownerName: 'ชัชวาล สุขสัมพันธ์',
    phone: '0992879556',
    mapsUrl: 'https://maps.app.goo.gl/w5EyKzfzWo6vDxbT8',
  },
  'RAP69-037': {
    province: 'จันทบุรี',
    ownerName: 'ณปภัช ศุภกุลโรจน์',
    phone: '0654552429',
    mapsUrl: 'https://maps.app.goo.gl/x8NnWS9w1Bo66gYu8',
  },
  'RAP69-038': {
    province: 'จันทบุรี',
    ownerName: 'พราว พิทยาพิบูล',
    phone: '0961545346',
    mapsUrl: 'https://maps.app.goo.gl/NcP57wANR4yw5QCf8',
  },
  'RAP69-040': {
    province: 'จันทบุรี',
    ownerName: 'กนกนภา นพกูลวงศ์',
    phone: '0863607161',
    mapsUrl: 'https://maps.app.goo.gl/rkXBw67sRAjeBTqs7',
  },
  'RAP69-041': {
    province: 'จันทบุรี',
    ownerName: 'หทัยรักษ์ ศิริเจริญธรรม',
    phone: '0942399445',
    mapsUrl: 'https://maps.app.goo.gl/NkZMqTWs6Z4oSfCk9',
  },
  'RAP69-042': {
    province: 'ชลบุรี',
    ownerName: 'ปภัสสร ปั้นเหน่งเพชร',
    phone: '0644645655',
    mapsUrl: 'https://share.google/SPWw0uLUZuDQQnT9m',
  },
};

function cellText(cell: ExcelJS.Cell): string | null {
  const value = cell.value;
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'object' && 'result' in value ? value.result : value;
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  return text === '' ? null : text;
}

function cellNumber(cell: ExcelJS.Cell): number | null {
  const text = cellText(cell);
  if (text === null) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

// Free-text cells hold a numbered list in one cell ("1.…\n2.…"). Split on the
// line breaks the author actually used and drop the leading enumeration, so the
// JSON array matches what the tag inputs on the web form produce.
function toList(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter((line) => line.length > 0);
}

async function upsertImportUser(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: IMPORT_USER_EMAIL },
    select: { id: true },
  });
  if (existing) {
    console.log(`Import user already exists: ${IMPORT_USER_EMAIL}`);
    return existing.id;
  }
  // Generated rather than defaulted: a SUPER_ADMIN with a known password baked
  // into a committed script is a standing account takeover. Printed once here
  // and nowhere else — reset it from the app if it is not captured.
  const password = randomBytes(18).toString('base64url');
  const created = await prisma.user.create({
    data: {
      name: IMPORT_USER_NAME,
      email: IMPORT_USER_EMAIL,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
    select: { id: true },
  });
  console.log(`Created import user ${IMPORT_USER_EMAIL}`);
  console.log(`  one-time password: ${password}`);
  return created.id;
}

async function importStores(sheet: ExcelJS.Worksheet): Promise<Map<string, string>> {
  const idByCode = new Map<string, string>();

  for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo += 1) {
    const row = sheet.getRow(rowNo);
    const code = cellText(row.getCell(STORE_COL.code));
    const name = cellText(row.getCell(STORE_COL.name));
    if (!code || !name) continue;

    const contact = CONTACTS[code];
    const data = {
      name,
      province: contact?.province ?? null,
      ownerName: contact?.ownerName ?? null,
      phone: contact?.phone ?? null,
      socialLinks: contact?.mapsUrl ? { maps: contact.mapsUrl } : {},
      mainProblems: toList(cellText(row.getCell(STORE_COL.mainProblems))),
      goals: toList(cellText(row.getCell(STORE_COL.goals))),
    };

    const store = await prisma.store.upsert({
      where: { code },
      update: data,
      create: { code, ...data },
      select: { id: true },
    });
    idByCode.set(code, store.id);
  }

  console.log(`Imported ${idByCode.size} stores.`);
  return idByCode;
}

async function importAssessments(
  sheet: ExcelJS.Worksheet,
  idByCode: Map<string, string>,
  assessorId: string,
): Promise<void> {
  const [dimensions, questions] = await Promise.all([
    prisma.dimension.findMany({ select: { id: true, weight: true } }),
    prisma.question.findMany({
      select: { id: true, questionNo: true, dimensionId: true, maxScore: true },
      orderBy: { questionNo: 'asc' },
    }),
  ]);
  const dimensionInfos = buildDimensionInfos(dimensions, questions);

  let imported = 0;
  let skipped = 0;

  for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo += 1) {
    const row = sheet.getRow(rowNo);
    const code = cellText(row.getCell(ASSESSMENT_COL.code));
    if (!code) continue;

    const storeId = idByCode.get(code);
    if (!storeId) {
      console.warn(`  ${code}: no store row in ${STORE_SHEET}, skipping assessment`);
      continue;
    }

    const rawScores = questions.map((question, index) =>
      cellNumber(row.getCell(ASSESSMENT_COL.firstQuestion + index)),
    );
    // A partially scored row cannot be submitted (the API rejects it at submit
    // for the same reason), and importing it as a draft would put an unfinished
    // round in front of an assessor as if someone had started it. Left out.
    if (rawScores.some((score) => score === null)) {
      skipped += 1;
      continue;
    }

    const roundText = cellText(row.getCell(ASSESSMENT_COL.round));
    const round = (roundText ?? Round.T0) as Round;
    if (!Object.values(Round).includes(round)) {
      console.warn(`  ${code}: unknown round "${roundText}", skipping`);
      continue;
    }

    const scoredQuestions: ScoredQuestion[] = questions.map((question, index) => ({
      questionNo: question.questionNo,
      dimensionId: question.dimensionId,
      rawScore: rawScores[index] as number,
    }));
    const totalScore = computeTotalScore(
      computeDimensionScores(scoredQuestions, dimensionInfos),
      dimensionInfos,
    );
    const redFlags = detectRedFlags(scoredQuestions);
    const notes = cellText(row.getCell(ASSESSMENT_COL.notes));

    await prisma.$transaction(async (tx) => {
      const assessment = await tx.assessment.upsert({
        where: { storeId_round: { storeId, round } },
        update: {
          assessorId,
          status: AssessmentStatus.SUBMITTED,
          totalScore,
          notes,
          submittedAt: new Date(),
        },
        create: {
          storeId,
          round,
          assessorId,
          status: AssessmentStatus.SUBMITTED,
          totalScore,
          notes,
          submittedAt: new Date(),
        },
        select: { id: true },
      });

      for (const [index, question] of questions.entries()) {
        const rawScore = rawScores[index] as number;
        await tx.score.upsert({
          where: {
            assessmentId_questionId: { assessmentId: assessment.id, questionId: question.id },
          },
          update: { rawScore, displayScore: rawScore, status: ScoreStatus.SCORED },
          create: {
            assessmentId: assessment.id,
            questionId: question.id,
            rawScore,
            displayScore: rawScore,
            status: ScoreStatus.SCORED,
          },
        });
      }

      // Red flags carry no natural key, so a re-run would stack a second copy
      // of every flag on the same assessment. Replace the set instead.
      await tx.redFlag.deleteMany({ where: { assessmentId: assessment.id } });
      if (redFlags.length > 0) {
        await tx.redFlag.createMany({
          data: redFlags.map((flag) => ({
            assessmentId: assessment.id,
            type: flag.type,
            severity: flag.severity,
            triggerQuestions: flag.triggerQuestions,
          })),
        });
      }

      await tx.store.update({
        where: { id: storeId },
        data: { status: StoreStatus.T0_COMPLETED },
      });
    });

    imported += 1;
  }

  console.log(`Imported ${imported} T0 assessments (${skipped} rows had no scores).`);
}

async function main(): Promise<void> {
  const workbookPath = process.argv[2] ?? DEFAULT_WORKBOOK;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  console.log(`Reading ${workbookPath}`);

  const storeSheet = workbook.getWorksheet(STORE_SHEET);
  const assessmentSheet = workbook.getWorksheet(ASSESSMENT_SHEET);
  if (!storeSheet) throw new Error(`Sheet "${STORE_SHEET}" not found`);
  if (!assessmentSheet) throw new Error(`Sheet "${ASSESSMENT_SHEET}" not found`);

  const questionCount = await prisma.question.count();
  if (questionCount === 0) {
    throw new Error('No questions in the database — run `npm run db:seed` first');
  }

  const assessorId = await upsertImportUser();
  const idByCode = await importStores(storeSheet);
  await importAssessments(assessmentSheet, idByCode, assessorId);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
