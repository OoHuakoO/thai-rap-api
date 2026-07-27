import { Injectable } from '@nestjs/common';
import { AssessmentStatus, Round, StoreStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';

const SUBMITTED_STATUSES = [AssessmentStatus.SUBMITTED, AssessmentStatus.APPROVED];

// Every method takes an optional ownerId: an ENTREPRENEUR's overview covers only
// the stores it owns, while staff roles pass undefined and see the whole
// project. Spread rather than `store: { ownerId }` — a relation filter holding
// only `undefined` still forces a join that changes nothing.
function assessmentOwnerScope(ownerId?: string): Prisma.AssessmentWhereInput {
  return ownerId ? { store: { ownerId } } : {};
}

export interface RoundScoreRow {
  storeId: string;
  round: Round;
  totalScore: number | null;
}

export interface ProvinceScoreRow {
  storeId: string;
  round: Round;
  totalScore: number | null;
  store: { province: string | null };
}

export interface StoreScoreRow {
  storeId: string;
  totalScore: number | null;
  store: { name: string; province: string | null; storeType: string | null };
}

export interface StoreRoundScoreRow {
  id: string;
  name: string;
  province: string | null;
  storeType: string | null;
  assessments: { round: Round; totalScore: number | null }[];
}

export interface ProvinceCountRow {
  province: string | null;
  count: number;
}

export interface StatusCountRow {
  status: StoreStatus;
  count: number;
}

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  countStores(ownerId?: string): Promise<number> {
    return this.prisma.store.count({ where: { ownerId } });
  }

  // storeId+round is unique (@@unique([storeId, round])), so one submitted row
  // per store per round — a plain count is already a distinct store count.
  countSubmittedByRound(round: Round, ownerId?: string): Promise<number> {
    return this.prisma.assessment.count({
      where: {
        round,
        status: { in: SUBMITTED_STATUSES },
        ...assessmentOwnerScope(ownerId),
      },
    });
  }

  async countStoresByProvince(ownerId?: string): Promise<ProvinceCountRow[]> {
    const rows = await this.prisma.store.groupBy({
      by: ['province'],
      where: { ownerId },
      _count: { _all: true },
      orderBy: { _count: { province: 'desc' } },
    });
    return rows.map((row) => ({ province: row.province, count: row._count._all }));
  }

  async countStoresByStatus(ownerId?: string): Promise<StatusCountRow[]> {
    const rows = await this.prisma.store.groupBy({
      by: ['status'],
      where: { ownerId },
      _count: { _all: true },
    });
    return rows.map((row) => ({ status: row.status, count: row._count._all }));
  }

  findRoundScores(rounds: Round[], ownerId?: string): Promise<RoundScoreRow[]> {
    return this.prisma.assessment.findMany({
      where: {
        round: { in: rounds },
        status: { in: SUBMITTED_STATUSES },
        ...assessmentOwnerScope(ownerId),
      },
      select: { storeId: true, round: true, totalScore: true },
    });
  }

  findStoreRoundScores(ownerId?: string): Promise<StoreRoundScoreRow[]> {
    return this.prisma.store.findMany({
      where: { ownerId },
      orderBy: [{ province: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        province: true,
        storeType: true,
        assessments: {
          where: { status: { in: SUBMITTED_STATUSES } },
          select: { round: true, totalScore: true },
        },
      },
    });
  }

  findProvinceRoundScores(rounds: Round[], ownerId?: string): Promise<ProvinceScoreRow[]> {
    return this.prisma.assessment.findMany({
      where: {
        round: { in: rounds },
        status: { in: SUBMITTED_STATUSES },
        ...assessmentOwnerScope(ownerId),
      },
      select: {
        storeId: true,
        round: true,
        totalScore: true,
        store: { select: { province: true } },
      },
    });
  }

  findScoresByRound(round: Round, take: number, ownerId?: string): Promise<StoreScoreRow[]> {
    return this.prisma.assessment.findMany({
      where: {
        round,
        status: { in: SUBMITTED_STATUSES },
        totalScore: { not: null },
        ...assessmentOwnerScope(ownerId),
      },
      orderBy: { totalScore: 'desc' },
      take,
      select: {
        storeId: true,
        totalScore: true,
        store: { select: { name: true, province: true, storeType: true } },
      },
    });
  }

  // `distinct` keeps the newest row per store because the rows are ordered by
  // submittedAt first, so the top-20 ranking still has to happen in the service.
  findLatestScores(ownerId?: string): Promise<StoreScoreRow[]> {
    return this.prisma.assessment.findMany({
      where: {
        status: { in: SUBMITTED_STATUSES },
        totalScore: { not: null },
        ...assessmentOwnerScope(ownerId),
      },
      orderBy: { submittedAt: 'desc' },
      distinct: ['storeId'],
      select: {
        storeId: true,
        totalScore: true,
        store: { select: { name: true, province: true, storeType: true } },
      },
    });
  }

  async findLastSubmittedAt(ownerId?: string): Promise<Date | null> {
    const row = await this.prisma.assessment.findFirst({
      where: {
        status: { in: SUBMITTED_STATUSES },
        submittedAt: { not: null },
        ...assessmentOwnerScope(ownerId),
      },
      orderBy: { submittedAt: 'desc' },
      select: { submittedAt: true },
    });
    return row?.submittedAt ?? null;
  }

  countStoresAwaitingT1(ownerId?: string): Promise<number> {
    return this.prisma.store.count({
      where: {
        ownerId,
        assessments: { some: { round: Round.T0, status: { in: SUBMITTED_STATUSES } } },
        NOT: { assessments: { some: { round: Round.T1, status: { in: SUBMITTED_STATUSES } } } },
      },
    });
  }

  countUnresolvedRedFlags(ownerId?: string): Promise<number> {
    return this.prisma.redFlag.count({
      where: {
        resolved: false,
        ...(ownerId ? { assessment: { store: { ownerId } } } : {}),
      },
    });
  }
}
