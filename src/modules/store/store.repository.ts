import { Injectable } from '@nestjs/common';
import type { Prisma, Store } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import type { QueryStoreDto } from './dto/query-store.dto';

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
}
