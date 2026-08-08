import { join } from 'node:path';
import type { Writable } from 'node:stream';
import PDFDocument from 'pdfkit';

// PDFKit's built-in fonts have no Thai glyphs — every label in these reports is
// Thai, so the bundled Sarabun (OFL, assets/fonts/) is registered instead.
// process.cwd() rather than __dirname: the compiled build lives in dist/ while
// the fonts stay next to the source tree.
const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
export const FONT_REGULAR = 'Sarabun';
export const FONT_BOLD = 'Sarabun-Bold';

export const PAGE_MARGIN = 48;
export const TITLE_SIZE = 18;
export const HEADING_SIZE = 13;
export const BODY_SIZE = 11;
export const LINE_GAP = 4;
// Gutter between two grid columns, so wrapped text never touches the next cell.
export const CELL_GAP = 6;

export const BRAND_ORANGE = '#F26B21';
export const TEXT_DARK = '#333333';

export const NO_DATA = '-';

export type Doc = PDFKit.PDFDocument;

export function createDoc(layout: 'portrait' | 'landscape' = 'portrait'): Doc {
  const doc = new PDFDocument({ size: 'A4', layout, margin: PAGE_MARGIN });
  doc.registerFont(FONT_REGULAR, join(FONT_DIR, 'Sarabun-Regular.ttf'));
  doc.registerFont(FONT_BOLD, join(FONT_DIR, 'Sarabun-Bold.ttf'));
  doc.font(FONT_REGULAR).fontSize(BODY_SIZE).fillColor(TEXT_DARK);
  return doc;
}

export function contentWidthOf(doc: Doc): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

export function toBuffer(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

// Resolves once the document has been fully written out, so the caller does not
// return — and Nest does not consider the request handled — mid-file. The
// promise is created before any drawing so no early chunk is missed.
export function pipeToStream(doc: Doc, out: Writable): Promise<void> {
  const finished = new Promise<void>((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
    out.on('error', reject);
  });
  doc.pipe(out);
  return finished;
}

export function title(doc: Doc, text: string): void {
  doc.font(FONT_BOLD).fontSize(TITLE_SIZE).fillColor(BRAND_ORANGE).text(text);
  doc.moveDown(0.6);
  doc.font(FONT_REGULAR).fontSize(BODY_SIZE).fillColor(TEXT_DARK);
}

export function heading(doc: Doc, text: string): void {
  doc.moveDown(0.6);
  doc.font(FONT_BOLD).fontSize(HEADING_SIZE).fillColor(BRAND_ORANGE).text(text);
  doc.moveDown(0.2);
  doc.font(FONT_REGULAR).fontSize(BODY_SIZE).fillColor(TEXT_DARK);
}

export function field(doc: Doc, label: string, value: string): void {
  doc.font(FONT_BOLD).text(`${label}: `, { continued: true });
  doc.font(FONT_REGULAR).text(value, { lineGap: LINE_GAP });
}

export function row(doc: Doc, cells: string[], columnWidth: number, bold = false): void {
  gridRow(
    doc,
    cells,
    cells.map(() => columnWidth),
    bold,
  );
}

// row() with per-column widths, so a wide table can give the store name more
// room than the numeric columns. Rows are placed by hand rather than by PDFKit's
// text flow, which is also why the page break has to be checked here.
//
// A cell that does not fit its column wraps onto further lines instead of being
// truncated — nothing in these reports may be shown half-written — so the row is
// as tall as its tallest cell, measured before anything is drawn.
export function gridRow(doc: Doc, cells: string[], widths: number[], bold = false): void {
  const columnWidth = (index: number): number =>
    (widths[index] ?? widths[widths.length - 1]) - CELL_GAP;

  doc.font(bold ? FONT_BOLD : FONT_REGULAR);
  const rowHeight = cells.reduce(
    (tallest, cell, index) =>
      Math.max(tallest, doc.heightOfString(cell, { width: columnWidth(index), lineGap: LINE_GAP })),
    BODY_SIZE + LINE_GAP,
  );

  if (doc.y + rowHeight > doc.page.height - PAGE_MARGIN) {
    doc.addPage();
    doc.font(bold ? FONT_BOLD : FONT_REGULAR);
  }

  const y = doc.y;
  let x = PAGE_MARGIN;
  cells.forEach((cell, index) => {
    doc.text(cell, x, y, { width: columnWidth(index), lineGap: LINE_GAP });
    x += widths[index] ?? widths[widths.length - 1];
  });
  doc.y = y + rowHeight;
  doc.x = PAGE_MARGIN;
}

export function formatDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : NO_DATA;
}

export function formatScore(value: number | null): string {
  return value === null ? NO_DATA : value.toFixed(2);
}
