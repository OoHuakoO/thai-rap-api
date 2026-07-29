import { Injectable } from '@nestjs/common';
import { AssessmentStatus, Prisma, Round } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';

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
      question: { select: { questionNo: true, dimensionId: true } },
    },
  },
  redFlags: { select: { type: true, severity: true, triggerQuestions: true, resolved: true } },
} satisfies Prisma.AssessmentSelect;

export type RoundReportRow = Prisma.AssessmentGetPayload<{ select: typeof roundReportSelect }>;

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

  // Every downloadable report is a rendering of a submitted round, so the list of
  // reports that exist is exactly this query — there is no report table.
  findRecentSubmitted(limit: number, ownerId?: string): Promise<AvailableReportRow[]> {
    return this.prisma.assessment.findMany({
      where: {
        status: { in: SUBMITTED_STATUSES },
        submittedAt: { not: null },
        ...(ownerId ? { store: { ownerId } } : {}),
      },
      orderBy: { submittedAt: 'desc' },
      take: limit,
      select: availableReportSelect,
    });
  }
}
