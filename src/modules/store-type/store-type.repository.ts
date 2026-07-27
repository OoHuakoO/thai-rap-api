import { Injectable } from '@nestjs/common';
import type { StoreType } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';

@Injectable()
export class StoreTypeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<StoreType[]> {
    return this.prisma.storeType.findMany({ orderBy: { id: 'asc' } });
  }

  async exists(nameTh: string): Promise<boolean> {
    const count = await this.prisma.storeType.count({ where: { nameTh } });
    return count > 0;
  }
}
