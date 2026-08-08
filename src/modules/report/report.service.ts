import { Injectable } from '@nestjs/common';
import type { Question } from '@prisma/client';
import { Round } from '@prisma/client';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { ForbiddenException, NotFoundException } from '@common/exceptions/app.exception';
import {
  ERROR_CODES,
  canReadAssessment,
  isAdminRole,
  STORE_UNSPECIFIED_LABEL,
} from '@constants/index';
import {
  buildPaginationMeta,
  normalizePagination,
  type PaginationParams,
} from '@shared/pagination.util';
import { resolveStoreScope } from '@shared/store-scope.util';
import { DimensionService } from '@modules/assessment/dimension.service';
import {
  computeDimensionScores,
  computeTotalScore,
  getOverallLevel,
  getZone,
  type DimensionInfo,
} from '@modules/assessment/assessment-scoring.util';
import { StoreService } from '@modules/store/store.service';
import { REPORT_FORMATS, type ReportFormat } from '@common/dto/export-format.dto';
import { buildOverviewReportWorkbook, buildRoundReportWorkbook } from './report-excel.util';
import { buildOverviewReportPdf, buildRoundReportPdf } from './report-pdf.util';
import {
  ReportRepository,
  type MatrixSlice,
  type RoundMatrixRowData,
  type RoundReportRow,
} from './report.repository';
import type {
  AvailableReport,
  OverviewReport,
  OverviewRoundSummary,
  ReportDimensionDetail,
  ReportDimensionScore,
  ReportStore,
  RoundMatrixDimension,
  RoundMatrixExportSource,
  RoundMatrixReport,
  RoundMatrixRow,
  RoundReport,
} from './types/report.type';

interface ScoringContext {
  dimensions: { info: DimensionInfo; name: string }[];
  questions: Question[];
  /** Σ Question.maxScore across every question — the 200-point denominator. */
  maxScore: number;
}

interface MatrixContext {
  round: Round;
  /** null is "no narrowing"; an empty array is a caller who reaches no store. */
  storeIds: string[] | null;
  scoring: ScoringContext;
}

export const REPORT_ROUNDS: Round[] = [Round.T0, Round.T1, Round.T2, Round.T3];

// The dashboard card shows a handful of rows and links to /reports for the rest.
export const RECENT_REPORT_LIMIT = 5;

// How many stores an export pulls per query. Big enough that a 400-store round
// is a couple of round trips, small enough that the batch stays small next to
// the rows already written out.
const MATRIX_EXPORT_BATCH_SIZE = 200;

function isEmptyScope(storeIds: string[] | null): boolean {
  return storeIds !== null && storeIds.length === 0;
}

const REPORT_FORMAT_LABEL: Record<ReportFormat, AvailableReport['format']> = {
  xlsx: 'XLSX',
  pdf: 'PDF',
};

const REPORT_NAME = {
  round: (storeName: string, round: Round) => `รายงานผลการประเมิน ${round} - ${storeName}`,
  overview: (storeName: string) => `รายงานสรุปผลทุกรอบ - ${storeName}`,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : round2((part / whole) * 100);
}

function toScoredQuestions(row: {
  scores: { rawScore: number | null; question: { dimensionId: number } }[];
}): { dimensionId: number; rawScore: number }[] {
  return row.scores
    .filter((score) => score.rawScore !== null)
    .map((score) => ({
      dimensionId: score.question.dimensionId,
      rawScore: score.rawScore as number,
    }));
}

@Injectable()
export class ReportService {
  constructor(
    private readonly reportRepo: ReportRepository,
    private readonly dimensionService: DimensionService,
    private readonly storeService: StoreService,
  ) {}

