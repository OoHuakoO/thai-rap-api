import { Injectable } from '@nestjs/common';
import { AssessmentStatus, Prisma, Round } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { assessmentStoreScopeWhere, type StoreListScope } from '@shared/store-scope.util';

const SUBMITTED_STATUSES = [AssessmentStatus.SUBMITTED, AssessmentStatus.APPROVED];

const roundReportSelect = {
  id: true,
  round: true,
  status: true,
  totalScore: true,
  notes: true,
  submittedAt: true,
  updatedAt: true,
  assessor: { select: { name: true } },
  scores: {
    select: {
      rawScore: true,
      question: {
        select: { questionNo: true, dimensionId: true, questionText: true, maxScore: true },
      },
    },
  },
  redFlags: { select: { type: true, severity: true, triggerQuestions: true, resolved: true } },
} satisfies Prisma.AssessmentSelect;

export type RoundReportRow = Prisma.AssessmentGetPayload<{ select: typeof roundReportSelect }>;

const roundMatrixSelect = {
  storeId: true,
  round: true,
  totalScore: true,
  submittedAt: true,
  store: { select: { code: true, name: true, province: true } },
  scores: {
    select: { rawScore: true, question: { select: { dimensionId: true } } },
  },
  redFlags: { select: { resolved: true } },
} satisfies Prisma.AssessmentSelect;

export type RoundMatrixRowData = Prisma.AssessmentGetPayload<{ select: typeof roundMatrixSelect }>;

const availableReportSelect = {
  storeId: true,
  round: true,
  submittedAt: true,
  store: { select: { name: true } },
} satisfies Prisma.AssessmentSelect;

export type AvailableReportRow = Prisma.AssessmentGetPayload<{
  select: typeof availableReportSelect;
}>;

@Injectable()
export class ReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSubmittedRound(storeId: string, round: Round): Promise<RoundReportRow | null> {
    return this.prisma.assessment.findFirst({
      where: { storeId, round, status: { in: SUBMITTED_STATUSES } },
      select: roundReportSelect,
    });
  }

  findSubmittedRounds(storeId: string): Promise<RoundReportRow[]> {
    return this.prisma.assessment.findMany({
      where: { storeId, status: { in: SUBMITTED_STATUSES } },
      orderBy: { round: 'asc' },
      select: roundReportSelect,
    });
  }

  // storeIds is the caller's accessible set, already resolved by StoreService —
  // undefined means "no narrowing", which is not the same as an empty array
  // (a caller with access to nothing must match no store, not every store).
  findSubmittedByRound(round: Round, storeIds?: string[]): Promise<RoundMatrixRowData[]> {
    return this.prisma.assessment.findMany({
      where: {
        round,
        status: { in: SUBMITTED_STATUSES },
        ...(storeIds ? { storeId: { in: storeIds } } : {}),
      },
      orderBy: { store: { code: 'asc' } },
      select: roundMatrixSelect,
    });
  }

  // Every downloadable report is a rendering of a submitted round, so the list of
  // reports that exist is exactly this query — there is no report table.
  findRecentSubmitted(limit: number, scope?: StoreListScope): Promise<AvailableReportRow[]> {
    return this.prisma.assessment.findMany({
      where: {
        status: { in: SUBMITTED_STATUSES },
        submittedAt: { not: null },
        ...assessmentStoreScopeWhere(scope),
      },
      orderBy: { submittedAt: 'desc' },
      take: limit,
      select: availableReportSelect,
    });
  }
}
