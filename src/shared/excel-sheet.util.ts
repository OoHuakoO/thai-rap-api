import type { Row, Worksheet } from 'exceljs';

const HEADER_FILL_COLOR = 'FFF26B21';
const HEADER_FONT_COLOR = 'FFFFFFFF';

export const SCORE_FORMAT = '0.00';
export const NO_DATA = '-';

export type RowStyle = 'header' | 'bold' | 'plain';

export function styleRow(row: Row, style: RowStyle): void {
  if (style === 'plain') return;
  if (style === 'bold') {
    row.font = { bold: true };
    return;
  }
  row.font = { bold: true, color: { argb: HEADER_FONT_COLOR } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_COLOR } };
}

export function styleHeaderRow(sheet: Worksheet, rowNumber: number): void {
  styleRow(sheet.getRow(rowNumber), 'header');
}

// Streaming counterpart of addRow: a row must be styled and committed before
// the next one is added, because committing is what flushes it to the response.
export function commitRow(
  sheet: Worksheet,
  cells: (string | number)[],
  style: RowStyle = 'plain',
): void {
  const row = sheet.addRow(cells);
  styleRow(row, style);
  row.commit();
}

export function formatDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : NO_DATA;
}