  // Access is delegated to loadStore below, which throws for an ENTREPRENEUR
  // reading a store it does not own — that single check is what makes
  // "ร้านเข้าถึงได้เฉพาะของตนเอง" true for every report here.
  async getRoundReport(storeId: string, round: Round, user: JwtPayload): Promise<RoundReport> {
    const store = await this.loadStore(storeId, user);

    const row = await this.reportRepo.findSubmittedRound(storeId, round);
    if (!row) {
      throw new NotFoundException(
        ERROR_CODES.RPT.NOT_FOUND,
        `ยังไม่มีผลการประเมินรอบ ${round} ของร้านนี้`,
      );
    }

    const scoring = await this.loadScoring();
    const details = this.toDimensionDetails(row, scoring);
    const rawScore = details.reduce((sum, detail) => sum + detail.rawScore, 0);
    const answered = row.scores.filter((score) => score.rawScore !== null).length;

    return {
      store,
      round: row.round,
      totalScore: row.totalScore === null ? null : round2(row.totalScore),
      zone: row.totalScore === null ? null : getZone(row.totalScore),
      assessorName: row.assessor.name,
      submittedAt: row.submittedAt,
      notes: row.notes,
      rawScore,
      maxScore: scoring.maxScore,
      rawScorePct: percent(rawScore, scoring.maxScore),
      completionPct: percent(answered, scoring.questions.length),
      dimensions: details,
      redFlags: row.redFlags.map((flag) => ({
        type: flag.type,
        severity: flag.severity,
        triggerQuestions: flag.triggerQuestions as number[],
        resolved: flag.resolved,
      })),
    };
  }

  async getOverviewReport(storeId: string, user: JwtPayload): Promise<OverviewReport> {
    const store = await this.loadStore(storeId, user);

    const [rows, scoring] = await Promise.all([
      this.reportRepo.findSubmittedRounds(storeId),
      this.loadScoring(),
    ]);
    const dimensions = scoring.dimensions;

    const byRound = new Map(rows.map((row) => [row.round, row]));

    const rounds: OverviewRoundSummary[] = [];
    let previousScore: number | null = null;
    for (const round of REPORT_ROUNDS) {
      const row = byRound.get(round);
      if (!row) continue;

      const score = row.totalScore === null ? null : round2(row.totalScore);
      rounds.push({
        round,
        totalScore: score,
        zone: score === null ? null : getZone(score),
        delta: score !== null && previousScore !== null ? round2(score - previousScore) : null,
        submittedAt: row.submittedAt,
      });
      if (score !== null) previousScore = score;
    }

    const dimensionTrends = dimensions.map((dimension) => {
      const scoresByRound: Partial<Record<Round, number>> = {};
      for (const row of rows) {
        const perDimension = this.toDimensionScores(row, dimensions);
        const match = perDimension.find((entry) => entry.dimensionId === dimension.info.id);
        if (match) scoresByRound[row.round] = match.scorePct;
      }
      return {
        dimensionId: dimension.info.id,
        dimensionName: dimension.name,
        weight: dimension.info.weight,
        scoresByRound,
      };
    });

    return {
      store,
      rounds,
      dimensionTrends,
      unresolvedRedFlagCount: rows.reduce(
        (sum, row) => sum + row.redFlags.filter((flag) => !flag.resolved).length,
        0,
      ),
    };
  }

