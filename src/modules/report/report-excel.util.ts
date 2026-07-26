import { Workbook, type Worksheet } from 'exceljs';
import { REPORT_ROUNDS } from './report.service';
import type { OverviewReport, RoundReport } from './types/report.type';

const HEADER_FILL_COLOR = 'FFF26B21';
const HEADER_FONT_COLOR = 'FFFFFFFF';
const SCORE_FORMAT = '0.00';

const ROUND_SHEET_NAME = 'ผลการประเมิน';
const OVERVIEW_SHEET_NAME = 'ภาพรวมทุกรอบ';

const TEXT = {
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
  redFlagType: 'ประเภทสัญญาณเตือน',
  severity: 'ระดับ',
  triggerQuestions: 'ข้อที่ทำให้เกิด',
  resolved: 'สถานะ',
  resolvedYes: 'แก้ไขแล้ว',
  resolvedNo: 'ยังไม่แก้ไข',
  delta: 'เปลี่ยนแปลง',
  unresolvedFlags: 'สัญญาณเตือนที่ยังไม่แก้ไข',
  noData: '-',
};

function styleHeaderRow(sheet: Worksheet, rowNumber: number): void {
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true, color: { argb: HEADER_FONT_COLOR } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_COLOR } };
}

function formatDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : TEXT.noData;
}

export async function buildRoundReportWorkbook(report: RoundReport): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(ROUND_SHEET_NAME);
  sheet.columns = [{ width: 28 }, { width: 22 }, { width: 18 }, { width: 18 }];

  sheet.addRow([TEXT.storeName, report.store.name]);
  sheet.addRow([TEXT.province, report.store.province]);
  sheet.addRow([TEXT.storeType, report.store.storeType]);
  sheet.addRow([TEXT.ownerName, report.store.ownerName]);
  sheet.addRow([TEXT.round, report.round]);
  sheet.addRow([TEXT.totalScore, report.totalScore ?? TEXT.noData]);
  sheet.addRow([TEXT.zone, report.zone ?? TEXT.noData]);
  sheet.addRow([TEXT.assessor, report.assessorName]);
  sheet.addRow([TEXT.submittedAt, formatDate(report.submittedAt)]);
  sheet.addRow([TEXT.notes, report.notes ?? TEXT.noData]);
  sheet.getColumn(1).font = { bold: true };

  sheet.addRow([]);
  const dimensionHeaderRow = sheet.rowCount + 1;
  sheet.addRow([TEXT.dimension, TEXT.weight, TEXT.scorePct]);
  styleHeaderRow(sheet, dimensionHeaderRow);
  for (const dimension of report.dimensions) {
    sheet.addRow([dimension.dimensionName, dimension.weight, dimension.scorePct]);
  }

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

  sheet.getColumn(3).numFmt = SCORE_FORMAT;

  return Buffer.from(await workbook.xlsx.writeBuffer());
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
