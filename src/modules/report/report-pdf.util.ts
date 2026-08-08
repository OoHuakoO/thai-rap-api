import type { Writable } from 'node:stream';
import {
  contentWidthOf,
  createDoc,
  field,
  formatDate,
  formatScore,
  gridRow,
  heading,
  pipeToStream,
  row,
  title,
  toBuffer,
  type Doc,
} from '@shared/pdf-doc.util';
import { REPORT_ROUNDS } from './report.service';
import type { OverviewReport, RoundMatrixExportSource, RoundReport } from './types/report.type';

const TEXT = {
  roundTitle: (round: string) => `รายงานผลการประเมิน รอบ ${round}`,
  overviewTitle: 'รายงานผลการประเมิน ภาพรวมทุกรอบ',
  matrixTitle: (round: string) => `รายงานคะแนนรายมิติทุกร้าน รอบ ${round}`,
  storeSection: 'ข้อมูลร้าน',
  resultSection: 'ผลการประเมิน',
  dimensionSection: 'คะแนนรายมิติ',
  questionSection: 'คะแนนรายข้อ',
  redFlagSection: 'สัญญาณเตือน (Red Flag)',
  roundSection: 'คะแนนแต่ละรอบ',
  trendSection: 'คะแนนรายมิติแต่ละรอบ',
  storeCode: 'รหัสร้าน',
  storeName: 'ชื่อร้าน',
  province: 'จังหวัด',
  storeType: 'ประเภทอาหาร',
  ownerName: 'เจ้าของร้าน',
  totalScore: 'คะแนนรวม',
  rawScore: 'คะแนนดิบ',
  rawScorePct: 'คะแนนรวม %',
  weightedScore: 'คะแนนถ่วงน้ำหนัก',
  completion: 'ความครบถ้วน (%)',
  weight: 'น้ำหนัก (%)',
  scorePct: 'คะแนน (%)',
  dimensionTotal: 'รวมมิติ',
  grandTotal: 'รวมทั้งหมด',
  criticalDimension: 'มิติเร่งแก้ไข',
  overallLevel: 'ระดับรวม',
  average: 'ค่าเฉลี่ย',
  dimensionLegend: 'คำอธิบายมิติ',
  dimensionNumber: (dimensionId: number) => `มิติ ${dimensionId}`,
  dimensionShort: (dimensionId: number, weight: number) => `มิติ ${dimensionId} (${weight}%)`,
  storeCount: (count: number) => `จำนวนร้านที่ประเมินแล้ว ${count} ร้าน`,
  zone: 'Zone',
  assessor: 'ผู้ประเมิน',
  submittedAt: 'วันที่ส่งผล',
  notes: 'บันทึกเพิ่มเติม',
  delta: 'เปลี่ยนแปลง',
  unresolvedFlags: 'สัญญาณเตือนที่ยังไม่แก้ไข',
  noRedFlag: 'ไม่พบสัญญาณเตือน',
  noRound: 'ยังไม่มีผลการประเมินที่ส่งแล้ว',
  noStore: 'ยังไม่มีร้านที่ส่งผลการประเมินรอบนี้',
  resolvedYes: 'แก้ไขแล้ว',
  resolvedNo: 'ยังไม่แก้ไข',
  noData: '-',
};

function storeSection(doc: Doc, store: RoundReport['store']): void {
  heading(doc, TEXT.storeSection);
  field(doc, TEXT.storeName, store.name);
  field(doc, TEXT.province, store.province);
  field(doc, TEXT.storeType, store.storeType);
  field(doc, TEXT.ownerName, store.ownerName);
}

function questionSection(doc: Doc, report: RoundReport, contentWidth: number): void {
  heading(doc, TEXT.questionSection);
  const widths = [
    contentWidth * 0.08,
    contentWidth * 0.62,
    contentWidth * 0.15,
    contentWidth * 0.15,
  ];
  gridRow(doc, ['ข้อ', 'คำถาม', 'คะแนน', 'เต็ม'], widths, true);

  for (const dimension of report.dimensions) {
    // The dimension name heads its block of questions, so it spans the table
    // rather than being squeezed into the narrow "ข้อ" column.
    gridRow(
      doc,
      [`${dimension.dimensionName} (${TEXT.weight} ${dimension.weight})`],
      [contentWidth],
      true,
    );
    for (const question of dimension.questions) {
      gridRow(
        doc,
        [
          String(question.questionNo),
          question.questionText,
          question.rawScore === null ? TEXT.noData : String(question.rawScore),
          String(question.maxScore),
        ],
        widths,
      );
    }
    gridRow(
      doc,
      [
        '',
        `${TEXT.dimensionTotal} — ${dimension.scorePct.toFixed(2)}% × ${dimension.weight}% = ${dimension.weightedScore.toFixed(2)}`,
        String(dimension.rawScore),
        String(dimension.maxScore),
      ],
      widths,
      true,
    );
  }
}

