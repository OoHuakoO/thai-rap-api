import { Injectable } from '@nestjs/common';
import { AssessmentStatus, Round, StoreStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import {
  assessmentStoreScopeWhere,
  storeScopeWhere,
  type StoreListScope,
} from '@shared/store-scope.util';

const SUBMITTED_STATUSES = [AssessmentStatus.SUBMITTED, AssessmentStatus.APPROVED];

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

  countStores(scope?: StoreListScope): Promise<number> {
    return this.prisma.store.count({ where: storeScopeWhere(scope) });
  }

  // storeId+round is unique (@@unique([storeId, round])), so one submitted row
  // per store per round — a plain count is already a distinct store count.
  countSubmittedByRound(round: Round, scope?: StoreListScope): Promise<number> {
    return this.prisma.assessment.count({
      where: {
        round,
        status: { in: SUBMITTED_STATUSES },
        ...assessmentStoreScopeWhere(scope),
      },
    });
  }

  async countStoresByProvince(scope?: StoreListScope): Promise<ProvinceCountRow[]> {
    const rows = await this.prisma.store.groupBy({
      by: ['province'],
      where: storeScopeWhere(scope),
      _count: { _all: true },
      orderBy: { _count: { province: 'desc' } },
    });
    return rows.map((row) => ({ province: row.province, count: row._count._all }));
  }

  async countStoresByStatus(scope?: StoreListScope): Promise<StatusCountRow[]> {
    const rows = await this.prisma.store.groupBy({
      by: ['status'],
      where: storeScopeWhere(scope),
      _count: { _all: true },
    });
    return rows.map((row) => ({ status: row.status, count: row._count._all }));
  }

  findRoundScores(rounds: Round[], scope?: StoreListScope): Promise<RoundScoreRow[]> {
    return this.prisma.assessment.findMany({
      where: {
        round: { in: rounds },
        status: { in: SUBMITTED_STATUSES },
        ...assessmentStoreScopeWhere(scope),
      },
      select: { storeId: true, round: true, totalScore: true },
    });
  }

  findStoreRoundScores(scope?: StoreListScope): Promise<StoreRoundScoreRow[]> {
    return this.prisma.store.findMany({
      where: storeScopeWhere(scope),
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

  findProvinceRoundScores(rounds: Round[], scope?: StoreListScope): Promise<ProvinceScoreRow[]> {
    return this.prisma.assessment.findMany({
      where: {
        round: { in: rounds },
        status: { in: SUBMITTED_STATUSES },
        ...assessmentStoreScopeWhere(scope),
      },
      select: {
        storeId: true,
        round: true,
        totalScore: true,
        store: { select: { province: true } },
      },
    });
  }

  findScoresByRound(round: Round, take: number, scope?: StoreListScope): Promise<StoreScoreRow[]> {
    return this.prisma.assessment.findMany({
      where: {
        round,
        status: { in: SUBMITTED_STATUSES },
        totalScore: { not: null },
        ...assessmentStoreScopeWhere(scope),
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
  findLatestScores(scope?: StoreListScope): Promise<StoreScoreRow[]> {
    return this.prisma.assessment.findMany({
      where: {
        status: { in: SUBMITTED_STATUSES },
        totalScore: { not: null },
        ...assessmentStoreScopeWhere(scope),
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

  async findLastSubmittedAt(scope?: StoreListScope): Promise<Date | null> {
    const row = await this.prisma.assessment.findFirst({
      where: {
        status: { in: SUBMITTED_STATUSES },
        submittedAt: { not: null },
        ...assessmentStoreScopeWhere(scope),
      },
      orderBy: { submittedAt: 'desc' },
      select: { submittedAt: true },
    });
    return row?.submittedAt ?? null;
  }
}
