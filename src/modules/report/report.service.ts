import { Injectable } from '@nestjs/common';
import { Role, Round } from '@prisma/client';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { ForbiddenException, NotFoundException } from '@common/exceptions/app.exception';
import { ERROR_CODES, canReadAssessment, STORE_UNSPECIFIED_LABEL } from '@constants/index';
import { DimensionService } from '@modules/assessment/dimension.service';
import {
  computeDimensionScores,
  getZone,
  type DimensionInfo,
} from '@modules/assessment/assessment-scoring.util';
import { StoreService } from '@modules/store/store.service';
import { REPORT_FORMATS, type ReportFormat } from './dto/report-format.dto';
import { buildOverviewReportWorkbook, buildRoundReportWorkbook } from './report-excel.util';
import { buildOverviewReportPdf, buildRoundReportPdf } from './report-pdf.util';
import { ReportRepository, type RoundReportRow } from './report.repository';
import type {
  AvailableReport,
  OverviewReport,
  OverviewRoundSummary,
  ReportDimensionScore,
  ReportStore,
  RoundReport,
} from './types/report.type';

export const REPORT_ROUNDS: Round[] = [Round.T0, Round.T1, Round.T2, Round.T3];

// The dashboard card shows a handful of rows and links to /reports for the rest.
export const RECENT_REPORT_LIMIT = 5;

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

    const dimensions = await this.loadDimensions();

    return {
      store,
      round: row.round,
      totalScore: row.totalScore === null ? null : round2(row.totalScore),
      zone: row.totalScore === null ? null : getZone(row.totalScore),
      assessorName: row.assessor.name,
      submittedAt: row.submittedAt,
      notes: row.notes,
      dimensions: this.toDimensionScores(row, dimensions),
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

    const [rows, dimensions] = await Promise.all([
      this.reportRepo.findSubmittedRounds(storeId),
      this.loadDimensions(),
    ]);

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

    const ownerId = user.role === Role.ENTREPRENEUR ? user.sub : undefined;
    const rows = await this.reportRepo.findRecentSubmitted(RECENT_REPORT_LIMIT, ownerId);

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

  private async loadDimensions(): Promise<{ info: DimensionInfo; name: string }[]> {
    const dimensions = await this.dimensionService.findDimensionInfos();

    return dimensions.map((dimension) => ({
      name: dimension.name,
      info: { id: dimension.id, weight: dimension.weight, maxTotal: dimension.maxTotal },
    }));
  }

  private toDimensionScores(
    row: RoundReportRow,
    dimensions: { info: DimensionInfo; name: string }[],
  ): ReportDimensionScore[] {
    const scored = row.scores
      .filter((score) => score.rawScore !== null)
      .map((score) => ({
        dimensionId: score.question.dimensionId,
        rawScore: score.rawScore as number,
      }));

    const byDimension = computeDimensionScores(
      scored,
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
