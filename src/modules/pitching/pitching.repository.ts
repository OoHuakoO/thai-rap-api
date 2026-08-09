import { Injectable } from '@nestjs/common';
import { Prisma, PitchingStatus, type PitchingRound } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';

const CRITERION_SELECT = {
  id: true,
  round: true,
  code: true,
  section: true,
  title: true,
  guideline: true,
  maxScore: true,
  sortOrder: true,
} satisfies Prisma.PitchingCriterionSelect;

// One select for every read. The criterion scores ride along even on the list,
// because a draft's live total is the sum of them — a list row that reported
// `totalScore` alone would show 0 for every form still being filled in.
const PITCHING_SELECT = {
  id: true,
  storeId: true,
  round: true,
  judgeId: true,
  status: true,
  totalScore: true,
  prototypeProduct: true,
  scoreCardTotal: true,
  participationPct: true,
  evidenceChecked: true,
  comments: true,
  recommendation: true,
  recommendationReason: true,
  noConflictOfInterest: true,
  evaluatedAt: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  store: { select: { id: true, code: true, name: true, province: true } },
  judge: { select: { id: true, name: true } },
  scores: {
    select: {
      criterionId: true,
      score: true,
      note: true,
      criterion: { select: CRITERION_SELECT },
    },
  },
} satisfies Prisma.PitchingSelect;

export type PitchingCriterionRow = Prisma.PitchingCriterionGetPayload<{
  select: typeof CRITERION_SELECT;
}>;
export type PitchingRow = Prisma.PitchingGetPayload<{ select: typeof PITCHING_SELECT }>;

export interface PitchingListFilters {
  storeId?: string;
  round?: PitchingRound;
  judgeId?: string;
  status?: PitchingStatus;
  /** `null` means the caller is not narrowed to a subset of stores. */
  storeIds: string[] | null;
}

// The caller's scope and the requested filter are two separate narrowings and
// must both apply — an `storeId` the caller may not read has to return nothing,
// not override the scope.
function listWhere(filters: PitchingListFilters): Prisma.PitchingWhereInput {
  const where: Prisma.PitchingWhereInput = {
    round: filters.round,
    judgeId: filters.judgeId,
    status: filters.status,
  };
  if (filters.storeId) where.storeId = filters.storeId;
  if (filters.storeIds !== null) where.AND = [{ storeId: { in: filters.storeIds } }];
  return where;
}

@Injectable()
export class PitchingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCriteria(round?: PitchingRound): Promise<PitchingCriterionRow[]> {
    return this.prisma.pitchingCriterion.findMany({
      where: round ? { round } : undefined,
      orderBy: { sortOrder: 'asc' },
      select: CRITERION_SELECT,
    });
  }

  findCriterionById(id: number): Promise<PitchingCriterionRow | null> {
    return this.prisma.pitchingCriterion.findUnique({ where: { id }, select: CRITERION_SELECT });
  }

  findById(id: string): Promise<PitchingRow | null> {
    return this.prisma.pitching.findUnique({ where: { id }, select: PITCHING_SELECT });
  }

  findByStoreRoundJudge(
    storeId: string,
    round: PitchingRound,
    judgeId: string,
  ): Promise<PitchingRow | null> {
    return this.prisma.pitching.findUnique({
      where: { storeId_round_judgeId: { storeId, round, judgeId } },
      select: PITCHING_SELECT,
    });
  }

  findAll(filters: PitchingListFilters, skip: number, take: number): Promise<PitchingRow[]> {
    return this.prisma.pitching.findMany({
      where: listWhere(filters),
      orderBy: [{ updatedAt: 'desc' }],
      skip,
      take,
      select: PITCHING_SELECT,
    });
  }

  count(filters: PitchingListFilters): Promise<number> {
    return this.prisma.pitching.count({ where: listWhere(filters) });
  }

  // The whole cohort of a round in one read — the ranking and the per-store
  // report both average across every judge, so neither can work from a page.
  findSubmittedByRound(round: PitchingRound, storeIds: string[] | null): Promise<PitchingRow[]> {
    return this.prisma.pitching.findMany({
      where: {
        round,
        status: PitchingStatus.SUBMITTED,
        ...(storeIds === null ? {} : { storeId: { in: storeIds } }),
      },
      orderBy: [{ submittedAt: 'asc' }],
      select: PITCHING_SELECT,
    });
  }

  create(data: Prisma.PitchingCreateInput): Promise<PitchingRow> {
    return this.prisma.pitching.create({ data, select: PITCHING_SELECT });
  }

  update(id: string, data: Prisma.PitchingUpdateInput): Promise<PitchingRow> {
    return this.prisma.pitching.update({ where: { id }, data, select: PITCHING_SELECT });
  }

  upsertScore(
    pitchingId: string,
    criterionId: number,
    data: { score?: number | null; note?: string | null },
  ): Promise<PitchingRow> {
    return this.prisma.$transaction(async (tx) => {
      await tx.pitchingScore.upsert({
        where: { pitchingId_criterionId: { pitchingId, criterionId } },
        create: { pitchingId, criterionId, score: data.score ?? null, note: data.note ?? null },
        update: data,
      });
      return tx.pitching.update({
        where: { id: pitchingId },
        data: { updatedAt: new Date() },
        select: PITCHING_SELECT,
      });
    });
  }

  // The judge fills the form offline, so submit is the only write: the whole
  // form and every criterion land together or not at all.
  submit(
    id: string,
    data: Prisma.PitchingUpdateInput,
    scores: { criterionId: number; score?: number | null; note?: string | null }[],
    totalScore: number,
    submittedAt: Date | null,
  ): Promise<PitchingRow> {
    return this.prisma.$transaction(async (tx) => {
      for (const entry of scores) {
        await tx.pitchingScore.upsert({
          where: { pitchingId_criterionId: { pitchingId: id, criterionId: entry.criterionId } },
          create: {
            pitchingId: id,
            criterionId: entry.criterionId,
            score: entry.score ?? null,
            note: entry.note ?? null,
          },
          update: { score: entry.score, note: entry.note },
        });
      }
      return tx.pitching.update({
        where: { id },
        data: {
          ...data,
          status: PitchingStatus.SUBMITTED,
          totalScore,
          // A correction resubmit keeps the first submission's timestamp — the
          // ranking orders the cohort by it, and the form was handed in once.
          ...(submittedAt === null ? { submittedAt: new Date() } : {}),
        },
        select: PITCHING_SELECT,
      });
    });
  }
}