  // Cross-store, one round: "ผลค่าคะแนนแต่ละมิติของทุกร้าน ของแต่ละ T". This is the
  // only report that puts one store's scores in front of another store's
  // people, so it is ADMIN / SUPER_ADMIN only — narrower than the rest of
  // /reports, which answers all of ASSESSMENT_READ_ROLES.
  async getRoundMatrixReport(
    round: Round,
    user: JwtPayload,
    pagination: PaginationParams = {},
  ): Promise<RoundMatrixReport> {
    const { storeIds, scoring } = await this.openMatrix(round, user);
    const { skip, take, page, limit } = normalizePagination(pagination);

    const [total, data] = await Promise.all([
      this.countMatrixStores(round, storeIds),
      this.findMatrixSlice(round, storeIds, { skip, take }),
    ]);

    return {
      round,
      dimensions: this.toMatrixDimensions(scoring),
      rows: data.map((row) => this.toMatrixRow(row, scoring)),
      ...(await this.cohortAverages(round, storeIds, scoring, total)),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  // The download is the whole round, not the page the table happens to be on —
  // filtering an export to the visible rows would hand back a file nobody can
  // work from. Nothing is read here beyond the access check and the cohort
  // aggregate, so a 403 still lands before a byte of the file is written.
  async openRoundMatrixExport(round: Round, user: JwtPayload): Promise<RoundMatrixExportSource> {
    const { storeIds, scoring } = await this.openMatrix(round, user);
    const storeCount = await this.countMatrixStores(round, storeIds);

    return {
      round,
      dimensions: this.toMatrixDimensions(scoring),
      storeCount,
      ...(await this.cohortAverages(round, storeIds, scoring, storeCount)),
      rows: this.iterateMatrixRows(round, storeIds, scoring),
    };
  }

  async exportRoundReport(
    storeId: string,
    round: Round,
    format: ReportFormat,
    user: JwtPayload,
  ): Promise<Buffer> {
    const report = await this.getRoundReport(storeId, round, user);
    return format === 'pdf' ? buildRoundReportPdf(report) : buildRoundReportWorkbook(report);
  }

  async exportOverviewReport(
    storeId: string,
    format: ReportFormat,
    user: JwtPayload,
  ): Promise<Buffer> {
    const report = await this.getOverviewReport(storeId, user);
    return format === 'pdf' ? buildOverviewReportPdf(report) : buildOverviewReportWorkbook(report);
  }

  // Two report kinds per store, per แบบ 50 ข้อ: one per assessed round, and one
  // spanning every round. Both come straight from the submitted assessments the
  // caller may read, so a store sees its reports the moment a round is submitted
  // — nothing has to be exported first for the list to fill.
  async listAvailableReports(user: JwtPayload): Promise<AvailableReport[]> {
    // JUDGE and VIEWER read no assessment, so no report exists for them. An empty
    // list keeps the dashboard card rendering instead of 403-ing the whole page.
    if (!canReadAssessment(user.role)) return [];

    // Same narrowing every other read of this data gets: an ENTREPRENEUR lists
    // its own store's reports, an ASSESSOR or a MENTOR its assignment list's.
    // Anything wider would put a store's scores in front of people who 403 on
    // the export link the row carries.
    const rows = await this.reportRepo.findRecentSubmitted(
      RECENT_REPORT_LIMIT,
      resolveStoreScope(user),
    );

    const reports: AvailableReport[] = [];
    const storesWithOverview = new Set<string>();

    for (const row of rows) {
      // findRecentSubmitted filters these out; the select type stays nullable.
      if (!row.submittedAt) continue;

      for (const format of REPORT_FORMATS) {
        reports.push({
          id: `${row.storeId}:${row.round}:${format}`,
          name: REPORT_NAME.round(row.store.name, row.round),
          format: REPORT_FORMAT_LABEL[format],
          status: 'DONE',
          createdAt: row.submittedAt,
          downloadPath: `/reports/stores/${row.storeId}/rounds/${row.round}/export?format=${format}`,
        });
      }

      // The overview spans every round, so a store contributes it once, dated by
      // its newest round — rows arrive newest first, so the first one wins.
      if (storesWithOverview.has(row.storeId)) continue;
      storesWithOverview.add(row.storeId);

      for (const format of REPORT_FORMATS) {
        reports.push({
          id: `${row.storeId}:overview:${format}`,
          name: REPORT_NAME.overview(row.store.name),
          format: REPORT_FORMAT_LABEL[format],
          status: 'DONE',
          createdAt: row.submittedAt,
          downloadPath: `/reports/stores/${row.storeId}/overview/export?format=${format}`,
        });
      }
    }

    return reports
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, RECENT_REPORT_LIMIT);
  }

  private async openMatrix(round: Round, user: JwtPayload): Promise<MatrixContext> {
    if (!isAdminRole(user.role)) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'ไม่มีสิทธิ์ดูรายงานคะแนนรายมิติของทุกร้าน',
      );
    }

