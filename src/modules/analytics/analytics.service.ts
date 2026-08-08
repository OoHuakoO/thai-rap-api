import { Injectable } from '@nestjs/common';
import { PitchingRound, Round } from '@prisma/client';
import { ForbiddenException } from '@common/exceptions/app.exception';
import { ERROR_CODES, canReadAssessment } from '@constants/index';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { PitchingService } from '@modules/pitching/pitching.service';
import { StoreService } from '@modules/store/store.service';
import { DimensionService, type DimensionWithMax } from '@modules/assessment/dimension.service';
import { computeDimensionScores, getZone } from '@modules/assessment/assessment-scoring.util';
import { AnalyticsRepository, type AnalyticsRoundRow } from './analytics.repository';
import { buildAnalyticsWorkbook } from './analytics-excel.util';
import { computeIncubationReadiness } from './analytics-scoring.util';
import type { QueryAnalyticsDto } from './dto/query-analytics.dto';
import type {
  AnalyticsDimensionHighlight,
  AnalyticsKpis,
  AnalyticsRadarChart,
  AnalyticsRedFlag,
  AnalyticsTrend,
  StoreAnalyticsResult,
} from './types/analytics.type';

// Mirrors REPORT_ROUNDS in report.service.ts — kept local rather than shared
// because the two modules' repositories are independent (constants-organization.md:
// two modules using the same four literals doesn't outweigh not reaching into
// another module's file for a value this small).
const ALL_ROUNDS: Round[] = [Round.T0, Round.T1, Round.T2, Round.T3];

// The IRS terms that read individual questions. Absolute question numbers, the
// same load-bearing numbering as the red-flag ranges — see seed-data.md.
const MINDSET_QUESTIONS = [47, 48] as const;
const EVIDENCE_QUESTION = 49;
const MAX_SCORE_PER_QUESTION = 4;

