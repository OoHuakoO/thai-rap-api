import { Injectable } from '@nestjs/common';
import { PitchingRound, PitchingStatus, type PitchingRecommendation } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@common/exceptions/app.exception';
import { ERROR_CODES, canReadPitching, canWritePitching, isAdminRole } from '@constants/index';
import type { ReportFormat } from '@common/dto/export-format.dto';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import type { PaginatedResult } from '@common/types/api-response.type';
import { buildPaginatedResult, normalizePagination } from '@shared/pagination.util';
import { StoreService } from '@modules/store/store.service';
import type { CreatePitchingDto } from './dto/create-pitching.dto';
import type { QueryPitchingDto } from './dto/query-pitching.dto';
import type {
  QueryPitchingCriteriaDto,
  QueryPitchingStoreReportDto,
  QueryPitchingSummaryDto,
} from './dto/query-pitching-round.dto';
import type { SubmitPitchingDto, SubmitPitchingScoreDto } from './dto/submit-pitching.dto';
import type { UpdatePitchingDto } from './dto/update-pitching.dto';
import type { UpdatePitchingScoreDto } from './dto/update-pitching-score.dto';
import {
  PITCHING_ALLOWED_RECOMMENDATIONS,
  PITCHING_COMMENT_KEYS,
  PITCHING_EVIDENCE_KEYS,
  PITCHING_ROUNDS_WITH_SCORE_NOTE,
} from './pitching.const';
import {
  buildPitchingRankingWorkbook,
  buildPitchingStoreReportWorkbook,
} from './pitching-excel.util';
import { buildPitchingRankingPdf, buildPitchingStoreReportPdf } from './pitching-pdf.util';
import {
  averageScore,
  computeTotalScore,
  evaluateMinimumConditions,
  getPitchingLevel,
  roundTo2,
} from './pitching-scoring.util';
import {
  PitchingRepository,
  type PitchingCriterionRow,
  type PitchingRow,
} from './pitching.repository';
import type {
  PitchingCriterionAverage,
  PitchingCriterionItem,
  PitchingCriterionScore,
  PitchingListItem,
  PitchingRecommendationCounts,
  PitchingResult,
  PitchingStoreReport,
  PitchingSummaryItem,
} from './types/pitching.type';

@Injectable()
export class PitchingService {
  constructor(
    private readonly pitchingRepo: PitchingRepository,
    private readonly storeService: StoreService,
  ) {}

  async findCriteria(query: QueryPitchingCriteriaDto, user: JwtPayload) {
    this.assertCanRead(user);
    const rows = await this.pitchingRepo.findCriteria(query.round);
    return rows.map(toCriterionItem);
  }

  async findAll(
    query: QueryPitchingDto,
    user: JwtPayload,
  ): Promise<PaginatedResult<PitchingListItem>> {
    this.assertCanRead(user);
    if (query.storeId) await this.storeService.findAccessible(query.storeId, user);

    const storeIds = await this.storeService.findAccessibleStoreIds(user);
    const { skip, take, page, limit } = normalizePagination(query);
    const filters = {
      storeId: query.storeId,
      round: query.round,
      judgeId: query.judgeId,
      status: query.status,
      storeIds,
    };
    const [rows, total] = await Promise.all([
      this.pitchingRepo.findAll(filters, skip, take),
      this.pitchingRepo.count(filters),
    ]);
    return buildPaginatedResult(rows.map(toListItem), total, page, limit);
  }

  async findOne(id: string, user: JwtPayload): Promise<PitchingResult> {
    this.assertCanRead(user);
    const row = await this.getPitchingOrThrow(id);
    await this.storeService.findAccessible(row.storeId, user);
    return this.loadResult(row);
  }

