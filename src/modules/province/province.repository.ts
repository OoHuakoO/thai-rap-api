import { Injectable } from '@nestjs/common';
import type { Province } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';

@Injectable()
export class ProvinceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Province[]> {
    return this.prisma.province.findMany({ orderBy: { nameTh: 'asc' } });
  }

  async exists(nameTh: string): Promise<boolean> {
    const count = await this.prisma.province.count({ where: { nameTh } });
    return count > 0;
  }
}
