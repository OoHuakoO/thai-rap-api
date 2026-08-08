import type { Writable } from 'node:stream';
import { Workbook, stream } from 'exceljs';
import { SCORE_FORMAT, commitRow, formatDate, styleHeaderRow } from '@shared/excel-sheet.util';
import { REPORT_ROUNDS } from './report.service';
import type { OverviewReport, RoundMatrixExportSource, RoundReport } from './types/report.type';

const { WorkbookWriter } = stream.xlsx;

const ROUND_SHEET_NAME = 'ผลการประเมิน';
const QUESTION_SHEET_NAME = 'คะแนนรายข้อ';
const OVERVIEW_SHEET_NAME = 'ภาพรวมทุกรอบ';
const MATRIX_SHEET_NAME = 'สรุปคะแนนทุกร้าน';

const TEXT = {
  storeCode: 'รหัสร้าน',
  storeName: 'ชื่อร้าน',
  province: 'จังหวัด',
  storeType: 'ประเภทอาหาร',
  ownerName: 'เจ้าของร้าน',
  round: 'รอบการประเมิน',
  totalScore: 'คะแนนรวม',
  zone: 'Zone',
  assessor: 'ผู้ประเมิน',
  submittedAt: 'วันที่ส่งผล',
  notes: 'บันทึกเพิ่มเติม',
  dimension: 'มิติ',
  weight: 'น้ำหนัก (%)',
  scorePct: 'คะแนน (%)',
  rawScore: 'คะแนนดิบ',
  maxScore: 'คะแนนเต็ม',
  weightedScore: 'คะแนนถ่วงน้ำหนัก',
  rawScorePct: 'คะแนนรวม %',
  completion: 'ความครบถ้วน (%)',
  questionNo: 'ข้อที่',
  questionText: 'คำถาม',
  questionScore: 'คะแนน',
  dimensionTotal: 'รวมมิติ',
  grandTotal: 'รวมทั้งหมด',
  redFlag: 'Red Flag',
  redFlagType: 'ประเภทสัญญาณเตือน',
  severity: 'ระดับ',
  triggerQuestions: 'ข้อที่ทำให้เกิด',
  resolved: 'สถานะ',
  resolvedYes: 'แก้ไขแล้ว',
  resolvedNo: 'ยังไม่แก้ไข',
  criticalDimension: 'มิติเร่งแก้ไข',
  overallLevel: 'ระดับรวม',
  average: 'ค่าเฉลี่ย',
  dimensionLegend: 'คำอธิบายมิติ',
  dimensionNumber: (dimensionId: number) => `มิติ ${dimensionId}`,
  dimensionShort: (dimensionId: number, weight: number) => `มิติ ${dimensionId} (${weight}%)`,
  delta: 'เปลี่ยนแปลง',
  unresolvedFlags: 'สัญญาณเตือนที่ยังไม่แก้ไข',
  noData: '-',
};