  async create(dto: CreatePitchingDto, user: JwtPayload): Promise<PitchingResult> {
    this.assertCanWrite(user);
    await this.storeService.findAccessible(dto.storeId, user);

    const existing = await this.pitchingRepo.findByStoreRoundJudge(
      dto.storeId,
      dto.round,
      user.sub,
    );
    if (existing) {
      throw new ConflictException(
        ERROR_CODES.PITCH.DUPLICATE,
        'คุณได้สร้างแบบประเมินของร้านนี้ในรอบนี้ไว้แล้ว',
      );
    }

    const row = await this.pitchingRepo.create({
      store: { connect: { id: dto.storeId } },
      round: dto.round,
      judge: { connect: { id: user.sub } },
      evaluatedAt: new Date(),
    });
    return this.loadResult(row);
  }

  async update(id: string, dto: UpdatePitchingDto, user: JwtPayload): Promise<PitchingResult> {
    const row = await this.getWritableOrThrow(id, user);

    if (dto.comments !== undefined) this.assertCommentKeys(row.round, dto.comments);
    if (dto.evidenceChecked !== undefined) this.assertEvidenceKeys(row.round, dto.evidenceChecked);
    if (dto.recommendation !== undefined) {
      this.assertRecommendation(row.round, dto.recommendation);
    }

    const updated = await this.pitchingRepo.update(id, {
      scoreCardTotal: dto.scoreCardTotal,
      participationPct: dto.participationPct,
      evidenceChecked: dto.evidenceChecked,
      comments: dto.comments,
      recommendation: dto.recommendation,
      recommendationReason: dto.recommendationReason,
      noConflictOfInterest: dto.noConflictOfInterest,
    });
    return this.loadResult(updated);
  }

  async updateScore(
    id: string,
    criterionId: number,
    dto: UpdatePitchingScoreDto,
    user: JwtPayload,
  ): Promise<PitchingResult> {
    const row = await this.getWritableOrThrow(id, user);
    const criterion = await this.pitchingRepo.findCriterionById(criterionId);

    if (!criterion || criterion.round !== row.round) {
      throw new NotFoundException(
        ERROR_CODES.PITCH.CRITERION_NOT_FOUND,
        'ไม่พบเกณฑ์การประเมินนี้ในรอบที่กำลังประเมิน',
      );
    }
    if (dto.score !== undefined && dto.score !== null && dto.score > criterion.maxScore) {
      throw new BadRequestException(
        ERROR_CODES.PITCH.SCORE_OUT_OF_RANGE,
        `คะแนนข้อ ${criterion.code} ต้องอยู่ระหว่าง 0 ถึง ${criterion.maxScore}`,
      );
    }
    if (dto.note !== undefined && !PITCHING_ROUNDS_WITH_SCORE_NOTE.includes(row.round)) {
      throw new BadRequestException(
        ERROR_CODES.PITCH.INVALID_STATE,
        'แบบประเมินรอบนี้ไม่มีช่องหลักฐาน/ข้อสังเกตรายข้อ',
      );
    }

    const updated = await this.pitchingRepo.upsertScore(id, criterionId, {
      score: dto.score,
      note: dto.note,
    });
    // The ranking averages the frozen totalScore, so a correction made after
    // submit has to re-freeze it — otherwise the store is ranked on scores that
    // are no longer on the form.
    const rescored =
      updated.status === PitchingStatus.SUBMITTED
        ? await this.pitchingRepo.update(id, { totalScore: computeTotalScore(updated.scores) })
        : updated;
    return this.loadResult(rescored);
  }

