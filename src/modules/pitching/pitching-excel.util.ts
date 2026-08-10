import { Workbook } from 'exceljs';
import { PitchingRound } from '@prisma/client';
import { NO_DATA, SCORE_FORMAT, formatDate, styleHeaderRow } from '@shared/excel-sheet.util';
import {
  PITCHING_COMMENT_LABELS,
  PITCHING_EXPORT_TEXT as TEXT,
  PITCHING_LEVEL_LABELS,
  PITCHING_RECOMMENDATION_LABELS,
  PITCHING_ROUND_LABELS,
} from './pitching-export.const';
import type { PitchingStoreReport, PitchingSummaryItem } from './types/pitching.type';

export async function buildPitchingStoreReportWorkbook(
  report: PitchingStoreReport,
): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(TEXT.storeReportSheet);
  sheet.columns = [{ width: 10 }, { width: 46 }, { width: 12 }, { width: 12 }, { width: 14 }];

  sheet.addRow([TEXT.storeName, report.storeName]);
  sheet.addRow([TEXT.storeCode, report.storeCode]);
  sheet.addRow([TEXT.province, report.province ?? NO_DATA]);
  sheet.addRow([TEXT.round, PITCHING_ROUND_LABELS[report.round]]);
  sheet.addRow([TEXT.avgScore, report.avgScore ?? NO_DATA]);
  sheet.addRow([TEXT.level, report.level ? PITCHING_LEVEL_LABELS[report.level] : NO_DATA]);
  sheet.addRow([TEXT.rank, report.rank ?? NO_DATA]);
  sheet.addRow([TEXT.rankedStoreCount, report.rankedStoreCount]);
  sheet.addRow([TEXT.judgeCount, report.judgeCount]);
  sheet.addRow([TEXT.selectedCount, report.recommendationCounts.SELECTED]);
  sheet.addRow([TEXT.waitingListCount, report.recommendationCounts.WAITING_LIST]);
  sheet.addRow([TEXT.minimumNotMetCount, report.recommendationCounts.MINIMUM_NOT_MET]);
  sheet.addRow([TEXT.notSelectedCount, report.recommendationCounts.NOT_SELECTED]);
  sheet.getColumn(1).font = { bold: true };

  sheet.addRow([]);
  const criterionHeader = sheet.rowCount + 1;
  sheet.addRow([
    TEXT.criterionCode,
    TEXT.criterionTitle,
    TEXT.criterionMax,
    TEXT.criterionAvg,
    TEXT.criterionPct,
  ]);
  styleHeaderRow(sheet, criterionHeader);
  for (const criterion of report.criteria) {
    const row = sheet.addRow([
      criterion.code,
      criterion.title,
      criterion.maxScore,
      criterion.avgScore,
      criterion.avgPct,
    ]);
    row.getCell(4).numFmt = SCORE_FORMAT;
    row.getCell(5).numFmt = SCORE_FORMAT;
  }

  addJudgeSheet(workbook, report);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// One row per judge per criterion, plus the judge's own header block — the same
