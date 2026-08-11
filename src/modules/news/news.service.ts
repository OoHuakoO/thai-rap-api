import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { ForbiddenException, NotFoundException } from '@common/exceptions/app.exception';
import { ERROR_CODES, canReadOverview, isAdminRole } from '@constants/index';
import type { CreateNewsDto } from './dto/create-news.dto';
import { NEWS_DEFAULT_LIMIT, type QueryNewsDto } from './dto/query-news.dto';
import type { UpdateNewsDto } from './dto/update-news.dto';
import { NewsRepository, type NewsRow } from './news.repository';
import type { NewsItem } from './types/news.type';

@Injectable()
export class NewsService {
  constructor(private readonly newsRepo: NewsRepository) {}

  // Reads are open to every signed-in role that holds the overview — which is
  // all of them but JUDGE, matching the ข่าวประชาสัมพันธ์ page in the web app.
  // Publishing is narrower still, admin-only. Neither read narrows rows by
  // caller: an announcement is the same announcement for everyone who may see
  // the feed at all.
  async findAll(query: QueryNewsDto, user: JwtPayload): Promise<NewsItem[]> {
    this.assertCanRead(user);
    return this.listForFeed(query.limit ?? NEWS_DEFAULT_LIMIT, query.type);
  }

  async findOne(id: string, user: JwtPayload): Promise<NewsItem> {
    this.assertCanRead(user);
    return toNewsItem(await this.getNewsOrThrow(id));
  }

  async listForFeed(limit: number, type?: QueryNewsDto['type']): Promise<NewsItem[]> {
    const rows = await this.newsRepo.findAll({ type, limit });
    return rows.map(toNewsItem);
  }

  async create(dto: CreateNewsDto, user: JwtPayload): Promise<NewsItem> {
    this.assertCanWrite(user);

    const row = await this.newsRepo.create({
      type: dto.type,
      title: dto.title,
      description: dto.description,
      urgent: dto.urgent ?? false,
      publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : new Date(),
      author: { connect: { id: user.sub } },
    });
    return toNewsItem(row);
  }

  async update(id: string, dto: UpdateNewsDto, user: JwtPayload): Promise<NewsItem> {
    this.assertCanWrite(user);
    await this.getNewsOrThrow(id);

    const row = await this.newsRepo.update(id, {
      type: dto.type,
      title: dto.title,
      description: dto.description,
      urgent: dto.urgent,
      publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : undefined,
    });
    return toNewsItem(row);
  }

  async remove(id: string, user: JwtPayload): Promise<void> {
    this.assertCanWrite(user);
    await this.getNewsOrThrow(id);
    await this.newsRepo.remove(id);
  }

  private async getNewsOrThrow(id: string): Promise<NewsRow> {
    const row = await this.newsRepo.findById(id);
    if (!row) throw new NotFoundException(ERROR_CODES.NEWS.NOT_FOUND, 'ไม่พบข่าวประชาสัมพันธ์');
    return row;
  }

  // The announcement feed is programme context, so it rides the same role list
  // as the overview it is published to — `listForFeed` is the internal path the
  // dashboard calls once it has already run this check on its own caller.
  private assertCanRead(user: JwtPayload): void {
    if (!canReadOverview(user.role)) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'ไม่มีสิทธิ์เข้าถึงข่าวประชาสัมพันธ์',
      );
    }
  }

  private assertCanWrite(user: JwtPayload): void {
    if (!isAdminRole(user.role)) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'เฉพาะ admin หรือ super admin เท่านั้นที่จัดการข่าวประชาสัมพันธ์ได้',
      );
    }
  }
}

function toNewsItem(row: NewsRow): NewsItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    urgent: row.urgent,
    publishedAt: row.publishedAt,
    authorId: row.authorId,
    authorName: row.author.name,
  };
}