  // The form is filled offline and handed in once: this call carries the whole
  // form, validates it against the round, and writes every part of it in one
  // transaction. Anything the payload omits keeps its stored value, which is
  // what makes a correction resubmit of one section safe.
  async submit(id: string, dto: SubmitPitchingDto, user: JwtPayload): Promise<PitchingResult> {
    const row = await this.getWritableOrThrow(id, user);
    const criteria = await this.pitchingRepo.findCriteria(row.round);

    if (dto.comments !== undefined) this.assertCommentKeys(row.round, dto.comments);
    if (dto.evidenceChecked !== undefined) this.assertEvidenceKeys(row.round, dto.evidenceChecked);
    if (dto.recommendation !== undefined) this.assertRecommendation(row.round, dto.recommendation);
    const scores = dto.scores ?? [];
    this.assertSubmittedScores(row.round, criteria, scores);

    const scoreByCriterion = new Map(row.scores.map((s) => [s.criterionId, s.score]));
    for (const entry of scores) {
      if (entry.score !== undefined) scoreByCriterion.set(entry.criterionId, entry.score);
    }
    const recommendation = dto.recommendation ?? row.recommendation;
    const scoreCardTotal =
      dto.scoreCardTotal === undefined ? row.scoreCardTotal : dto.scoreCardTotal;
    const participationPct =
      dto.participationPct === undefined ? row.participationPct : dto.participationPct;

    const unscored = criteria.filter((c) => (scoreByCriterion.get(c.id) ?? null) === null);
    if (unscored.length > 0) {
      throw new BadRequestException(
        ERROR_CODES.PITCH.NOT_ALL_SCORED,
        `ยังให้คะแนนไม่ครบ เหลืออีก ${unscored.length} ข้อ (${unscored.map((c) => c.code).join(', ')})`,
      );
    }
    if (!recommendation) {
      throw new BadRequestException(
        ERROR_CODES.PITCH.INVALID_RECOMMENDATION,
        'กรุณาเลือกความเห็นสรุปของกรรมการก่อนส่งแบบประเมิน',
      );
    }
    // The acceleration form is gated on two readings the judge takes off the
    // evidence file. Submitting without them would leave the ranking unable to
    // say whether the store cleared the minimum at all — and an unrecorded
    // condition counts as failed, which is not a verdict to reach by omission.
    if (
      row.round === PitchingRound.ACCELERATION &&
      (scoreCardTotal === null || participationPct === null)
    ) {
      throw new BadRequestException(
        ERROR_CODES.PITCH.MISSING_MINIMUM_INPUTS,
        'กรุณากรอกคะแนน Score Card 8 มิติ และสัดส่วนการเข้าร่วม/ส่งงาน ก่อนส่งแบบประเมิน',
      );
    }

    const totalScore = computeTotalScore(
      criteria.map((c) => ({ criterionId: c.id, score: scoreByCriterion.get(c.id) ?? null })),
    );
    const updated = await this.pitchingRepo.submit(
      id,
      {
        scoreCardTotal: dto.scoreCardTotal,
        participationPct: dto.participationPct,
        evidenceChecked: dto.evidenceChecked,
        comments: dto.comments,
        recommendation: dto.recommendation,
        recommendationReason: dto.recommendationReason,
        noConflictOfInterest: dto.noConflictOfInterest,
      },
      scores,
      totalScore,
      row.submittedAt,
    );
    return this.loadResult(updated);
  }

  // The ranking for one round: one row per store with at least one submitted
  // form, ordered by the judges' average — คะแนนเฉลี่ยกรรมการเรียงลำดับ on both
  // paper forms. A store nobody has submitted for is not ranked at all.
  async getSummary(
    query: QueryPitchingSummaryDto,
    user: JwtPayload,
  ): Promise<PaginatedResult<PitchingSummaryItem>> {
    this.assertCanRead(user);
    const ranked = await this.buildRanking(query, user);
    const { skip, take, page, limit } = normalizePagination(query);
    return buildPaginatedResult(ranked.slice(skip, skip + take), ranked.length, page, limit);
  }

  // The whole ranking, unpaged. The export deliberately ignores `page`: a file
  // cut to the rows on screen would have to be stitched back together by hand,
  // the same rule the cross-store assessment report follows.
  async exportRanking(
    query: QueryPitchingSummaryDto,
    format: ReportFormat,
    user: JwtPayload,
  ): Promise<Buffer> {
    this.assertCanRead(user);
    const ranked = await this.buildRanking(query, user);
    return format === 'pdf'
      ? buildPitchingRankingPdf(query.round, ranked)
      : buildPitchingRankingWorkbook(query.round, ranked);
  }

  async exportStoreReport(
    storeId: string,
    query: QueryPitchingStoreReportDto,
    format: ReportFormat,
    user: JwtPayload,
  ): Promise<Buffer> {
    const report = await this.getStoreReport(storeId, query, user);
    return format === 'pdf'
      ? buildPitchingStoreReportPdf(report)
      : buildPitchingStoreReportWorkbook(report);
  }