// information the screen shows, laid out so it can be filtered and pivoted.
function addJudgeSheet(workbook: Workbook, report: PitchingStoreReport): void {
  const sheet = workbook.addWorksheet(TEXT.judgeSheet);
  sheet.columns = [{ width: 26 }, { width: 10 }, { width: 40 }, { width: 10 }, { width: 46 }];

  if (report.judges.length === 0) {
    sheet.addRow([TEXT.noJudge]);
    return;
  }

  for (const judge of report.judges) {
    const headerRow = sheet.rowCount + 1;
    sheet.addRow([TEXT.judgeName, judge.judgeName]);
    styleHeaderRow(sheet, headerRow);
    sheet.addRow([TEXT.totalScore, judge.totalScore ?? NO_DATA]);
    sheet.addRow([TEXT.level, judge.level ? PITCHING_LEVEL_LABELS[judge.level] : NO_DATA]);
    sheet.addRow([
      TEXT.recommendation,
      judge.recommendation ? PITCHING_RECOMMENDATION_LABELS[judge.recommendation] : NO_DATA,
    ]);
    sheet.addRow([TEXT.recommendationReason, judge.recommendationReason ?? NO_DATA]);
    sheet.addRow([TEXT.submittedAt, formatDate(judge.submittedAt)]);
    if (judge.minimumConditions) {
      sheet.addRow([TEXT.scoreCardTotal, judge.minimumConditions.scoreCardTotal ?? NO_DATA]);
      sheet.addRow([TEXT.participationPct, judge.minimumConditions.participationPct ?? NO_DATA]);
      sheet.addRow([
        TEXT.minimumConditions,
        judge.minimumConditions.passed ? TEXT.minimumPassed : TEXT.minimumFailed,
      ]);
    }

    const scoreHeader = sheet.rowCount + 1;
    sheet.addRow([
      TEXT.criterionCode,
      TEXT.criterionTitle,
      TEXT.criterionMax,
      TEXT.score,
      TEXT.note,
    ]);
    styleHeaderRow(sheet, scoreHeader);
    for (const criterion of judge.criteria) {
      sheet.addRow([
        criterion.code,
        criterion.title,
        criterion.maxScore,
        criterion.score ?? NO_DATA,
        criterion.note ?? '',
      ]);
    }

    for (const [key, label] of PITCHING_COMMENT_LABELS[report.round]) {
      sheet.addRow([label, judge.comments[key] ?? NO_DATA]);
    }
    sheet.addRow([]);
  }
}

export async function buildPitchingRankingWorkbook(
  round: PitchingStoreReport['round'],
  rows: PitchingSummaryItem[],
): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(TEXT.rankingSheet);
  // เงื่อนไขขั้นต่ำ and the ไม่ผ่านขั้นต่ำ verdict are on the acceleration form
  // only, so on a pitch deck sheet both columns would be a header over a column
  // of zeroes for a gate that form does not have. Drop them instead.
  const hasMinimumConditions = round === PitchingRound.ACCELERATION;
  sheet.columns = [
    { width: 8 },
    { width: 14 },
    { width: 32 },
    { width: 16 },
    { width: 12 },
    { width: 14 },
    { width: 18 },
    ...(hasMinimumConditions ? [{ width: 18 }] : []),
    { width: 14 },
    { width: 14 },
    ...(hasMinimumConditions ? [{ width: 18 }] : []),
    { width: 20 },
  ];

  sheet.addRow([TEXT.rankingTitle(PITCHING_ROUND_LABELS[round])]).font = { bold: true };
  sheet.addRow([]);

  const headerRow = sheet.rowCount + 1;
  sheet.addRow([
    TEXT.rank,
    TEXT.storeCode,
    TEXT.storeName,
    TEXT.province,
    TEXT.judgeCount,
    TEXT.avgScore,
    TEXT.level,
    ...(hasMinimumConditions ? [TEXT.minimumPassedCount] : []),
    TEXT.selectedCount,
    TEXT.waitingListCount,
    ...(hasMinimumConditions ? [TEXT.minimumNotMetCount] : []),
    TEXT.notSelectedCount,
  ]);
  styleHeaderRow(sheet, headerRow);

  if (rows.length === 0) {
    sheet.addRow([TEXT.noStore]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  for (const item of rows) {
    const row = sheet.addRow([
      item.rank,
      item.storeCode,
      item.storeName,
      item.province ?? NO_DATA,
      item.judgeCount,
      item.avgScore,
      PITCHING_LEVEL_LABELS[item.level],
      ...(hasMinimumConditions ? [`${item.minimumPassedCount ?? 0} / ${item.judgeCount}`] : []),
      item.recommendationCounts.SELECTED,
      item.recommendationCounts.WAITING_LIST,
      ...(hasMinimumConditions ? [item.recommendationCounts.MINIMUM_NOT_MET] : []),
      item.recommendationCounts.NOT_SELECTED,
    ]);
    row.getCell(6).numFmt = SCORE_FORMAT;
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
