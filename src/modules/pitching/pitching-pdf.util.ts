import {
  NO_DATA,
  contentWidthOf,
  createDoc,
  field,
  formatDate,
  formatScore,
  gridRow,
  heading,
  tableWidths,
  title,
  toBuffer,
  type Doc,
} from '@shared/pdf-doc.util';
import { PitchingRound } from '@prisma/client';
import {
  PITCHING_COMMENT_LABELS,
  PITCHING_EXPORT_TEXT as TEXT,
  PITCHING_LEVEL_LABELS,
  PITCHING_RECOMMENDATION_LABELS,
  PITCHING_ROUND_LABELS,
} from './pitching-export.const';
import type {
  PitchingResult,
  PitchingStoreReport,
  PitchingSummaryItem,
} from './types/pitching.type';

export function buildPitchingStoreReportPdf(report: PitchingStoreReport): Promise<Buffer> {
  const doc = createDoc();
  const contentWidth = contentWidthOf(doc);

  title(doc, TEXT.storeReportTitle(PITCHING_ROUND_LABELS[report.round]));

  heading(doc, TEXT.storeSection);
  field(doc, TEXT.storeName, report.storeName);
  field(doc, TEXT.storeCode, report.storeCode);
  field(doc, TEXT.province, report.province ?? NO_DATA);

  heading(doc, TEXT.resultSection);
  field(doc, TEXT.avgScore, formatScore(report.avgScore));
  field(doc, TEXT.level, report.level ? PITCHING_LEVEL_LABELS[report.level] : NO_DATA);
  field(
    doc,
    TEXT.rank,
    report.rank === null ? NO_DATA : `${report.rank} / ${report.rankedStoreCount}`,
  );
  field(doc, TEXT.judgeCount, String(report.judgeCount));
  field(doc, TEXT.selectedCount, String(report.recommendationCounts.SELECTED));
  field(doc, TEXT.waitingListCount, String(report.recommendationCounts.WAITING_LIST));
  field(doc, TEXT.minimumNotMetCount, String(report.recommendationCounts.MINIMUM_NOT_MET));
  field(doc, TEXT.notSelectedCount, String(report.recommendationCounts.NOT_SELECTED));

  heading(doc, TEXT.criterionSection);
  const criterionHeaders = [
    TEXT.criterionCode,
    TEXT.criterionTitle,
    TEXT.criterionMax,
    TEXT.criterionAvg,
    TEXT.criterionPct,
  ];
  const criterionWidths = tableWidths(
    doc,
    criterionHeaders,
    [0.05, 0.85, 0.03, 0.03, 0.04],
    contentWidth,
  );
  gridRow(doc, criterionHeaders, criterionWidths, true);
  for (const criterion of report.criteria) {
    gridRow(
      doc,
      [
        criterion.code,
        criterion.title,
        String(criterion.maxScore),
        criterion.avgScore.toFixed(2),
        criterion.avgPct.toFixed(2),
      ],
      criterionWidths,
    );
  }

  heading(doc, TEXT.judgeSection);
  if (report.judges.length === 0) {
    doc.text(TEXT.noJudge);
  } else {
    for (const judge of report.judges) {
      judgeBlock(doc, judge, report.round, contentWidth);
    }
  }

  return toBuffer(doc);
}

function judgeBlock(
  doc: Doc,
  judge: PitchingResult,
  round: PitchingStoreReport['round'],
  contentWidth: number,
): void {
  doc.moveDown(0.4);
  field(doc, TEXT.judgeName, judge.judgeName);
  field(doc, TEXT.totalScore, formatScore(judge.totalScore));
  field(doc, TEXT.level, judge.level ? PITCHING_LEVEL_LABELS[judge.level] : NO_DATA);
  field(
    doc,
    TEXT.recommendation,
    judge.recommendation ? PITCHING_RECOMMENDATION_LABELS[judge.recommendation] : NO_DATA,
  );
  if (judge.recommendationReason) {
    field(doc, TEXT.recommendationReason, judge.recommendationReason);
  }
  field(doc, TEXT.submittedAt, formatDate(judge.submittedAt));

  if (judge.minimumConditions) {
    field(
      doc,
      TEXT.minimumConditions,
      `${judge.minimumConditions.passed ? TEXT.minimumPassed : TEXT.minimumFailed} · ` +
        `${TEXT.scoreCardTotal} ${judge.minimumConditions.scoreCardTotal ?? NO_DATA} · ` +
        `${TEXT.participationPct} ${judge.minimumConditions.participationPct ?? NO_DATA}`,
    );
  }

  const headers = [TEXT.criterionCode, TEXT.criterionTitle, TEXT.score, TEXT.note];
  const widths = tableWidths(doc, headers, [0.05, 0.55, 0.05, 0.35], contentWidth);
  gridRow(doc, headers, widths, true);
  for (const criterion of judge.criteria) {
    gridRow(
      doc,
      [
        criterion.code,
        criterion.title,
        `${criterion.score ?? NO_DATA} / ${criterion.maxScore}`,
        criterion.note ?? '',
      ],
      widths,
    );
  }

  for (const [key, label] of PITCHING_COMMENT_LABELS[round]) {
    field(doc, label, judge.comments[key] || NO_DATA);
  }
}

// Landscape: twelve columns of counts and labels do not fit the portrait width.
export function buildPitchingRankingPdf(
  round: PitchingStoreReport['round'],
  rows: PitchingSummaryItem[],
): Promise<Buffer> {
  const doc = createDoc('landscape');
  const contentWidth = contentWidthOf(doc);

  title(doc, TEXT.rankingTitle(PITCHING_ROUND_LABELS[round]));

  // เงื่อนไขขั้นต่ำ is on the acceleration form only — see the same split in
  // pitching-excel.util.ts. The freed width goes back to the store name.
  const hasMinimumConditions = round === PitchingRound.ACCELERATION;
  const headers = [
    TEXT.rank,
    TEXT.storeCode,
    TEXT.storeName,
    TEXT.province,
    TEXT.judgeCount,
    TEXT.avgScore,
    TEXT.level,
    ...(hasMinimumConditions ? [TEXT.minimumPassedCount] : []),
  ];
  // The spare width goes to the three columns carrying free text; the rest hold
  // a number or a fixed label and never run past their header.
  const widths = tableWidths(
    doc,
    headers,
    [0, 0.1, 0.7, 0.2, 0, 0, 0, ...(hasMinimumConditions ? [0] : [])],
    contentWidth,
  );
  gridRow(doc, headers, widths, true);

  if (rows.length === 0) {
    doc.text(TEXT.noStore);
    return toBuffer(doc);
  }

  for (const item of rows) {
    gridRow(
      doc,
      [
        String(item.rank),
        item.storeCode,
        item.storeName,
        item.province ?? NO_DATA,
        String(item.judgeCount),
        item.avgScore.toFixed(2),
        PITCHING_LEVEL_LABELS[item.level],
        ...(hasMinimumConditions ? [`${item.minimumPassedCount ?? 0} / ${item.judgeCount}`] : []),
      ],
      widths,
    );
  }

  return toBuffer(doc);
}