  // The judges' average for one store, with no role check and no store-scope
  // check — it is called in-process by AnalyticsService to fill the pitching
  // term of the IRS, for a store that call has already resolved through
  // StoreService.findAccessible. It returns a single number, never a judge's
  // comments, which is what keeps the narrow PITCHING_READ_ROLES meaningful.
  // Never wire this to a controller.
  async getStoreAverageScore(storeId: string, round: PitchingRound): Promise<number | null> {
    const rows = await this.pitchingRepo.findSubmittedByRound(round, [storeId]);
    return averageScore(rows.map((row) => row.totalScore ?? 0));
  }

  private async buildRanking(
    query: QueryPitchingSummaryDto,
    user: JwtPayload,
  ): Promise<PitchingSummaryItem[]> {
    const storeIds = await this.storeService.findAccessibleStoreIds(user);
    const ranked = rankCohort(await this.pitchingRepo.findSubmittedByRound(query.round, storeIds));
    // Filtered after ranking on purpose — see QueryPitchingSummaryDto.province.
    return query.province ? ranked.filter((item) => item.province === query.province) : ranked;
  }

  // A store's own report carries its rank, so it reads the whole round's cohort
  // too — the rank is a position among the other stores, not a property of this
  // one, and cannot be computed from its rows alone.
  async getStoreReport(
    storeId: string,
    query: QueryPitchingStoreReportDto,
    user: JwtPayload,
  ): Promise<PitchingStoreReport> {
    this.assertCanRead(user);
    const store = await this.storeService.findAccessible(storeId, user);

    const storeIds = await this.storeService.findAccessibleStoreIds(user);
    const [allRows, criteria] = await Promise.all([
      this.pitchingRepo.findSubmittedByRound(query.round, storeIds),
      this.pitchingRepo.findCriteria(query.round),
    ]);
    const ranked = rankCohort(allRows);
    const entry = ranked.find((item) => item.storeId === storeId);
    const cohort = allRows.filter((row) => row.storeId === storeId);

    return {
      storeId,
      storeCode: store.code,
      storeName: store.name,
      province: store.province ?? null,
      round: query.round,
      avgScore: entry?.avgScore ?? null,
      level: entry?.level ?? null,
      rank: entry?.rank ?? null,
      rankedStoreCount: ranked.length,
      judgeCount: cohort.length,
      recommendationCounts: countRecommendations(cohort),
      criteria: buildCriterionAverages(criteria, cohort),
      judges: cohort.map((row) => toResult(criteria, row)),
    };
  }

  private async getPitchingOrThrow(id: string): Promise<PitchingRow> {
    const row = await this.pitchingRepo.findById(id);
    if (!row) throw new NotFoundException(ERROR_CODES.PITCH.NOT_FOUND, 'ไม่พบแบบประเมิน Pitching');
    return row;
  }

