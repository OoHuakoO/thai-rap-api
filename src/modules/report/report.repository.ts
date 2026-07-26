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
}
