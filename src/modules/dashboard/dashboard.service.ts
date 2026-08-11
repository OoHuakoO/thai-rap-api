import { Injectable } from '@nestjs/common';
import { NewsType, Round, StoreStatus } from '@prisma/client';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { ForbiddenException } from '@common/exceptions/app.exception';
import {
  ERROR_CODES,
  STORE_TARGET_TOTAL,
  STORE_UNSPECIFIED_LABEL,
  canReadOverview,
} from '@constants/index';
import { resolveStoreScope } from '@shared/store-scope.util';
import { NewsService } from '@modules/news/news.service';
import { ReportService } from '@modules/report/report.service';
import { buildStoreScoresWorkbook } from './dashboard-export.util';
import {
  DashboardRepository,
  type StatusCountRow,
  type StoreScoreRow,
} from './dashboard.repository';
import {
  PROVINCE_COMPARISON_DEFAULT_FROM,
  PROVINCE_COMPARISON_DEFAULT_TO,
  type QueryProvinceComparisonDto,
} from './dto/query-province-comparison.dto';
import { TOP20_ALL_ROUNDS, type QueryTop20Dto } from './dto/query-top20.dto';
import type {
  ActivityItem,
  DashboardKPIs,
  IncubationStep,
  ProvinceComparison,
  ProvinceDistributionItem,
  ReportStatusItem,
  StoreRoundScores,
  Top20Entry,
} from './types/dashboard.type';

const TOP20_LIMIT = 20;

// The web grouped bar chart collides its axis and value labels past this many
// provinces, and it renders every row the endpoint returns.
const PROVINCE_COMPARISON_LIMIT = 5;

const SELECTED_STATUSES: StoreStatus[] = [
  StoreStatus.SELECTED,
  StoreStatus.FIELD_AUDITED,
  StoreStatus.IDP_CREATED,
  StoreStatus.COMPLETED,
];

// The web funnel stamps a fixed T0/T1/T2/T3 badge on each position, so step N
// must report round N's submissions — not a Store.status stage, which advances
// on a different trigger and would leave the badge and the count disagreeing.
const INCUBATION_ROUND_STEPS: { label: string; round: Round }[] = [
  { label: 'คัดกรองเบื้องต้น', round: Round.T0 },
  { label: 'ประเมิน T1', round: Round.T1 },
  { label: 'พัฒนาศักยภาพ', round: Round.T2 },
  { label: 'ประเมิน', round: Round.T3 },
];

const INCUBATION_SELECTED_STEP_LABEL = 'ผ่านเข้ารอบ';

const ASSESSMENT_ROUNDS: Round[] = [Round.T0, Round.T1, Round.T2, Round.T3];

const ACTIVITY_NEWS_LIMIT = 10;

const NEWS_TYPE_TO_ACTIVITY: Record<NewsType, ActivityItem['type']> = {
  [NewsType.GENERAL]: 'announcement',
  [NewsType.EVENT]: 'event',
  [NewsType.ALERT]: 'warning',
};