  // Every write funnels through here: the caller must hold the write role, be
  // allowed to reach the store and own the form (unless admin). Submitting does
  // not freeze the form — a judge corrects its own scoring after the fact.
  private async getWritableOrThrow(id: string, user: JwtPayload): Promise<PitchingRow> {
    this.assertCanWrite(user);
    const row = await this.getPitchingOrThrow(id);
    await this.storeService.findAccessible(row.storeId, user);

    if (row.judgeId !== user.sub && !isAdminRole(user.role)) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'แก้ไขได้เฉพาะแบบประเมินที่คุณเป็นผู้ประเมินเท่านั้น',
      );
    }
    return row;
  }

  private assertCanRead(user: JwtPayload): void {
    if (!canReadPitching(user.role)) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'ไม่มีสิทธิ์เข้าถึงผลการประเมิน Pitching',
      );
    }
  }

  private assertCanWrite(user: JwtPayload): void {
    if (!canWritePitching(user.role)) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'เฉพาะกรรมการหรือ admin เท่านั้นที่กรอกแบบประเมิน Pitching ได้',
      );
    }
  }

  private assertCommentKeys(round: PitchingRound, comments: Record<string, string>): void {
    const allowed = PITCHING_COMMENT_KEYS[round];
    const unknown = Object.keys(comments).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      throw new BadRequestException(
        ERROR_CODES.PITCH.INVALID_STATE,
        `ความเห็นของกรรมการมีหัวข้อที่ไม่รู้จัก: ${unknown.join(', ')}`,
      );
    }
  }

  private assertEvidenceKeys(round: PitchingRound, keys: string[]): void {
    const allowed = PITCHING_EVIDENCE_KEYS[round];
    const unknown = keys.filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      throw new BadRequestException(
        ERROR_CODES.PITCH.INVALID_STATE,
        `รายการหลักฐานไม่ถูกต้องสำหรับรอบนี้: ${unknown.join(', ')}`,
      );
    }
  }

  // Same three rules `updateScore` enforces one row at a time, applied to the
  // whole array before any of it is written.
  private assertSubmittedScores(
    round: PitchingRound,
    criteria: PitchingCriterionRow[],
    scores: SubmitPitchingScoreDto[],
  ): void {
    const byId = new Map(criteria.map((criterion) => [criterion.id, criterion]));

    for (const entry of scores) {
      const criterion = byId.get(entry.criterionId);
      if (!criterion) {
        throw new NotFoundException(
          ERROR_CODES.PITCH.CRITERION_NOT_FOUND,
          'ไม่พบเกณฑ์การประเมินนี้ในรอบที่กำลังประเมิน',
        );
      }
      if (entry.score !== undefined && entry.score !== null && entry.score > criterion.maxScore) {
        throw new BadRequestException(
          ERROR_CODES.PITCH.SCORE_OUT_OF_RANGE,
          `คะแนนข้อ ${criterion.code} ต้องอยู่ระหว่าง 0 ถึง ${criterion.maxScore}`,
        );
      }
      if (entry.note !== undefined && !PITCHING_ROUNDS_WITH_SCORE_NOTE.includes(round)) {
        throw new BadRequestException(
          ERROR_CODES.PITCH.INVALID_STATE,
          'แบบประเมินรอบนี้ไม่มีช่องหลักฐาน/ข้อสังเกตรายข้อ',
        );
      }
    }
  }

  private assertRecommendation(round: PitchingRound, recommendation: PitchingRecommendation): void {
    if (!PITCHING_ALLOWED_RECOMMENDATIONS[round].includes(recommendation)) {
      throw new BadRequestException(
        ERROR_CODES.PITCH.INVALID_RECOMMENDATION,
        'ความเห็นสรุปนี้ไม่มีในแบบประเมินของรอบนี้',
      );
    }
  }

  private async loadResult(row: PitchingRow): Promise<PitchingResult> {
    return toResult(await this.pitchingRepo.findCriteria(row.round), row);
  }
}

// `criteria` is the round's whole master list, not the rows that happen to have
// a score yet — a form the judge has not touched still has to render all of its
// criteria, the same way an assessment renders all 50 questions from question
// master rather than from the Score rows.
function toResult(criteria: PitchingCriterionRow[], row: PitchingRow): PitchingResult {
  const scoreByCriterion = new Map(row.scores.map((score) => [score.criterionId, score]));
  const criteriaScores: PitchingCriterionScore[] = criteria.map((criterion) => {
    const score = scoreByCriterion.get(criterion.id);
    return {
      ...toCriterionItem(criterion),
      score: score?.score ?? null,
      note: score?.note ?? null,
    };
  });

  return {
    ...toListItem(row),
    prototypeProduct: row.prototypeProduct,
    minimumConditions:
      row.round === PitchingRound.ACCELERATION
        ? evaluateMinimumConditions({
            scoreCardTotal: row.scoreCardTotal,
            participationPct: row.participationPct,
          })
        : null,
    evidenceChecked: toStringArray(row.evidenceChecked),
    comments: toCommentMap(row.comments),
    recommendationReason: row.recommendationReason,
    noConflictOfInterest: row.noConflictOfInterest,
    createdAt: row.createdAt,
    criteria: criteriaScores,
  };
}

