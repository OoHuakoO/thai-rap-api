import { Injectable } from '@nestjs/common';
import type { Dimension, Question } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';

@Injectable()
export class DimensionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllDimensions(): Promise<Dimension[]> {
    return this.prisma.dimension.findMany({ orderBy: { id: 'asc' } });
  }

  findDimensionById(id: number): Promise<Dimension | null> {
    return this.prisma.dimension.findUnique({ where: { id } });
  }

  findQuestionsByDimension(dimensionId: number): Promise<Question[]> {
    return this.prisma.question.findMany({
      where: { dimensionId },
      orderBy: { questionNo: 'asc' },
    });
  }

  findAllQuestions(dimensionId?: number): Promise<Question[]> {
    return this.prisma.question.findMany({
      where: dimensionId !== undefined ? { dimensionId } : undefined,
      orderBy: { questionNo: 'asc' },
    });
  }

  findQuestionById(id: number): Promise<Question | null> {
    return this.prisma.question.findUnique({ where: { id } });
  }
}
