import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { REPORT_ROUNDS } from './report.service';
import type { OverviewReport, RoundReport } from './types/report.type';

// PDFKit's built-in fonts have no Thai glyphs — every label in these reports is
// Thai, so the bundled Sarabun (OFL, assets/fonts/) is registered instead.
// process.cwd() rather than __dirname: the compiled build lives in dist/ while
// the fonts stay next to the source tree.
const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
const FONT_REGULAR = 'Sarabun';
const FONT_BOLD = 'Sarabun-Bold';

const PAGE_MARGIN = 48;
const TITLE_SIZE = 18;
const HEADING_SIZE = 13;
const BODY_SIZE = 11;
const LINE_GAP = 4;

const BRAND_ORANGE = '#F26B21';
const TEXT_DARK = '#333333';

const TEXT = {
  roundTitle: (round: string) => `รายงานผลการประเมิน รอบ ${round}`,
  overviewTitle: 'รายงานผลการประเมิน ภาพรวมทุกรอบ',
  storeSection: 'ข้อมูลร้าน',
  resultSection: 'ผลการประเมิน',
  dimensionSection: 'คะแนนรายมิติ',
  redFlagSection: 'สัญญาณเตือน (Red Flag)',
  roundSection: 'คะแนนแต่ละรอบ',
  trendSection: 'คะแนนรายมิติแต่ละรอบ',
  storeName: 'ชื่อร้าน',
  province: 'จังหวัด',
  storeType: 'ประเภทอาหาร',
  ownerName: 'เจ้าของร้าน',
  totalScore: 'คะแนนรวม',
  zone: 'Zone',
  assessor: 'ผู้ประเมิน',
  submittedAt: 'วันที่ส่งผล',
  notes: 'บันทึกเพิ่มเติม',
  delta: 'เปลี่ยนแปลง',
  unresolvedFlags: 'สัญญาณเตือนที่ยังไม่แก้ไข',
  noRedFlag: 'ไม่พบสัญญาณเตือน',
  noRound: 'ยังไม่มีผลการประเมินที่ส่งแล้ว',
  resolvedYes: 'แก้ไขแล้ว',
  resolvedNo: 'ยังไม่แก้ไข',
  noData: '-',
};

type Doc = PDFKit.PDFDocument;

function createDoc(): Doc {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
  doc.registerFont(FONT_REGULAR, join(FONT_DIR, 'Sarabun-Regular.ttf'));
  doc.registerFont(FONT_BOLD, join(FONT_DIR, 'Sarabun-Bold.ttf'));
  doc.font(FONT_REGULAR).fontSize(BODY_SIZE).fillColor(TEXT_DARK);
  return doc;
}

function toBuffer(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function title(doc: Doc, text: string): void {
  doc.font(FONT_BOLD).fontSize(TITLE_SIZE).fillColor(BRAND_ORANGE).text(text);
  doc.moveDown(0.6);
  doc.font(FONT_REGULAR).fontSize(BODY_SIZE).fillColor(TEXT_DARK);
}

function heading(doc: Doc, text: string): void {
  doc.moveDown(0.6);
  doc.font(FONT_BOLD).fontSize(HEADING_SIZE).fillColor(BRAND_ORANGE).text(text);
  doc.moveDown(0.2);
  doc.font(FONT_REGULAR).fontSize(BODY_SIZE).fillColor(TEXT_DARK);
}

function field(doc: Doc, label: string, value: string): void {
  doc.font(FONT_BOLD).text(`${label}: `, { continued: true });
  doc.font(FONT_REGULAR).text(value, { lineGap: LINE_GAP });
}

function row(doc: Doc, cells: string[], columnWidth: number, bold = false): void {
  doc.font(bold ? FONT_BOLD : FONT_REGULAR);
  const y = doc.y;
  cells.forEach((cell, index) => {
    doc.text(cell, PAGE_MARGIN + index * columnWidth, y, { width: columnWidth - 6 });
  });
  doc.y = y + BODY_SIZE + LINE_GAP;
  doc.x = PAGE_MARGIN;
}

function formatDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : TEXT.noData;
}

function formatScore(value: number | null): string {
  return value === null ? TEXT.noData : value.toFixed(2);
}

function storeSection(doc: Doc, store: RoundReport['store']): void {
  heading(doc, TEXT.storeSection);
  field(doc, TEXT.storeName, store.name);
  field(doc, TEXT.province, store.province);
  field(doc, TEXT.storeType, store.storeType);
  field(doc, TEXT.ownerName, store.ownerName);
}

export function buildRoundReportPdf(report: RoundReport): Promise<Buffer> {
  const doc = createDoc();
  const columnWidth = (doc.page.width - PAGE_MARGIN * 2) / 3;

  title(doc, TEXT.roundTitle(report.round));
  storeSection(doc, report.store);

  heading(doc, TEXT.resultSection);
  field(doc, TEXT.totalScore, formatScore(report.totalScore));
  field(doc, TEXT.zone, report.zone ?? TEXT.noData);
  field(doc, TEXT.assessor, report.assessorName);
  field(doc, TEXT.submittedAt, formatDate(report.submittedAt));
  if (report.notes) field(doc, TEXT.notes, report.notes);

  heading(doc, TEXT.dimensionSection);
  row(doc, ['มิติ', 'น้ำหนัก (%)', 'คะแนน (%)'], columnWidth, true);
  for (const dimension of report.dimensions) {
    row(
      doc,
      [dimension.dimensionName, String(dimension.weight), dimension.scorePct.toFixed(2)],
      columnWidth,
    );
  }

  heading(doc, TEXT.redFlagSection);
  if (report.redFlags.length === 0) {
    doc.text(TEXT.noRedFlag);
  } else {
    row(doc, ['ประเภท', 'ระดับ', 'สถานะ'], columnWidth, true);
    for (const flag of report.redFlags) {
      row(
        doc,
        [flag.type, flag.severity, flag.resolved ? TEXT.resolvedYes : TEXT.resolvedNo],
        columnWidth,
      );
    }
  }

  return toBuffer(doc);
}

export function buildOverviewReportPdf(report: OverviewReport): Promise<Buffer> {
  const doc = createDoc();
  const contentWidth = doc.page.width - PAGE_MARGIN * 2;

  title(doc, TEXT.overviewTitle);
  storeSection(doc, report.store);
  field(doc, TEXT.unresolvedFlags, String(report.unresolvedRedFlagCount));

  heading(doc, TEXT.roundSection);
  if (report.rounds.length === 0) {
    doc.text(TEXT.noRound);
  } else {
    const roundColumnWidth = contentWidth / 5;
    row(doc, ['รอบ', 'คะแนนรวม', TEXT.delta, TEXT.zone, TEXT.submittedAt], roundColumnWidth, true);
    for (const item of report.rounds) {
      row(
        doc,
        [
          item.round,
          formatScore(item.totalScore),
          formatScore(item.delta),
          item.zone ?? TEXT.noData,
          formatDate(item.submittedAt),
        ],
        roundColumnWidth,
      );
    }
  }

  heading(doc, TEXT.trendSection);
  const trendColumnWidth = contentWidth / (REPORT_ROUNDS.length + 1);
  row(doc, ['มิติ', ...REPORT_ROUNDS], trendColumnWidth, true);
  for (const trend of report.dimensionTrends) {
    row(
      doc,
      [
        trend.dimensionName,
        ...REPORT_ROUNDS.map((round) => {
          const score = trend.scoresByRound[round];
          return score === undefined ? TEXT.noData : score.toFixed(2);
        }),
      ],
      trendColumnWidth,
    );
  }

  return toBuffer(doc);
}