// A store counts once no matter how many rounds it improved in: the KPI is
// "stores that improved at any point", not "number of improvements". Rounds a
// store never submitted are skipped, so T0 → T2 still compares as consecutive.
function hasImprovedInAnyRound(scores: Map<Round, number>): boolean {
  let previous: number | undefined;
  for (const round of ASSESSMENT_ROUNDS) {
    const score = scores.get(round);
    if (score === undefined) continue;
    if (previous !== undefined && score > previous) return true;
    previous = score;
  }
  return false;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toPercentage(part: number, total: number): number {
  return total > 0 ? round2((part / total) * 100) : 0;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function countSelected(statusCounts: StatusCountRow[]): number {
  return statusCounts
    .filter((row) => SELECTED_STATUSES.includes(row.status))
    .reduce((sum, row) => sum + row.count, 0);
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly dashboardRepo: DashboardRepository,
    private readonly newsService: NewsService,
    private readonly reportService: ReportService,
  ) {}

  async getKpis(user: JwtPayload): Promise<DashboardKPIs> {
    this.assertCanRead(user);
    const scope = resolveStoreScope(user);

    const [
      totalStores,
      t0Completed,
      t1Completed,
      t2Completed,
      t3Completed,
      statusCounts,
      roundScores,
      latestScores,
      lastUpdated,
    ] = await Promise.all([
      this.dashboardRepo.countStores(scope),
      this.dashboardRepo.countSubmittedByRound(Round.T0, scope),
      this.dashboardRepo.countSubmittedByRound(Round.T1, scope),
      this.dashboardRepo.countSubmittedByRound(Round.T2, scope),
      this.dashboardRepo.countSubmittedByRound(Round.T3, scope),
      this.dashboardRepo.countStoresByStatus(scope),
      this.dashboardRepo.findRoundScores(ASSESSMENT_ROUNDS, scope),
      this.dashboardRepo.findLatestScores(scope),
      this.dashboardRepo.findLastSubmittedAt(scope),
    ]);

    const scoresByStore = new Map<string, Map<Round, number>>();
    for (const row of roundScores) {
      if (row.totalScore === null) continue;
      const entry = scoresByStore.get(row.storeId) ?? new Map<Round, number>();
      entry.set(row.round, row.totalScore);
      scoresByStore.set(row.storeId, entry);
    }

    let improvedStores = 0;
    for (const entry of scoresByStore.values()) {
      if (hasImprovedInAnyRound(entry)) improvedStores += 1;
    }

    const selectedStores = countSelected(statusCounts);

    return {
      totalStores,
      targetStores: STORE_TARGET_TOTAL,
      t0Completed,
      t0Percentage: toPercentage(t0Completed, totalStores),
      t1Completed,
      t1Percentage: toPercentage(t1Completed, totalStores),
      t2Completed,
      t2Percentage: toPercentage(t2Completed, totalStores),
      t3Completed,
      t3Percentage: toPercentage(t3Completed, totalStores),
      selectedStores,
      selectedPercentage: toPercentage(selectedStores, totalStores),
      improvedStores,
      improvementRate: toPercentage(improvedStores, totalStores),
      avgScore: average(
        latestScores
          .map((row) => row.totalScore)
          .filter((score): score is number => score !== null),
      ),
      lastUpdated,
    };
  }

  async getProvinceDistribution(user: JwtPayload): Promise<ProvinceDistributionItem[]> {
    this.assertCanRead(user);
    const rows = await this.dashboardRepo.countStoresByProvince(resolveStoreScope(user));
    const total = rows.reduce((sum, row) => sum + row.count, 0);

    return rows.map((row) => ({
      province: row.province ?? STORE_UNSPECIFIED_LABEL,
      count: row.count,
      percentage: toPercentage(row.count, total),
    }));
  }

  async getTop20(query: QueryTop20Dto, user: JwtPayload): Promise<Top20Entry[]> {
    this.assertCanRead(user);
    const scope = resolveStoreScope(user);
    const round = query.round ?? TOP20_ALL_ROUNDS;
    const rows =
      round === TOP20_ALL_ROUNDS
        ? await this.dashboardRepo.findLatestScores(scope)
        : await this.dashboardRepo.findScoresByRound(round, TOP20_LIMIT, scope);

    return this.toTop20Entries(rows);
  }

  async getIncubationProgress(user: JwtPayload): Promise<IncubationStep[]> {
    this.assertCanRead(user);
    const scope = resolveStoreScope(user);

    const [totalStores, statusCounts, roundCounts] = await Promise.all([
      this.dashboardRepo.countStores(scope),
      this.dashboardRepo.countStoresByStatus(scope),
      Promise.all(
        INCUBATION_ROUND_STEPS.map((step) =>
          this.dashboardRepo.countSubmittedByRound(step.round, scope),
        ),
      ),
    ]);

    const steps = [
      ...INCUBATION_ROUND_STEPS.map((step, index) => ({
        label: step.label,
        count: roundCounts[index],
      })),
      { label: INCUBATION_SELECTED_STEP_LABEL, count: countSelected(statusCounts) },
    ];

    return steps.map(({ label, count }) => ({
      label,
      count,
      percentage: toPercentage(count, totalStores),
    }));
  }

  async getProvinceComparison(
    query: QueryProvinceComparisonDto,
    user: JwtPayload,
  ): Promise<ProvinceComparison[]> {
    this.assertCanRead(user);
    const fromRound = query.from ?? PROVINCE_COMPARISON_DEFAULT_FROM;
    const toRound = query.to ?? PROVINCE_COMPARISON_DEFAULT_TO;

    const rows = await this.dashboardRepo.findProvinceRoundScores(
      [fromRound, toRound],
      resolveStoreScope(user),
    );
    const byStore = new Map<string, { province: string; from?: number; to?: number }>();

    for (const row of rows) {
      if (row.totalScore === null) continue;
      const entry: { province: string; from?: number; to?: number } = byStore.get(row.storeId) ?? {
        province: row.store.province ?? STORE_UNSPECIFIED_LABEL,
      };
      if (row.round === fromRound) entry.from = row.totalScore;
      if (row.round === toRound) entry.to = row.totalScore;
      byStore.set(row.storeId, entry);
    }

    // Only stores holding both scores count, so the two bars describe the same
    // set of stores. Averaging every fromRound against every toRound lets a
    // province's later round land lower purely because its weaker stores
    // dropped out, and gives a province with no baseline a fromScore of 0 that
    // reads as a real zero on the chart rather than as missing data.
    const byProvince = new Map<string, { from: number[]; to: number[] }>();

    for (const store of byStore.values()) {
      if (store.from === undefined || store.to === undefined) continue;
      const entry = byProvince.get(store.province) ?? { from: [], to: [] };
      entry.from.push(store.from);
      entry.to.push(store.to);
      byProvince.set(store.province, entry);
    }

    // Cut by paired-store count, not by score, so the provinces that survive are
    // the ones carrying the most data — a province with a handful of paired
    // stores swings its own average by tens of points. Ties break on name to
    // keep the cut stable across requests, since the rows arrive unordered.
    return [...byProvince.entries()]
      .sort(([aProvince, a], [bProvince, b]) =>
        b.from.length !== a.from.length
          ? b.from.length - a.from.length
          : aProvince.localeCompare(bProvince),
      )
      .slice(0, PROVINCE_COMPARISON_LIMIT)
      .map(([province, scores]) => ({
        province,
        fromRound,
        toRound,
        fromScore: average(scores.from),
        toScore: average(scores.to),
      }))
      .sort((a, b) => b.toScore - a.toScore);
  }

  async getStoreRoundScores(user: JwtPayload): Promise<StoreRoundScores[]> {
    this.assertCanRead(user);
    const rows = await this.dashboardRepo.findStoreRoundScores(resolveStoreScope(user));

    return rows.map((row) => {
      const scores = Object.fromEntries(
        ASSESSMENT_ROUNDS.map((round) => [
          round,
          row.assessments.find((assessment) => assessment.round === round)?.totalScore ?? null,
        ]),
      ) as Record<Round, number | null>;

      return {
        storeId: row.id,
        storeName: row.name,
        province: row.province ?? STORE_UNSPECIFIED_LABEL,
        storeType: row.storeType ?? STORE_UNSPECIFIED_LABEL,
        scores,
      };
    });
  }

  async exportStoreRoundScores(user: JwtPayload): Promise<Buffer> {
    const rows = await this.getStoreRoundScores(user);
    return buildStoreScoresWorkbook(rows);
  }

  // The feed is the news module and nothing else: every row is an announcement
  // an ADMIN wrote on /news, so what it shows is editable there. Follow-up
  // warnings the service used to derive from the data (stores missing T1,
  // unresolved red flags) are gone — an admin publishes an ALERT item instead.
  async getActivities(user: JwtPayload): Promise<ActivityItem[]> {
    this.assertCanRead(user);
    const news = await this.newsService.listForFeed(ACTIVITY_NEWS_LIMIT);

    return news.map((item) => ({
      type: NEWS_TYPE_TO_ACTIVITY[item.type],
      title: item.title,
      description: item.description,
      date: item.publishedAt,
      urgent: item.urgent,
    }));
  }

  async getReportsStatus(user: JwtPayload): Promise<ReportStatusItem[]> {
    this.assertCanRead(user);
    const reports = await this.reportService.listAvailableReports(user);

    return reports.map((report) => ({
      id: report.id,
      name: report.name,
      format: report.format,
      createdAt: report.createdAt,
      status: report.status,
      downloadUrl: report.downloadPath,
    }));
  }

  // The overview is programme context, not a store record, so the gate is the
  // role and the row-level scoping below is what narrows it further. A JUDGE
  // holds neither: OVERVIEW_READ_ROLES leaves it out, and the web app hides the
  // ภาพรวมโครงการ nav entry for the same reason.
  private assertCanRead(user: JwtPayload): void {
    if (!canReadOverview(user.role)) {
      throw new ForbiddenException(ERROR_CODES.PERM.FORBIDDEN, 'ไม่มีสิทธิ์เข้าถึงภาพรวมโครงการ');
    }
  }

  private toTop20Entries(rows: StoreScoreRow[]): Top20Entry[] {
    return rows
      .filter((row): row is StoreScoreRow & { totalScore: number } => row.totalScore !== null)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, TOP20_LIMIT)
      .map((row, index) => ({
        rank: index + 1,
        storeId: row.storeId,
        storeName: row.store.name,
        province: row.store.province ?? STORE_UNSPECIFIED_LABEL,
        storeType: row.store.storeType ?? STORE_UNSPECIFIED_LABEL,
        t1Score: round2(row.totalScore),
      }));
  }
}