export async function buildRoundReportWorkbook(report: RoundReport): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(ROUND_SHEET_NAME);
  sheet.columns = [
    { width: 28 },
    { width: 22 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 20 },
  ];

  sheet.addRow([TEXT.storeName, report.store.name]);
  sheet.addRow([TEXT.province, report.store.province]);
  sheet.addRow([TEXT.storeType, report.store.storeType]);
  sheet.addRow([TEXT.ownerName, report.store.ownerName]);
  sheet.addRow([TEXT.round, report.round]);
  sheet.addRow([TEXT.completion, report.completionPct]);
  sheet.addRow([TEXT.rawScore, `${report.rawScore} / ${report.maxScore}`]);
  sheet.addRow([TEXT.rawScorePct, report.rawScorePct]);
  sheet.addRow([TEXT.totalScore, report.totalScore ?? TEXT.noData]);
  sheet.addRow([TEXT.zone, report.zone ?? TEXT.noData]);
  sheet.addRow([TEXT.assessor, report.assessorName]);
  sheet.addRow([TEXT.submittedAt, formatDate(report.submittedAt)]);
  sheet.addRow([TEXT.notes, report.notes ?? TEXT.noData]);
  sheet.getColumn(1).font = { bold: true };

  sheet.addRow([]);
  const dimensionHeaderRow = sheet.rowCount + 1;
  sheet.addRow([
    TEXT.dimension,
    TEXT.rawScore,
    TEXT.maxScore,
    TEXT.scorePct,
    TEXT.weight,
    TEXT.weightedScore,
  ]);
  styleHeaderRow(sheet, dimensionHeaderRow);
  for (const dimension of report.dimensions) {
    sheet.addRow([
      dimension.dimensionName,
      dimension.rawScore,
      dimension.maxScore,
      dimension.scorePct,
      dimension.weight,
      dimension.weightedScore,
    ]);
  }
  const totalRow = sheet.addRow([
    TEXT.grandTotal,
    report.rawScore,
    report.maxScore,
    report.rawScorePct,
    100,
    report.totalScore ?? TEXT.noData,
  ]);
  totalRow.font = { bold: true };

  sheet.addRow([]);
  const flagHeaderRow = sheet.rowCount + 1;
  sheet.addRow([TEXT.redFlagType, TEXT.severity, TEXT.triggerQuestions, TEXT.resolved]);
  styleHeaderRow(sheet, flagHeaderRow);
  for (const flag of report.redFlags) {
    sheet.addRow([
      flag.type,
      flag.severity,
      flag.triggerQuestions.join(', '),
      flag.resolved ? TEXT.resolvedYes : TEXT.resolvedNo,
    ]);
  }

  sheet.getColumn(4).numFmt = SCORE_FORMAT;
  sheet.getColumn(6).numFmt = SCORE_FORMAT;

  addQuestionSheet(workbook, report);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// The per-question breakdown ("รายข้อ") gets its own sheet: 50 rows plus a
// subtotal per dimension would bury the summary if it shared one.
function addQuestionSheet(workbook: Workbook, report: RoundReport): void {
  const sheet = workbook.addWorksheet(QUESTION_SHEET_NAME);
  sheet.columns = [{ width: 10 }, { width: 64 }, { width: 12 }, { width: 12 }, { width: 20 }];

  const headerRow = sheet.rowCount + 1;
  sheet.addRow([
    TEXT.questionNo,
    TEXT.questionText,
    TEXT.questionScore,
    TEXT.maxScore,
    TEXT.weightedScore,
  ]);
  styleHeaderRow(sheet, headerRow);

  for (const dimension of report.dimensions) {
    const dimensionRow = sheet.addRow([dimension.dimensionName]);
    dimensionRow.font = { bold: true };

    for (const question of dimension.questions) {
      sheet.addRow([
        question.questionNo,
        question.questionText,
        question.rawScore ?? TEXT.noData,
        question.maxScore,
      ]);
    }

    const subtotal = sheet.addRow([
      '',
      `${TEXT.dimensionTotal} (${TEXT.weight} ${dimension.weight})`,
      dimension.rawScore,
      dimension.maxScore,
      dimension.weightedScore,
    ]);
    subtotal.font = { bold: true, italic: true };
  }

  const totalRow = sheet.addRow([
    '',
    TEXT.grandTotal,
    report.rawScore,
    report.maxScore,
    report.totalScore ?? TEXT.noData,
  ]);
  totalRow.font = { bold: true };

  sheet.getColumn(5).numFmt = SCORE_FORMAT;
}

