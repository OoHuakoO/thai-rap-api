import { Injectable } from '@nestjs/common';
import {
  AssessmentStatus,
  Round,
  type Prisma,
  type Role,
  type Store,
  type StoreDocument,
  type StoreStatus,
} from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import type { QueryStoreDto } from './dto/query-store.dto';
import type { ProvinceDistribution } from './types/store-stats.type';
import type { LatestAssessmentInfo } from './types/store-result.type';

export type PhotoField = 'menuPhotos' | 'storePhotos';

const STORE_SELECT = {
  id: true,
  name: true,
  province: true,
  storeType: true,
  ownerName: true,
  phone: true,
  email: true,
  address: true,
  socialLinks: true,
  avgRevenueMin: true,
  avgRevenueMax: true,
  mainProblems: true,
  goals: true,
  menuPhotos: true,
  coverUrl: true,
  storePhotos: true,
  status: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StoreSelect;

@Injectable()
export class StoreRepository {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(query: QueryStoreDto, ownerId?: string): Prisma.StoreWhereInput {
    const where: Prisma.StoreWhereInput = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { ownerName: { contains: query.search } },
        { phone: { contains: query.search } },
      ];
    }
    if (query.province) where.province = query.province;
    if (query.storeType) where.storeType = query.storeType;
    if (query.status) where.status = query.status;
    if (ownerId) where.ownerId = ownerId;
    return where;
  }

  findAll(query: QueryStoreDto, skip: number, take: number, ownerId?: string): Promise<Store[]> {
    return this.prisma.store.findMany({
      where: this.buildWhere(query, ownerId),
      select: STORE_SELECT,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(query: QueryStoreDto, ownerId?: string): Promise<number> {
    return this.prisma.store.count({ where: this.buildWhere(query, ownerId) });
  }

  findById(id: string): Promise<(Store & { documents: StoreDocument[] }) | null> {
    return this.prisma.store.findUnique({
      where: { id },
      select: { ...STORE_SELECT, documents: true },
    });
  }

  findUserRole(id: string): Promise<{ id: string; role: Role } | null> {
    return this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  }

  create(data: Prisma.StoreUncheckedCreateInput): Promise<Store> {
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

  async findLatestAssessments(storeIds: string[]): Promise<Map<string, LatestAssessmentInfo>> {
    if (storeIds.length === 0) return new Map();
    const rows = await this.prisma.assessment.findMany({
      where: {
        storeId: { in: storeIds },
        status: { in: [AssessmentStatus.SUBMITTED, AssessmentStatus.APPROVED] },
      },
      orderBy: { submittedAt: 'desc' },
      distinct: ['storeId'],
      select: {
        storeId: true,
        totalScore: true,
        submittedAt: true,
        assessor: { select: { name: true } },
      },
    });
    return new Map(
      rows.map((row) => [
        row.storeId,
        {
          totalScore: row.totalScore,
          submittedAt: row.submittedAt,
          assessorName: row.assessor.name,
        },
      ]),
    );
  }

  createDocument(
    storeId: string,
    data: { filename: string; fileType: string; fileSize: number; url: string },
  ): Promise<StoreDocument> {
    return this.prisma.storeDocument.create({ data: { storeId, ...data } });
  }

  findDocumentById(id: string): Promise<StoreDocument | null> {
    return this.prisma.storeDocument.findUnique({ where: { id } });
  }

  removeDocument(id: string): Promise<StoreDocument> {
    return this.prisma.storeDocument.delete({ where: { id } });
  }

  // Photo arrays are JSON columns mutated read-modify-write; the row lock keeps
  // two concurrent uploads from overwriting each other's append.
  private mutatePhotosLocked(
    id: string,
    field: PhotoField,
    mutate: (current: string[]) => string[],
  ): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM \`Store\` WHERE id = ${id} FOR UPDATE`;
      const row = await tx.store.findUniqueOrThrow({
        where: { id },
        select: { menuPhotos: true, storePhotos: true },
      });
      const next = mutate(row[field] as string[]);
      const updated = await tx.store.update({
        where: { id },
        data: { [field]: next },
        select: { menuPhotos: true, storePhotos: true },
      });
      return updated[field] as string[];
    });
  }

  appendPhoto(id: string, field: PhotoField, url: string): Promise<string[]> {
    return this.mutatePhotosLocked(id, field, (current) => [...current, url]);
  }

  async removePhoto(
    id: string,
    field: PhotoField,
    url: string,
  ): Promise<{ photos: string[]; removed: boolean }> {
    let removed = false;
    const photos = await this.mutatePhotosLocked(id, field, (current) => {
      removed = current.includes(url);
      return current.filter((p) => p !== url);
    });
    return { photos, removed };
  }

  async findDistinctStoreTypes(): Promise<string[]> {
    const rows = await this.prisma.store.findMany({
      distinct: ['storeType'],
      select: { storeType: true },
      orderBy: { storeType: 'asc' },
    });
    return rows.map((r) => r.storeType);
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