const HIGHLIGHT_COUNT = 3;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly analyticsRepo: AnalyticsRepository,
    private readonly dimensionService: DimensionService,
    private readonly storeService: StoreService,
    private readonly pitchingService: PitchingService,
  ) {}

  async getStoreAnalytics(
    storeId: string,
    query: QueryAnalyticsDto,
    user: JwtPayload,
  ): Promise<StoreAnalyticsResult> {
    this.assertCanRead(user);
    const store = await this.storeService.findAccessible(storeId, user);
    const [baseRound, compareRound] = this.parseCompare(query.compare);

    const [rows, { dimensions }] = await Promise.all([
      this.analyticsRepo.findRoundsForStore(storeId),
      this.dimensionService.findScoringContext(),
    ]);
    const baseRow = rows.find((r) => r.round === baseRound);
    const compareRow = rows.find((r) => r.round === compareRound);
    const focusRow = compareRow ?? baseRow;

    const kpis = await this.buildKpis(
      storeId,
      baseRow,
      compareRow,
      compareRound,
      query.province ?? store.province ?? undefined,
      rows,
    );

    return {
      storeId: store.id,
      kpis,
      radar: this.buildRadar(rows, dimensions),
      trend: this.buildTrend(store.name, rows),
      strengths: this.buildHighlights(focusRow, dimensions, false),
      weaknesses: this.buildHighlights(focusRow, dimensions, true),
      redFlags: this.toRedFlags(focusRow),
    };
  }

  async getRadar(storeId: string, user: JwtPayload): Promise<AnalyticsRadarChart> {
    this.assertCanRead(user);
    await this.storeService.findAccessible(storeId, user);

    const [rows, { dimensions }] = await Promise.all([
      this.analyticsRepo.findRoundsForStore(storeId),
      this.dimensionService.findScoringContext(),
    ]);
    return this.buildRadar(rows, dimensions);
  }

  async getTrend(storeId: string, user: JwtPayload): Promise<AnalyticsTrend> {
    this.assertCanRead(user);
    const store = await this.storeService.findAccessible(storeId, user);
    const rows = await this.analyticsRepo.findRoundsForStore(storeId);
    return this.buildTrend(store.name, rows);
  }

  async exportAnalytics(
    storeId: string,
    query: QueryAnalyticsDto,
    user: JwtPayload,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const store = await this.storeService.findAccessible(storeId, user);
    const analytics = await this.getStoreAnalytics(storeId, query, user);
    const buffer = await buildAnalyticsWorkbook(store.name, analytics);
    return { buffer, filename: `analytics-${query.compare}-${storeId}.xlsx` };
  }

  private parseCompare(compare: string): [Round, Round] {
    const [base, target] = compare.split('vs') as [Round, Round];
    return [base, target];
  }

  private async buildKpis(
    storeId: string,
    baseRow: AnalyticsRoundRow | undefined,
    compareRow: AnalyticsRoundRow | undefined,
    compareRound: Round,
    province: string | undefined,
    allRows: AnalyticsRoundRow[],
  ): Promise<AnalyticsKpis> {
    const t0Score = baseRow?.totalScore ?? null;
    const t1Score = compareRow?.totalScore ?? null;
    const improvementRate =
      t0Score !== null && t1Score !== null && t0Score !== 0
        ? round2(((t1Score - t0Score) / t0Score) * 100)
        : null;
    const zone = t1Score !== null ? getZone(t1Score) : t0Score !== null ? getZone(t0Score) : null;

    const [cohort, incubationReadiness] = await Promise.all([
      this.analyticsRepo.findRankingCohort(compareRound, province),
      this.buildIncubationReadiness(storeId, allRows),
    ]);
    const ranked = [...cohort].sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));
    const rankIndex = compareRow ? ranked.findIndex((row) => row.storeId === storeId) : -1;

    return {
      t0Score,
      t1Score,
      improvementRate,
      zone,
      rankInProject: compareRow && rankIndex !== -1 ? rankIndex + 1 : null,
      totalStores: ranked.length,
      incubationReadiness,
    };
  }

  // IRS — the Incubation Readiness Score of project-conventions.md §Ranking:
  //
  //   T1 total × 0.40 + (T1 − T0) × 0.25 + pitching average × 0.20
  //   + mindset × 0.10 + evidence × 0.05
  //
  // Fixed on T0/T1 whatever `compare` asks for: it is the score the incubation
  // selection is made on, not a statistic about the pair the user is looking at.
  // `null` until T1 is submitted, because every term but the pitching one is
  // read off that round — a partial IRS would rank a store against others that
  // had the whole formula applied.
  //
  // The pitching term is PITCH_DECK, the round that decides entry to incubation.
  // Reading it here does not widen who may see a judge's work: it is one number
  // averaged over the panel, and the roles that reach /analytics are a different
  // (wider) list from PITCHING_READ_ROLES on purpose.
  private async buildIncubationReadiness(
    storeId: string,
    rows: AnalyticsRoundRow[],
  ): Promise<number | null> {
    const t1 = rows.find((row) => row.round === Round.T1);
    if (!t1?.totalScore) return null;

    const pitchingAvgScore = await this.pitchingService.getStoreAverageScore(
      storeId,
      PitchingRound.PITCH_DECK,
    );
    const rawScoreOf = (questionNo: number): number =>
      t1.scores.find((score) => score.question.questionNo === questionNo)?.rawScore ?? 0;

    return computeIncubationReadiness({
      t0Total: rows.find((row) => row.round === Round.T0)?.totalScore ?? 0,
      t1Total: t1.totalScore,
      pitchingAvgScore,
      mindsetRawScores: MINDSET_QUESTIONS.map(rawScoreOf),
      evidenceRawScore: rawScoreOf(EVIDENCE_QUESTION),
      maxScorePerQuestion: MAX_SCORE_PER_QUESTION,
    });
  }

  // Every submitted round, not the compared pair: the two dimension charts read
  // this payload and the web draws the whole funnel in one picture. A round with
  // no submitted assessment is left out rather than sent as an all-null series,
  // which would only add a legend entry that plots nothing.
  private buildRadar(
    rows: AnalyticsRoundRow[],
    dimensions: DimensionWithMax[],
  ): AnalyticsRadarChart {
    const seriesFor = (row: AnalyticsRoundRow): (number | null)[] => {
      const scoresByDimension = computeDimensionScores(
        row.scores
          .filter((s) => s.rawScore !== null)
          .map((s) => ({ dimensionId: s.question.dimensionId, rawScore: s.rawScore as number })),
        dimensions,
      );
      return dimensions.map((d) => round2(scoresByDimension.get(d.id) ?? 0));
    };

    const byRound = new Map(rows.map((row) => [row.round, row]));

    return {
      axes: dimensions.map((d) => d.name),
      series: ALL_ROUNDS.filter((round) => byRound.has(round)).map((round) => ({
        name: round,
        data: seriesFor(byRound.get(round) as AnalyticsRoundRow),
      })),
    };
  }

  private buildTrend(storeName: string, rows: AnalyticsRoundRow[]): AnalyticsTrend {
    const byRound = new Map(rows.map((row) => [row.round, row]));
    const data = ALL_ROUNDS.map((round) => byRound.get(round)?.totalScore ?? null);

    return {
      xAxis: ALL_ROUNDS,
      series: [{ name: storeName, data }],
    };
  }

  private buildHighlights(
    row: AnalyticsRoundRow | undefined,
    dimensions: DimensionWithMax[],
    ascending: boolean,
  ): AnalyticsDimensionHighlight[] {
    if (!row) return [];
    const scoresByDimension = computeDimensionScores(
      row.scores
        .filter((s) => s.rawScore !== null)
        .map((s) => ({ dimensionId: s.question.dimensionId, rawScore: s.rawScore as number })),
      dimensions,
    );
    const scored = dimensions.map((d) => ({
      dimensionId: d.id,
      name: d.name,
      score: round2(scoresByDimension.get(d.id) ?? 0),
    }));
    scored.sort((a, b) => (ascending ? a.score - b.score : b.score - a.score));
    return scored.slice(0, HIGHLIGHT_COUNT);
  }

  private toRedFlags(row: AnalyticsRoundRow | undefined): AnalyticsRedFlag[] {
    if (!row) return [];
    return row.redFlags.map((flag) => ({
      id: flag.id,
      assessmentId: flag.assessmentId,
      type: flag.type,
      severity: flag.severity,
      triggerQuestions: flag.triggerQuestions as number[],
      recommendation: flag.recommendation,
      resolved: flag.resolved,
    }));
  }

  // Same allow-list every assessment read answers to (api-contract.md) —
  // analytics is a rendering of the same scores, not a new surface.
  private assertCanRead(user: JwtPayload): void {
    if (!canReadAssessment(user.role)) {
      throw new ForbiddenException(ERROR_CODES.PERM.FORBIDDEN, 'ไม่มีสิทธิ์ดูข้อมูลวิเคราะห์');
    }
  }
}
