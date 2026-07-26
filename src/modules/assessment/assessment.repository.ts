import { Injectable } from '@nestjs/common';
import {
  AssessmentStatus,
  StoreStatus,
  type Assessment,
  type Evidence,
  type Prisma,
  type RedFlag,
  type Round,
  type Score,
} from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import type { QueryAssessmentDto } from './dto/query-assessment.dto';

const assessmentDetailInclude = {
  scores: { include: { question: { include: { dimension: true } }, evidences: true } },
  redFlags: true,
} satisfies Prisma.AssessmentInclude;

// Only T0/T1 map to a store status by round completion — later milestones
// (Field Audit, IDP, final follow-up) are separate program stages, not
// per-round labels, and are set elsewhere (manual status update / future
// ranking-finalize flow), not here.
const ROUND_COMPLETION_STATUS: Partial<Record<Round, StoreStatus>> = {
  T0: StoreStatus.T0_COMPLETED,
  T1: StoreStatus.T1_COMPLETED,
};

// Guards against clobbering a status an admin has already advanced manually
// (e.g. past PITCHING_COMPLETED/SELECTED) — only move forward, never back.
const STORE_STATUS_ADVANCE_FROM: Partial<Record<Round, StoreStatus[]>> = {
  T0: [StoreStatus.REGISTERED],
  T1: [StoreStatus.REGISTERED, StoreStatus.T0_COMPLETED, StoreStatus.CAMP_COMPLETED],
};

export type AssessmentDetail = Prisma.AssessmentGetPayload<{
  include: typeof assessmentDetailInclude;
}>;

const rankingSelect = {
  storeId: true,
  totalScore: true,
  store: { select: { province: true } },
  scores: { select: { questionId: true, rawScore: true } },
} satisfies Prisma.AssessmentSelect;

export type AssessmentForRanking = Prisma.AssessmentGetPayload<{ select: typeof rankingSelect }>;

const historySelect = {
  round: true,
  status: true,
  totalScore: true,
  updatedAt: true,
  submittedAt: true,
  assessor: { select: { name: true } },
} satisfies Prisma.AssessmentSelect;

export type AssessmentHistoryRow = Prisma.AssessmentGetPayload<{ select: typeof historySelect }>;

const statusSelect = {
  id: true,
  status: true,
  storeId: true,
  round: true,
} satisfies Prisma.AssessmentSelect;

export type AssessmentStatusRow = Prisma.AssessmentGetPayload<{ select: typeof statusSelect }>;

const summarySelect = {
  id: true,
  storeId: true,
  round: true,
  assessorId: true,
  status: true,
  totalScore: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
} satisfies Prisma.AssessmentSelect;

export type AssessmentSummaryRow = Prisma.AssessmentGetPayload<{ select: typeof summarySelect }>;

