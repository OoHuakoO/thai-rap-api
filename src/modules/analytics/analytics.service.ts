import { Injectable } from '@nestjs/common';
import { Round } from '@prisma/client';
import { ForbiddenException } from '@common/exceptions/app.exception';
import { ERROR_CODES, canReadAssessment } from '@constants/index';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { StoreService } from '@modules/store/store.service';
import { DimensionService, type DimensionWithMax } from '@modules/assessment/dimension.service';
import { computeDimensionScores, getZone } from '@modules/assessment/assessment-scoring.util';
import { AnalyticsRepository, type AnalyticsRoundRow } from './analytics.repository';
import { buildAnalyticsWorkbook } from './analytics-excel.util';
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
    );

    return {
      storeId: store.id,
      kpis,
      radar: this.buildRadar(rows, dimensions),
      trend: this.buildTrend(store.name, rows),
      strengths: this.buildHighlights(focusRow, dimensions, false),
      weaknesses: this.buildHighlights(focusRow, dimensions, true),
      redFlags: this.toRedFlags(focusRow),
      aiAnalysis: null,
      mentorRecommendations: [],
      incubationStatus: null,
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

  // No IDP/action-plan data model exists yet (api-contract.md: "IDP and
  // Mentoring Log... are separate pages that do not exist yet") — this exists
  // so the route answers 200 with an empty list instead of 404, matching how
  // the frontend already renders an empty state for it.
  async getActionPlans(storeId: string, user: JwtPayload): Promise<[]> {
    this.assertCanRead(user);
    await this.storeService.findAccessible(storeId, user);
    return [];
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
  ): Promise<AnalyticsKpis> {
    const t0Score = baseRow?.totalScore ?? null;
    const t1Score = compareRow?.totalScore ?? null;
    const improvementRate =
      t0Score !== null && t1Score !== null && t0Score !== 0
        ? round2(((t1Score - t0Score) / t0Score) * 100)
        : null;
    const zone = t1Score !== null ? getZone(t1Score) : t0Score !== null ? getZone(t0Score) : null;

    const cohort = await this.analyticsRepo.findRankingCohort(compareRound, province);
    const ranked = [...cohort].sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));
    const rankIndex = compareRow ? ranked.findIndex((row) => row.storeId === storeId) : -1;

    return {
      t0Score,
      t1Score,
      improvementRate,
      zone,
      rankInProject: compareRow && rankIndex !== -1 ? rankIndex + 1 : null,
      totalStores: ranked.length,
      incubationReadiness: null,
    };
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
    const firstGap = data.findIndex((value) => value === null);
    const actualCount = firstGap === -1 ? data.length : firstGap;

    return {
      xAxis: ALL_ROUNDS,
      series: [{ name: storeName, data, actualCount }],
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
