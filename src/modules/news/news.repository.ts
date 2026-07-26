import { Injectable } from '@nestjs/common';
import { Prisma, type NewsType } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';

const NEWS_SELECT = {
  id: true,
  type: true,
  title: true,
  description: true,
  urgent: true,
  publishedAt: true,
  authorId: true,
  author: { select: { name: true } },
} satisfies Prisma.NewsSelect;

export type NewsRow = Prisma.NewsGetPayload<{ select: typeof NEWS_SELECT }>;

@Injectable()
export class NewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: { type?: NewsType; limit: number }): Promise<NewsRow[]> {
    return this.prisma.news.findMany({
      where: filters.type ? { type: filters.type } : undefined,
      orderBy: [{ urgent: 'desc' }, { publishedAt: 'desc' }],
      take: filters.limit,
      select: NEWS_SELECT,
    });
  }

  findById(id: string): Promise<NewsRow | null> {
    return this.prisma.news.findUnique({ where: { id }, select: NEWS_SELECT });
  }

  create(data: Prisma.NewsCreateInput): Promise<NewsRow> {
    return this.prisma.news.create({ data, select: NEWS_SELECT });
  }

  update(id: string, data: Prisma.NewsUpdateInput): Promise<NewsRow> {
    return this.prisma.news.update({ where: { id }, data, select: NEWS_SELECT });
  }

  remove(id: string): Promise<NewsRow> {
    return this.prisma.news.delete({ where: { id }, select: NEWS_SELECT });
  }
}