@Injectable()
export class AssessmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ownerId scopes the list to one entrepreneur's own stores — the same
  // Store.ownerId gate StoreRepository.findAll applies, so listing assessments
  // can never widen what a role may already read on the store itself.
  private buildWhere(query: QueryAssessmentDto, ownerId?: string): Prisma.AssessmentWhereInput {
    const where: Prisma.AssessmentWhereInput = {};
    if (query.storeId) where.storeId = query.storeId;
    if (query.round) where.round = query.round;
    if (query.status) where.status = query.status;
    if (ownerId) where.store = { ownerId };
    return where;
  }

  findAll(
    query: QueryAssessmentDto,
    skip: number,
    take: number,
    ownerId?: string,
  ): Promise<AssessmentSummaryRow[]> {
    return this.prisma.assessment.findMany({
      where: this.buildWhere(query, ownerId),
      select: summarySelect,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(query: QueryAssessmentDto, ownerId?: string): Promise<number> {
    return this.prisma.assessment.count({ where: this.buildWhere(query, ownerId) });
  }

  findByStoreAndRound(storeId: string, round: Round): Promise<Assessment | null> {
    return this.prisma.assessment.findUnique({ where: { storeId_round: { storeId, round } } });
  }

  findHistoryByStore(storeId: string): Promise<AssessmentHistoryRow[]> {
    return this.prisma.assessment.findMany({
      where: { storeId },
      select: historySelect,
      orderBy: { round: 'asc' },
    });
  }

  // APPROVED belongs here as much as SUBMITTED — approving a round freezes its
  // totalScore, it doesn't withdraw the store from the round's ranking.
  findSubmittedForRanking(round: Round): Promise<AssessmentForRanking[]> {
    return this.prisma.assessment.findMany({
      where: { round, status: { in: [AssessmentStatus.SUBMITTED, AssessmentStatus.APPROVED] } },
      select: rankingSelect,
    });
  }

  findDetailById(id: string): Promise<AssessmentDetail | null> {
    return this.prisma.assessment.findUnique({
      where: { id },
      include: assessmentDetailInclude,
    });
  }

  findStatusById(id: string): Promise<AssessmentStatusRow | null> {
    return this.prisma.assessment.findUnique({ where: { id }, select: statusSelect });
  }

  create(data: Prisma.AssessmentCreateInput): Promise<Assessment> {
    return this.prisma.assessment.create({ data });
  }

  // Every child FK is ON DELETE RESTRICT, so deleting the row on its own fails
  // as soon as a single question has been scored — the children have to go
  // first, innermost outwards, inside one transaction.
  async remove(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.evidence.deleteMany({ where: { score: { assessmentId: id } } });
      await tx.score.deleteMany({ where: { assessmentId: id } });
      await tx.redFlag.deleteMany({ where: { assessmentId: id } });
      await tx.assessment.delete({ where: { id } });
    });
  }

  updateNotes(id: string, notes: string | null): Promise<Assessment> {
    return this.prisma.assessment.update({ where: { id }, data: { notes } });
  }

  reassignAssessor(id: string, assessorId: string): Promise<Assessment> {
    return this.prisma.assessment.update({ where: { id }, data: { assessorId } });
  }

  markInProgress(id: string, assessorId: string): Promise<Assessment> {
    return this.prisma.assessment.update({
      where: { id },
      data: { status: 'IN_PROGRESS', assessorId },
    });
  }

  private buildScoreUpsertArgs(
    assessmentId: string,
    questionId: number,
    data: { rawScore: number; note?: string; suggestion?: string },
  ): Prisma.ScoreUpsertArgs {
    return {
      where: { assessmentId_questionId: { assessmentId, questionId } },
      update: { ...data, displayScore: data.rawScore, status: 'SCORED' },
      create: { assessmentId, questionId, ...data, displayScore: data.rawScore, status: 'SCORED' },
    };
  }

  upsertScore(
    assessmentId: string,
    questionId: number,
    data: { rawScore: number; note?: string; suggestion?: string },
  ): Promise<Score> {
    return this.prisma.score.upsert(this.buildScoreUpsertArgs(assessmentId, questionId, data));
  }

  async bulkUpsertScores(
    assessmentId: string,
    assessorId: string,
    items: Array<{ questionId: number; rawScore: number; note?: string; suggestion?: string }>,
  ): Promise<void> {
    await this.prisma.$transaction([
      ...items.map((item) =>
        this.prisma.score.upsert(this.buildScoreUpsertArgs(assessmentId, item.questionId, item)),
      ),
      this.prisma.assessment.update({ where: { id: assessmentId }, data: { assessorId } }),
    ]);
  }

  countScored(assessmentId: string): Promise<number> {
    return this.prisma.score.count({ where: { assessmentId, rawScore: { not: null } } });
  }

  findScore(assessmentId: string, questionId: number): Promise<Score | null> {
    return this.prisma.score.findUnique({
      where: { assessmentId_questionId: { assessmentId, questionId } },
    });
  }

  createEvidence(
    scoreId: string,
    data: { filename: string; fileType: string; fileSize: number; url: string },
  ): Promise<Evidence> {
    return this.prisma.evidence.create({ data: { scoreId, ...data } });
  }

  findEvidenceByScoreId(scoreId: string): Promise<Evidence[]> {
    return this.prisma.evidence.findMany({ where: { scoreId }, orderBy: { uploadedAt: 'asc' } });
  }

  findEvidenceById(id: string): Promise<(Evidence & { score: { assessmentId: string } }) | null> {
    return this.prisma.evidence.findUnique({
      where: { id },
      include: { score: { select: { assessmentId: true } } },
    });
  }

  removeEvidence(id: string): Promise<Evidence> {
    return this.prisma.evidence.delete({ where: { id } });
  }

  async submitAssessment(
    id: string,
    storeId: string,
    round: Round,
    totalScore: number,
    redFlags: Array<{
      type: RedFlag['type'];
      severity: RedFlag['severity'];
      triggerQuestions: number[];
    }>,
  ): Promise<AssessmentDetail> {
    await this.prisma.$transaction(async (tx) => {
      await tx.assessment.update({
        where: { id },
        data: { status: 'SUBMITTED', totalScore, submittedAt: new Date() },
      });
      if (redFlags.length > 0) {
        await tx.redFlag.createMany({
          data: redFlags.map((flag) => ({
            assessmentId: id,
            type: flag.type,
            severity: flag.severity,
            triggerQuestions: flag.triggerQuestions,
          })),
        });
      }

      const nextStatus = ROUND_COMPLETION_STATUS[round];
      const advanceFrom = STORE_STATUS_ADVANCE_FROM[round];
      if (nextStatus && advanceFrom) {
        const store = await tx.store.findUnique({
          where: { id: storeId },
          select: { status: true },
        });
        if (store && advanceFrom.includes(store.status)) {
          await tx.store.update({ where: { id: storeId }, data: { status: nextStatus } });
        }
      }
    });
    const updated = await this.findDetailById(id);
    if (!updated) throw new Error('Assessment disappeared after submit transaction');
    return updated;
  }
}