// Written through exceljs' streaming writer rather than the in-memory Workbook
// the other two exports use: this is the only report whose row count grows with
// the whole programme, so each row is committed to the response as it is read
// and never joins a full-cohort array or a full-file Buffer.
export async function streamRoundMatrixWorkbook(
  source: RoundMatrixExportSource,
  out: Writable,
): Promise<void> {
  const workbook = new WorkbookWriter({ stream: out, useStyles: true });
  const sheet = workbook.addWorksheet(MATRIX_SHEET_NAME);

  // A committed row is already on the wire, so its number format can no longer
  // be set from the column — the percentage columns declare it up front.
  const scoreColumn = { width: 14, style: { numFmt: SCORE_FORMAT } };
  sheet.columns = [
    { width: 14 },
    { width: 30 },
    { width: 14 },
    scoreColumn,
    { width: 12 },
    scoreColumn,
    { width: 18, style: { numFmt: SCORE_FORMAT } },
    { width: 10 },
    { width: 14 },
    { width: 24 },
    ...source.dimensions.map(() => scoreColumn),
  ];

  commitRow(
    sheet,
    [
      TEXT.storeCode,
      TEXT.storeName,
      TEXT.province,
      TEXT.completion,
      TEXT.rawScore,
      TEXT.rawScorePct,
      TEXT.weightedScore,
      TEXT.redFlag,
      TEXT.overallLevel,
      TEXT.criticalDimension,
      ...source.dimensions.map((dimension) =>
        TEXT.dimensionShort(dimension.dimensionId, dimension.weight),
      ),
    ],
    'header',
  );

  for await (const row of source.rows) {
    commitRow(sheet, [
      row.storeCode,
      row.storeName,
      row.province,
      row.completionPct,
      row.rawScore,
      row.rawScorePct,
      row.weightedScore ?? TEXT.noData,
      row.redFlagCount,
      row.overallLevel,
      // "มิติ N", as 03_สรุปคะแนน writes it — the full name is in the legend below.
      row.criticalDimensionId === null
        ? TEXT.noData
        : TEXT.dimensionNumber(row.criticalDimensionId),
      ...source.dimensions.map((dimension) => row.scoresByDimension[dimension.dimensionId] ?? 0),
    ]);
  }

  commitRow(
    sheet,
    [
      '',
      TEXT.average,
      '',
      '',
      '',
      '',
      source.averageWeightedScore ?? TEXT.noData,
      '',
      '',
      '',
      ...source.dimensions.map(
        (dimension) => source.averageByDimension[dimension.dimensionId] ?? TEXT.noData,
      ),
    ],
    'bold',
  );

  // The dimension columns are headed "มิติ N" to keep the sheet readable, so the
  // full names have to appear somewhere — here, under the table.
  commitRow(sheet, []);
  commitRow(sheet, [TEXT.dimensionLegend, TEXT.dimension, TEXT.weight], 'header');
  for (const dimension of source.dimensions) {
    commitRow(sheet, [
      TEXT.dimensionNumber(dimension.dimensionId),
      dimension.dimensionName,
      dimension.weight,
    ]);
  }

  sheet.commit();
  await workbook.commit();
}

export async function buildOverviewReportWorkbook(report: OverviewReport): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(OVERVIEW_SHEET_NAME);
  sheet.columns = [{ width: 30 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];

  sheet.addRow([TEXT.storeName, report.store.name]);
  sheet.addRow([TEXT.province, report.store.province]);
  sheet.addRow([TEXT.storeType, report.store.storeType]);
  sheet.addRow([TEXT.unresolvedFlags, report.unresolvedRedFlagCount]);
  sheet.getColumn(1).font = { bold: true };

  sheet.addRow([]);
  const roundHeaderRow = sheet.rowCount + 1;
  sheet.addRow([TEXT.round, TEXT.totalScore, TEXT.delta, TEXT.zone, TEXT.submittedAt]);
  styleHeaderRow(sheet, roundHeaderRow);
  for (const round of report.rounds) {
    sheet.addRow([
      round.round,
      round.totalScore ?? TEXT.noData,
      round.delta ?? TEXT.noData,
      round.zone ?? TEXT.noData,
      formatDate(round.submittedAt),
    ]);
  }

  sheet.addRow([]);
  const trendHeaderRow = sheet.rowCount + 1;
  sheet.addRow([TEXT.dimension, TEXT.weight, ...REPORT_ROUNDS]);
  styleHeaderRow(sheet, trendHeaderRow);
  for (const trend of report.dimensionTrends) {
    sheet.addRow([
      trend.dimensionName,
      trend.weight,
      ...REPORT_ROUNDS.map((round) => trend.scoresByRound[round] ?? TEXT.noData),
    ]);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
