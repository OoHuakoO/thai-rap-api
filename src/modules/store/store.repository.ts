import { Injectable } from '@nestjs/common';
import { AssessmentStatus, Round, type Prisma, type Store, type StoreStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import type { QueryStoreDto } from './dto/query-store.dto';
import type { ProvinceDistribution } from './types/store-stats.type';

@Injectable()
export class StoreRepository {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(query: QueryStoreDto): Prisma.StoreWhereInput {
    const where: Prisma.StoreWhereInput = {};
    if (query.search) {
      where.OR = [{ name: { contains: query.search } }, { ownerName: { contains: query.search } }];
    }
    if (query.province) where.province = query.province;
    if (query.storeType) where.storeType = query.storeType;
    if (query.status) where.status = query.status;
    return where;
  }

  findAll(query: QueryStoreDto, skip: number, take: number): Promise<Store[]> {
    return this.prisma.store.findMany({
      where: this.buildWhere(query),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(query: QueryStoreDto): Promise<number> {
    return this.prisma.store.count({ where: this.buildWhere(query) });
  }

  findById(id: string): Promise<Store | null> {
    return this.prisma.store.findUnique({ where: { id } });
  }

  create(data: Prisma.StoreCreateInput): Promise<Store> {
    return this.prisma.store.create({ data });
  }

  update(id: string, data: Prisma.StoreUpdateInput): Promise<Store> {
    return this.prisma.store.update({ where: { id }, data });
  }

  remove(id: string): Promise<Store> {
    return this.prisma.store.delete({ where: { id } });
  }

  countAll(): Promise<number> {
    return this.prisma.store.count();
  }

  countByStatus(statuses: StoreStatus[]): Promise<number> {
    return this.prisma.store.count({ where: { status: { in: statuses } } });
  }

  countDistinctStoresByRound(round: Round): Promise<number> {
    // storeId+round is unique (@@unique([storeId, round])), so one row per store per round
    return this.prisma.assessment.count({
      where: { round, status: { in: [AssessmentStatus.SUBMITTED, AssessmentStatus.APPROVED] } },
    });
  }

  async countByProvince(): Promise<ProvinceDistribution[]> {
    const groups = await this.prisma.store.groupBy({
      by: ['province'],
      _count: { _all: true },
    });
    const total = groups.reduce((sum, g) => sum + g._count._all, 0);
    return groups
      .map((g) => ({
        province: g.province,
        count: g._count._all,
        pct: total === 0 ? 0 : Math.round((g._count._all / total) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);
  }
}
