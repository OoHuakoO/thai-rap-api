import { Injectable } from '@nestjs/common';
import { NewsType, Role, Round, StoreStatus } from '@prisma/client';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { STORE_TARGET_TOTAL } from '@constants/index';
import { NewsService } from '@modules/news/news.service';
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

const ACTIVITY_TEXT = {
  awaitingT1Title: (count: number) => `ร้านอาหาร ${count} ร้าน ยังไม่ประเมิน T1`,
  awaitingT1Description: 'กรุณาติดตามและนัดหมายการประเมิน',
  redFlagTitle: (count: number) => `พบสัญญาณเตือน (Red Flag) ${count} รายการที่ยังไม่แก้ไข`,
  redFlagDescription: 'กรุณาตรวจสอบและบันทึกแนวทางแก้ไข',
};

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
  ) {}

  async getKpis(user: JwtPayload): Promise<DashboardKPIs> {
    const ownerId = this.ownerScope(user);

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
      this.dashboardRepo.countStores(ownerId),
      this.dashboardRepo.countSubmittedByRound(Round.T0, ownerId),
      this.dashboardRepo.countSubmittedByRound(Round.T1, ownerId),
      this.dashboardRepo.countSubmittedByRound(Round.T2, ownerId),
      this.dashboardRepo.countSubmittedByRound(Round.T3, ownerId),
      this.dashboardRepo.countStoresByStatus(ownerId),
      this.dashboardRepo.findRoundScores(ASSESSMENT_ROUNDS, ownerId),
      this.dashboardRepo.findLatestScores(ownerId),
      this.dashboardRepo.findLastSubmittedAt(ownerId),
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
    const rows = await this.dashboardRepo.countStoresByProvince(this.ownerScope(user));
    const total = rows.reduce((sum, row) => sum + row.count, 0);

    return rows.map((row) => ({
      province: row.province,
      count: row.count,
      percentage: toPercentage(row.count, total),
    }));
  }

  async getTop20(query: QueryTop20Dto, user: JwtPayload): Promise<Top20Entry[]> {
    const ownerId = this.ownerScope(user);
    const round = query.round ?? TOP20_ALL_ROUNDS;
    const rows =
      round === TOP20_ALL_ROUNDS
        ? await this.dashboardRepo.findLatestScores(ownerId)
        : await this.dashboardRepo.findScoresByRound(round, TOP20_LIMIT, ownerId);

    return this.toTop20Entries(rows);
  }

  async getIncubationProgress(user: JwtPayload): Promise<IncubationStep[]> {
    const ownerId = this.ownerScope(user);

    const [totalStores, statusCounts, roundCounts] = await Promise.all([
      this.dashboardRepo.countStores(ownerId),
      this.dashboardRepo.countStoresByStatus(ownerId),
      Promise.all(
        INCUBATION_ROUND_STEPS.map((step) =>
          this.dashboardRepo.countSubmittedByRound(step.round, ownerId),
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
    const fromRound = query.from ?? PROVINCE_COMPARISON_DEFAULT_FROM;
    const toRound = query.to ?? PROVINCE_COMPARISON_DEFAULT_TO;

    const rows = await this.dashboardRepo.findProvinceRoundScores(
      [fromRound, toRound],
      this.ownerScope(user),
    );
    const byStore = new Map<string, { province: string; from?: number; to?: number }>();

    for (const row of rows) {
      if (row.totalScore === null) continue;
      const entry = byStore.get(row.storeId) ?? { province: row.store.province };
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
    const rows = await this.dashboardRepo.findStoreRoundScores(this.ownerScope(user));

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
        province: row.province,
        storeType: row.storeType,
        scores,
      };
    });
  }

  async exportStoreRoundScores(user: JwtPayload): Promise<Buffer> {
    const rows = await this.getStoreRoundScores(user);
    return buildStoreScoresWorkbook(rows);
  }

  async getActivities(user: JwtPayload): Promise<ActivityItem[]> {
    const ownerId = this.ownerScope(user);

    const [awaitingT1, unresolvedRedFlags] = await Promise.all([
      this.dashboardRepo.countStoresAwaitingT1(ownerId),
      this.dashboardRepo.countUnresolvedRedFlags(ownerId),
    ]);

    const now = new Date();
    const activities: ActivityItem[] = [];

    if (awaitingT1 > 0) {
      activities.push({
        type: 'warning',
        title: ACTIVITY_TEXT.awaitingT1Title(awaitingT1),
        description: ACTIVITY_TEXT.awaitingT1Description,
        date: now,
        urgent: true,
      });
    }

    if (unresolvedRedFlags > 0) {
      activities.push({
        type: 'warning',
        title: ACTIVITY_TEXT.redFlagTitle(unresolvedRedFlags),
        description: ACTIVITY_TEXT.redFlagDescription,
        date: now,
        urgent: true,
      });
    }

    // Auto-generated warnings come first because they are always "now"; the
    // published announcements below them are already sorted newest-first.
    const news = await this.newsService.listForFeed(ACTIVITY_NEWS_LIMIT);
    for (const item of news) {
      activities.push({
        type: NEWS_TYPE_TO_ACTIVITY[item.type],
        title: item.title,
        description: item.description,
        date: item.publishedAt,
        urgent: item.urgent,
      });
    }

    return activities;
  }

  // Reports are not modelled in the database yet (no Report table in
  // schema.prisma), so the contract's shape is served with no rows rather than
  // leaving the endpoint missing and 404-ing the dashboard card.
  async getReportsStatus(_user: JwtPayload): Promise<ReportStatusItem[]> {
    return [];
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
        province: row.store.province,
        storeType: row.store.storeType,
        t1Score: round2(row.totalScore),
      }));
  }

  // An ENTREPRENEUR opens the same overview as staff, restricted to the stores
  // it owns — returning its own id here is what every repository call filters
  // on. Staff roles get undefined and keep the project-wide numbers.
  private ownerScope(user: JwtPayload): string | undefined {
    return user.role === Role.ENTREPRENEUR ? user.sub : undefined;
  }
}
