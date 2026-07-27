import { Workbook, type Worksheet } from 'exceljs';
import type { StoreAnalyticsResult } from './types/analytics.type';

const SHEET_NAME = 'วิเคราะห์ผล';
const HEADER_FILL_COLOR = 'FFF26B21';
const HEADER_FONT_COLOR = 'FFFFFFFF';
const SCORE_FORMAT = '0.00';

const TEXT = {
  storeName: 'ชื่อร้าน',
  t0Score: 'คะแนน T0',
  t1Score: 'คะแนน T1',
  improvementRate: 'อัตราการพัฒนา (%)',
  zone: 'Zone',
  rank: 'อันดับในโครงการ',
  totalStores: 'จำนวนร้านทั้งหมด',
  axis: 'มิติ',
  baseline: 'รอบฐาน',
  compare: 'รอบเปรียบเทียบ',
  redFlagType: 'ประเภทสัญญาณเตือน',
  severity: 'ระดับ',
  triggerQuestions: 'ข้อที่ทำให้เกิด',
  resolved: 'สถานะ',
  resolvedYes: 'แก้ไขแล้ว',
  resolvedNo: 'ยังไม่แก้ไข',
  noData: '-',
};

function styleHeaderRow(sheet: Worksheet, rowNumber: number): void {
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true, color: { argb: HEADER_FONT_COLOR } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_COLOR } };
}

export async function buildAnalyticsWorkbook(
  storeName: string,
  analytics: StoreAnalyticsResult,
): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.columns = [{ width: 28 }, { width: 20 }, { width: 20 }];

  sheet.addRow([TEXT.storeName, storeName]);
  sheet.addRow([TEXT.t0Score, analytics.kpis.t0Score ?? TEXT.noData]);
  sheet.addRow([TEXT.t1Score, analytics.kpis.t1Score ?? TEXT.noData]);
  sheet.addRow([TEXT.improvementRate, analytics.kpis.improvementRate ?? TEXT.noData]);
  sheet.addRow([TEXT.zone, analytics.kpis.zone ?? TEXT.noData]);
  sheet.addRow([
    TEXT.rank,
    analytics.kpis.rankInProject
      ? `${analytics.kpis.rankInProject} / ${analytics.kpis.totalStores}`
      : TEXT.noData,
  ]);
  sheet.getColumn(1).font = { bold: true };

  sheet.addRow([]);
  const radarHeaderRow = sheet.rowCount + 1;
  const [baselineSeries, compareSeries] = analytics.radar.series;
  sheet.addRow([TEXT.axis, TEXT.baseline, TEXT.compare]);
  styleHeaderRow(sheet, radarHeaderRow);
  analytics.radar.axes.forEach((axis, index) => {
    sheet.addRow([
      axis,
      baselineSeries?.data[index] ?? TEXT.noData,
      compareSeries?.data[index] ?? TEXT.noData,
    ]);
  });
  sheet.getColumn(2).numFmt = SCORE_FORMAT;
  sheet.getColumn(3).numFmt = SCORE_FORMAT;

  sheet.addRow([]);
  const flagHeaderRow = sheet.rowCount + 1;
  sheet.addRow([TEXT.redFlagType, TEXT.severity, TEXT.triggerQuestions, TEXT.resolved]);
  styleHeaderRow(sheet, flagHeaderRow);
  for (const flag of analytics.redFlags) {
    sheet.addRow([
      flag.type,
      flag.severity,
      flag.triggerQuestions.join(', '),
      flag.resolved ? TEXT.resolvedYes : TEXT.resolvedNo,
    ]);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