export function buildRoundReportPdf(report: RoundReport): Promise<Buffer> {
  const doc = createDoc();
  const contentWidth = contentWidthOf(doc);
  const columnWidth = contentWidth / 3;

  title(doc, TEXT.roundTitle(report.round));
  storeSection(doc, report.store);

  heading(doc, TEXT.resultSection);
  field(doc, TEXT.completion, formatScore(report.completionPct));
  field(doc, TEXT.rawScore, `${report.rawScore} / ${report.maxScore}`);
  field(doc, TEXT.rawScorePct, formatScore(report.rawScorePct));
  field(doc, TEXT.totalScore, formatScore(report.totalScore));
  field(doc, TEXT.zone, report.zone ?? TEXT.noData);
  field(doc, TEXT.assessor, report.assessorName);
  field(doc, TEXT.submittedAt, formatDate(report.submittedAt));
  if (report.notes) field(doc, TEXT.notes, report.notes);

  heading(doc, TEXT.dimensionSection);
  // The last column holds "คะแนนถ่วงน้ำหนัก", which has no space to break on —
  // it gets the width its header needs, the rest share what is left.
  const dimensionWidths = [
    contentWidth * 0.32,
    contentWidth * 0.12,
    contentWidth * 0.11,
    contentWidth * 0.13,
    contentWidth * 0.13,
    contentWidth * 0.19,
  ];
  gridRow(
    doc,
    [TEXT.dimensionSection, TEXT.rawScore, 'เต็ม', TEXT.scorePct, TEXT.weight, TEXT.weightedScore],
    dimensionWidths,
    true,
  );
  for (const dimension of report.dimensions) {
    gridRow(
      doc,
      [
        dimension.dimensionName,
        String(dimension.rawScore),
        String(dimension.maxScore),
        dimension.scorePct.toFixed(2),
        String(dimension.weight),
        dimension.weightedScore.toFixed(2),
      ],
      dimensionWidths,
    );
  }
  gridRow(
    doc,
    [
      TEXT.grandTotal,
      String(report.rawScore),
      String(report.maxScore),
      report.rawScorePct.toFixed(2),
      '100',
      formatScore(report.totalScore),
    ],
    dimensionWidths,
    true,
  );

  questionSection(doc, report, contentWidth);

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

// Landscape: eight dimension columns plus the summary ones do not fit the
// portrait width the other two reports use.
//
// Piped straight to the response instead of collected with toBuffer(): this is
// the only report whose length grows with the whole programme, and its rows
// arrive from the database in batches, so pages are written out as they are
// drawn rather than held until the last store is read.
export async function streamRoundMatrixPdf(
  source: RoundMatrixExportSource,
  out: Writable,
): Promise<void> {
  const doc = createDoc('landscape');
  const finished = pipeToStream(doc, out);
  const contentWidth = contentWidthOf(doc);

  title(doc, TEXT.matrixTitle(source.round));
  doc.text(TEXT.storeCount(source.storeCount));

  if (source.storeCount === 0) {
    doc.text(TEXT.noStore);
    doc.end();
    return finished;
  }

  // Thai has no spaces to break on, so a header wider than its column is split
  // mid-word — the "ความครบถ้วน (%)" and "คะแนนถ่วงน้ำหนัก" columns are therefore
  // sized to hold their header on one line, and the dimension columns (headed
  // "มิติ N (w%)", which does have a space) take what is left.
  const fixedWidths = [
    contentWidth * 0.075,
    contentWidth * 0.15,
    contentWidth * 0.075,
    contentWidth * 0.123,
  ];
  const weightedWidth = contentWidth * 0.123;
  const dimensionWidth =
    (contentWidth - fixedWidths.reduce((sum, width) => sum + width, 0) - weightedWidth) /
    source.dimensions.length;
  const widths = [...fixedWidths, ...source.dimensions.map(() => dimensionWidth), weightedWidth];

  gridRow(
    doc,
    [
      TEXT.storeCode,
      TEXT.storeName,
      TEXT.overallLevel,
      TEXT.completion,
      ...source.dimensions.map((dimension) =>
        TEXT.dimensionShort(dimension.dimensionId, dimension.weight),
      ),
      TEXT.weightedScore,
    ],
    widths,
    true,
  );

  for await (const row of source.rows) {
    gridRow(
      doc,
      [
        row.storeCode,
        row.storeName,
        row.overallLevel,
        row.completionPct.toFixed(0),
        ...source.dimensions.map((dimension) =>
          (row.scoresByDimension[dimension.dimensionId] ?? 0).toFixed(1),
        ),
        formatScore(row.weightedScore),
      ],
      widths,
    );
  }

  gridRow(
    doc,
    [
      '',
      TEXT.average,
      '',
      '',
      ...source.dimensions.map((dimension) => {
        const mean = source.averageByDimension[dimension.dimensionId];
        return mean === undefined ? TEXT.noData : mean.toFixed(1);
      }),
      formatScore(source.averageWeightedScore),
    ],
    widths,
    true,
  );

  // The score columns are headed "มิติ N" so the table fits the page — the full
  // names have to be reachable from the same document.
  heading(doc, TEXT.dimensionLegend);
  const legendWidths = [contentWidth * 0.12, contentWidth * 0.6, contentWidth * 0.12];
  for (const dimension of source.dimensions) {
    gridRow(
      doc,
      [
        TEXT.dimensionNumber(dimension.dimensionId),
        dimension.dimensionName,
        `${dimension.weight}%`,
      ],
      legendWidths,
    );
  }

  doc.end();
  return finished;
}

export function buildOverviewReportPdf(report: OverviewReport): Promise<Buffer> {
  const doc = createDoc();
  const contentWidth = contentWidthOf(doc);

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
