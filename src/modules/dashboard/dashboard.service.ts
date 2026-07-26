import { Injectable } from '@nestjs/common';
import { NewsType, Role, Round, StoreStatus } from '@prisma/client';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { ForbiddenException } from '@common/exceptions/app.exception';
import { ERROR_CODES, STORE_TARGET_TOTAL } from '@constants/index';
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

// Store.status holds only the store's current stage, so a funnel step counts
// every store at or past that stage. The four post-pitching outcomes share one
// rank because a store that was not selected still cleared every step before it.
const STORE_STATUS_RANK: Record<StoreStatus, number> = {
  [StoreStatus.REGISTERED]: 0,
  [StoreStatus.T0_COMPLETED]: 1,
  [StoreStatus.CAMP_COMPLETED]: 2,
  [StoreStatus.T1_COMPLETED]: 3,
  [StoreStatus.PITCHING_COMPLETED]: 4,
  [StoreStatus.NOT_SELECTED]: 5,
  [StoreStatus.WAITING_LIST]: 5,
  [StoreStatus.CONDITIONAL_SELECTED]: 5,
  [StoreStatus.SELECTED]: 5,
  [StoreStatus.FIELD_AUDITED]: 6,
  [StoreStatus.IDP_CREATED]: 7,
  [StoreStatus.COMPLETED]: 8,
};

const SELECTED_STATUSES: StoreStatus[] = [
  StoreStatus.SELECTED,
  StoreStatus.FIELD_AUDITED,
  StoreStatus.IDP_CREATED,
  StoreStatus.COMPLETED,
];

const INCUBATION_STEP_LABELS = [
  'คัดกรองเบื้องต้น',
  'ประเมิน T1',
  'พัฒนาศักยภาพ',
  'ประเมิน',
  'ผ่านเข้ารอบ',
];

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
    this.assertCanRead(user);

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
      this.dashboardRepo.countStores(),
      this.dashboardRepo.countSubmittedByRound(Round.T0),
      this.dashboardRepo.countSubmittedByRound(Round.T1),
      this.dashboardRepo.countSubmittedByRound(Round.T2),
      this.dashboardRepo.countSubmittedByRound(Round.T3),
      this.dashboardRepo.countStoresByStatus(),
      this.dashboardRepo.findRoundScores(ASSESSMENT_ROUNDS),
      this.dashboardRepo.findLatestScores(),
      this.dashboardRepo.findLastSubmittedAt(),
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

    const rows = await this.dashboardRepo.countStoresByProvince();
    const total = rows.reduce((sum, row) => sum + row.count, 0);

    return rows.map((row) => ({
      province: row.province,
      count: row.count,
      percentage: toPercentage(row.count, total),
    }));
  }

  async getTop20(query: QueryTop20Dto, user: JwtPayload): Promise<Top20Entry[]> {
    this.assertCanRead(user);

    const round = query.round ?? TOP20_ALL_ROUNDS;
    const rows =
      round === TOP20_ALL_ROUNDS
        ? await this.dashboardRepo.findLatestScores()
        : await this.dashboardRepo.findScoresByRound(round, TOP20_LIMIT);

    return this.toTop20Entries(rows);
  }

  async getIncubationProgress(user: JwtPayload): Promise<IncubationStep[]> {
    this.assertCanRead(user);

    const [totalStores, statusCounts, t0Completed, t1Completed] = await Promise.all([
      this.dashboardRepo.countStores(),
      this.dashboardRepo.countStoresByStatus(),
      this.dashboardRepo.countSubmittedByRound(Round.T0),
      this.dashboardRepo.countSubmittedByRound(Round.T1),
    ]);

    const countAtOrPast = (status: StoreStatus): number =>
      statusCounts
        .filter((row) => STORE_STATUS_RANK[row.status] >= STORE_STATUS_RANK[status])
        .reduce((sum, row) => sum + row.count, 0);

    const counts = [
      totalStores,
      t0Completed,
      countAtOrPast(StoreStatus.CAMP_COMPLETED),
      t1Completed,
      countSelected(statusCounts),
    ];

    return INCUBATION_STEP_LABELS.map((label, index) => ({
      label,
      count: counts[index],
      percentage: toPercentage(counts[index], totalStores),
    }));
  }

  async getProvinceComparison(
    query: QueryProvinceComparisonDto,
    user: JwtPayload,
  ): Promise<ProvinceComparison[]> {
    this.assertCanRead(user);

    const fromRound = query.from ?? PROVINCE_COMPARISON_DEFAULT_FROM;
    const toRound = query.to ?? PROVINCE_COMPARISON_DEFAULT_TO;

    const rows = await this.dashboardRepo.findProvinceRoundScores([fromRound, toRound]);
    const byProvince = new Map<string, { from: number[]; to: number[] }>();

    for (const row of rows) {
      if (row.totalScore === null) continue;
      const entry = byProvince.get(row.store.province) ?? { from: [], to: [] };
      if (row.round === fromRound) entry.from.push(row.totalScore);
      if (row.round === toRound) entry.to.push(row.totalScore);
      byProvince.set(row.store.province, entry);
    }

    return [...byProvince.entries()]
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

    const rows = await this.dashboardRepo.findStoreRoundScores();

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
    this.assertCanRead(user);

    const [awaitingT1, unresolvedRedFlags] = await Promise.all([
      this.dashboardRepo.countStoresAwaitingT1(),
      this.dashboardRepo.countUnresolvedRedFlags(),
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
    const news = await this.newsService.findAll({ limit: ACTIVITY_NEWS_LIMIT });
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
  async getReportsStatus(user: JwtPayload): Promise<ReportStatusItem[]> {
    this.assertCanRead(user);
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

  // The project overview mirrors the web `dashboard:read` permission, which
  // every role except ENTREPRENEUR holds.
  private assertCanRead(user: JwtPayload): void {
    if (user.role === Role.ENTREPRENEUR) {
      throw new ForbiddenException(ERROR_CODES.PERM.FORBIDDEN, 'ไม่มีสิทธิ์เข้าถึง');
    }
  }
}
