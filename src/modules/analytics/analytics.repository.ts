import { Injectable } from '@nestjs/common';
import { AssessmentStatus, type Prisma, type Round } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';

// Same pair ReportRepository and AssessmentRepository gate on — a round only
// counts once it is frozen (SUBMITTED) or later approved.
const SUBMITTED_STATUSES = [AssessmentStatus.SUBMITTED, AssessmentStatus.APPROVED];

const roundSelect = {
  id: true,
  round: true,
  totalScore: true,
  submittedAt: true,
  updatedAt: true,
  scores: { select: { rawScore: true, question: { select: { dimensionId: true } } } },
  redFlags: true,
} satisfies Prisma.AssessmentSelect;

export type AnalyticsRoundRow = Prisma.AssessmentGetPayload<{ select: typeof roundSelect }>;

export interface RankingCohortRow {
  storeId: string;
  totalScore: number | null;
}

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findRoundsForStore(storeId: string): Promise<AnalyticsRoundRow[]> {
    return this.prisma.assessment.findMany({
      where: { storeId, status: { in: SUBMITTED_STATUSES } },
      select: roundSelect,
      orderBy: { round: 'asc' },
    });
  }

  findRankingCohort(round: Round, province?: string): Promise<RankingCohortRow[]> {
    return this.prisma.assessment.findMany({
      where: {
        round,
        status: { in: SUBMITTED_STATUSES },
        ...(province ? { store: { province } } : {}),
      },
      select: { storeId: true, totalScore: true },
    });
  }
}
