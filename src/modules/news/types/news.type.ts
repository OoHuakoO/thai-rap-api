import type { NewsType } from '@prisma/client';

export interface NewsItem {
  id: string;
  type: NewsType;
  title: string;
  description: string;
  urgent: boolean;
  publishedAt: Date;
  authorId: string;
  authorName: string;
}
