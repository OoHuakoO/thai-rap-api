import { Workbook } from 'exceljs';
import { Round } from '@prisma/client';
import type { StoreRoundScores } from './types/dashboard.type';

const SHEET_NAME = 'คะแนนรายร้าน';

const HEADERS = ['จังหวัด', 'ชื่อร้าน', 'ประเภทอาหาร', 'T0', 'T1', 'T2', 'T3'];

const HEADER_FILL_COLOR = 'FFF26B21';
const HEADER_FONT_COLOR = 'FFFFFFFF';

const COLUMN_WIDTHS = [16, 34, 20, 10, 10, 10, 10];

const SCORE_FORMAT = '0.00';

export async function buildStoreScoresWorkbook(rows: StoreRoundScores[]): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);

  sheet.addRow(HEADERS);
  sheet.columns.forEach((column, index) => {
    column.width = COLUMN_WIDTHS[index];
  });

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: HEADER_FONT_COLOR } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_COLOR } };

  for (const row of rows) {
    sheet.addRow([
      row.province,
      row.storeName,
      row.storeType,
      row.scores[Round.T0],
      row.scores[Round.T1],
      row.scores[Round.T2],
      row.scores[Round.T3],
    ]);
  }

  // Score columns only — the first three hold text and must stay unformatted.
  for (let column = 4; column <= HEADERS.length; column += 1) {
    sheet.getColumn(column).numFmt = SCORE_FORMAT;
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