    // Admin roles are unscoped today, so this resolves to null. It stays because
    // it is what keeps the query narrowed if the gate above ever widens — an
    // empty scope must reach no store, while `undefined` reaches every one.
    const [storeIds, scoring] = await Promise.all([
      this.storeService.findAccessibleStoreIds(user),
      this.loadScoring(),
    ]);
    return { round, storeIds, scoring };
  }

  private countMatrixStores(round: Round, storeIds: string[] | null): Promise<number> {
    if (isEmptyScope(storeIds)) return Promise.resolve(0);
    return this.reportRepo.countSubmittedByRound(round, storeIds ?? undefined);
  }

  private findMatrixSlice(
    round: Round,
    storeIds: string[] | null,
    slice: MatrixSlice,
  ): Promise<RoundMatrixRowData[]> {
    if (isEmptyScope(storeIds)) return Promise.resolve([]);
    return this.reportRepo.findSubmittedByRound(round, storeIds ?? undefined, slice);
  }

  // Averaged over the whole round rather than the rows in hand, so the ค่าเฉลี่ย
  // line means the same thing on page 1 and page 9 — and so the number survives
  // an export that never holds every row at once. Summing the raw scores in the
  // database gives the same value as averaging the stores' percentages, because
  // every store is scored out of the same maxTotal.
  private async cohortAverages(
    round: Round,
    storeIds: string[] | null,
    scoring: ScoringContext,
    storeCount: number,
  ): Promise<Pick<RoundMatrixReport, 'averageByDimension' | 'averageWeightedScore'>> {
    if (storeCount === 0) return { averageByDimension: {}, averageWeightedScore: null };

    const sums = await this.reportRepo.sumRawScoresByQuestion(round, storeIds ?? undefined);
    const dimensionOfQuestion = new Map(
      scoring.questions.map((question) => [question.id, question.dimensionId]),
    );

    const rawByDimension = new Map<number, number>();
    for (const sum of sums) {
      const dimensionId = dimensionOfQuestion.get(sum.questionId);
      if (dimensionId === undefined) continue;
      rawByDimension.set(dimensionId, (rawByDimension.get(dimensionId) ?? 0) + sum.rawScore);
    }

    const averageByDimension: Record<number, number> = {};
    let weighted = 0;
    for (const { info } of scoring.dimensions) {
      const full = storeCount * info.maxTotal;
      const mean = full === 0 ? 0 : ((rawByDimension.get(info.id) ?? 0) / full) * 100;
      averageByDimension[info.id] = round2(mean);
      weighted += (mean * info.weight) / 100;
    }

    return { averageByDimension, averageWeightedScore: round2(weighted) };
  }

  // Read in batches and yielded one at a time: an export of a cohort in the
  // thousands must not put every store's 50 scores in memory at once, and the
  // writers consume a row and forget it.
  private async *iterateMatrixRows(
    round: Round,
    storeIds: string[] | null,
    scoring: ScoringContext,
  ): AsyncGenerator<RoundMatrixRow> {
    if (isEmptyScope(storeIds)) return;

    for (let skip = 0; ; skip += MATRIX_EXPORT_BATCH_SIZE) {
      const batch = await this.reportRepo.findSubmittedByRound(round, storeIds ?? undefined, {
        skip,
        take: MATRIX_EXPORT_BATCH_SIZE,
      });
      for (const row of batch) yield this.toMatrixRow(row, scoring);
      if (batch.length < MATRIX_EXPORT_BATCH_SIZE) return;
    }
  }

  private toMatrixDimensions(scoring: ScoringContext): RoundMatrixDimension[] {
    return scoring.dimensions.map((dimension) => ({
      dimensionId: dimension.info.id,
      dimensionName: dimension.name,
      weight: dimension.info.weight,
    }));
  }

  // Every report — round, overview, and both Excel/PDF exports — enters through
  // here, so this is the one place the role gate has to hold. A report is just a
  // rendering of assessment scores, so it answers to the same allow-list.
  private async loadStore(storeId: string, user: JwtPayload): Promise<ReportStore> {
    if (!canReadAssessment(user.role)) {
      throw new ForbiddenException(ERROR_CODES.PERM.FORBIDDEN, 'ไม่มีสิทธิ์ดูรายงานผลการประเมิน');
    }
    const store = await this.storeService.findAccessible(storeId, user);
    return {
      id: store.id,
      name: store.name,
      province: store.province ?? STORE_UNSPECIFIED_LABEL,
      storeType: store.storeType ?? STORE_UNSPECIFIED_LABEL,
      ownerName: store.ownerName ?? STORE_UNSPECIFIED_LABEL,
    };
  }

  private async loadScoring(): Promise<ScoringContext> {
    const { dimensions, questions } = await this.dimensionService.findScoringContext();

    return {
      dimensions: dimensions.map((dimension) => ({
        name: dimension.name,
        info: { id: dimension.id, weight: dimension.weight, maxTotal: dimension.maxTotal },
      })),
      questions,
      maxScore: questions.reduce((sum, question) => sum + question.maxScore, 0),
    };
  }

  // The per-question view: every question the master defines, not only the ones
  // the assessor answered, so an unanswered question shows as a gap rather than
  // disappearing from the report.
  private toDimensionDetails(
    row: RoundReportRow,
    scoring: ScoringContext,
  ): ReportDimensionDetail[] {
    const rawByQuestionNo = new Map(
      row.scores.map((score) => [score.question.questionNo, score.rawScore]),
    );
    const percentages = computeDimensionScores(
      toScoredQuestions(row),
      scoring.dimensions.map((dimension) => dimension.info),
    );

    return scoring.dimensions.map((dimension) => {
      const questions = scoring.questions
        .filter((question) => question.dimensionId === dimension.info.id)
        .sort((a, b) => a.questionNo - b.questionNo)
        .map((question) => ({
          questionNo: question.questionNo,
          questionText: question.questionText,
          rawScore: rawByQuestionNo.get(question.questionNo) ?? null,
          maxScore: question.maxScore,
        }));

      const scorePct = round2(percentages.get(dimension.info.id) ?? 0);

      return {
        dimensionId: dimension.info.id,
        dimensionName: dimension.name,
        weight: dimension.info.weight,
        scorePct,
        rawScore: questions.reduce((sum, question) => sum + (question.rawScore ?? 0), 0),
        maxScore: dimension.info.maxTotal,
        weightedScore: round2((scorePct * dimension.info.weight) / 100),
        questions,
      };
    });
  }

  private toMatrixRow(row: RoundMatrixRowData, scoring: ScoringContext): RoundMatrixRow {
    const infos = scoring.dimensions.map((dimension) => dimension.info);
    const scored = toScoredQuestions(row);
    const percentages = computeDimensionScores(scored, infos);

    const rawScore = scored.reduce((sum, score) => sum + score.rawScore, 0);
    const weighted =
      row.totalScore === null ? computeTotalScore(percentages, infos) : row.totalScore;

    const scoresByDimension: Record<number, number> = {};
    for (const dimension of scoring.dimensions) {
      scoresByDimension[dimension.info.id] = round2(percentages.get(dimension.info.id) ?? 0);
    }

    // "มิติเร่งแก้ไข" is only meaningful once something was scored — an untouched
    // round would otherwise always name dimension 1 at a flat 0%.
    const critical =
      scored.length === 0
        ? null
        : scoring.dimensions.reduce((lowest, dimension) =>
            scoresByDimension[dimension.info.id] < scoresByDimension[lowest.info.id]
              ? dimension
              : lowest,
          );

    return {
      storeId: row.storeId,
      storeCode: row.store.code,
      storeName: row.store.name,
      province: row.store.province ?? STORE_UNSPECIFIED_LABEL,
      completionPct: percent(scored.length, scoring.questions.length),
      rawScore,
      rawScorePct: percent(rawScore, scoring.maxScore),
      weightedScore: round2(weighted),
      overallLevel: getOverallLevel(weighted),
      redFlagCount: row.redFlags.length,
      unresolvedRedFlagCount: row.redFlags.filter((flag) => !flag.resolved).length,
      criticalDimensionId: critical?.info.id ?? null,
      criticalDimensionName: critical?.name ?? null,
      scoresByDimension,
    };
  }

  private toDimensionScores(
    row: RoundReportRow,
    dimensions: { info: DimensionInfo; name: string }[],
  ): ReportDimensionScore[] {
    const byDimension = computeDimensionScores(
      toScoredQuestions(row),
      dimensions.map((d) => d.info),
    );

    return dimensions.map((dimension) => ({
      dimensionId: dimension.info.id,
      dimensionName: dimension.name,
      weight: dimension.info.weight,
      scorePct: round2(byDimension.get(dimension.info.id) ?? 0),
    }));
  }
}