function toCriterionItem(row: PitchingCriterionRow): PitchingCriterionItem {
  return {
    id: row.id,
    round: row.round,
    code: row.code,
    section: row.section,
    title: row.title,
    guideline: row.guideline,
    maxScore: row.maxScore,
    sortOrder: row.sortOrder,
  };
}

function toListItem(row: PitchingRow): PitchingListItem {
  return {
    id: row.id,
    storeId: row.storeId,
    storeCode: row.store.code,
    storeName: row.store.name,
    province: row.store.province,
    round: row.round,
    judgeId: row.judgeId,
    judgeName: row.judge.name,
    status: row.status,
    totalScore: row.totalScore,
    currentScore: computeTotalScore(row.scores),
    level: row.totalScore === null ? null : getPitchingLevel(row.totalScore),
    recommendation: row.recommendation,
    evaluatedAt: row.evaluatedAt,
    updatedAt: row.updatedAt,
    submittedAt: row.submittedAt,
  };
}

// One row per store, ordered by the judges' average — คะแนนเฉลี่ยกรรมการเรียงลำดับ
// on both paper forms. Pure: the caller decides which cohort it ranks.
function rankCohort(cohort: PitchingRow[]): PitchingSummaryItem[] {
  const byStore = new Map<string, PitchingRow[]>();
  for (const row of cohort) {
    const rows = byStore.get(row.storeId);
    if (rows) rows.push(row);
    else byStore.set(row.storeId, [row]);
  }

  const items = [...byStore.values()]
    .map((rows) => {
      const avgScore = averageScore(rows.map((row) => row.totalScore ?? 0)) ?? 0;
      return {
        storeId: rows[0].store.id,
        storeCode: rows[0].store.code,
        storeName: rows[0].store.name,
        province: rows[0].store.province,
        rank: 0,
        judgeCount: rows.length,
        avgScore,
        level: getPitchingLevel(avgScore),
        recommendationCounts: countRecommendations(rows),
        minimumPassedCount: rows.filter(
          (row) =>
            evaluateMinimumConditions({
              scoreCardTotal: row.scoreCardTotal,
              participationPct: row.participationPct,
            }).passed,
        ).length,
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore || a.storeCode.localeCompare(b.storeCode));

  // Equal averages share a rank — the acceleration form breaks ties by หมวด B,
  // Market Feasibility and then a committee vote, none of which this endpoint
  // can decide for them, so it must not invent an order that looks decided.
  let lastScore: number | null = null;
  let lastRank = 0;
  return items.map((item, index) => {
    if (item.avgScore !== lastScore) {
      lastRank = index + 1;
      lastScore = item.avgScore;
    }
    return { ...item, rank: lastRank };
  });
}

function countRecommendations(rows: PitchingRow[]): PitchingRecommendationCounts {
  const counts: PitchingRecommendationCounts = {
    SELECTED: 0,
    WAITING_LIST: 0,
    MINIMUM_NOT_MET: 0,
    NOT_SELECTED: 0,
  };
  for (const row of rows) {
    if (row.recommendation) counts[row.recommendation] += 1;
  }
  return counts;
}

function buildCriterionAverages(
  criteria: PitchingCriterionRow[],
  rows: PitchingRow[],
): PitchingCriterionAverage[] {
  return criteria.map((criterion) => {
    const scores = rows
      .map((row) => row.scores.find((s) => s.criterionId === criterion.id)?.score)
      .filter((score): score is number => score !== null && score !== undefined);
    const avgScore = scores.length === 0 ? 0 : roundTo2(sum(scores) / scores.length);
    return {
      ...toCriterionItem(criterion),
      avgScore,
      avgPct: criterion.maxScore === 0 ? 0 : roundTo2((avgScore / criterion.maxScore) * 100),
    };
  });
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// Prisma types a Json column as JsonValue; the DTO is what guarantees the shape
// on the way in, so reading it back only has to survive a hand-edited row.
function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function toCommentMap(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}
