import { Injectable } from '@nestjs/common';
import type { Dimension, Question } from '@prisma/client';
import { buildDimensionInfos } from './assessment-scoring.util';
import { DimensionRepository } from './dimension.repository';

export type DimensionWithMax = Dimension & { maxTotal: number };

export interface ScoringContext {
  dimensions: DimensionWithMax[];
  questions: Question[];
}

@Injectable()
export class DimensionService {
  constructor(private readonly dimensionRepo: DimensionRepository) {}

  findAllDimensions(): Promise<Dimension[]> {
    return this.dimensionRepo.findAllDimensions();
  }

  // The one place dimension weights meet question max scores — every caller
  // that computes a percentage reads its denominator from here.
  async findScoringContext(): Promise<ScoringContext> {
    const [dimensions, questions] = await Promise.all([
      this.dimensionRepo.findAllDimensions(),
      this.dimensionRepo.findAllQuestions(),
    ]);
    return { dimensions: buildDimensionInfos(dimensions, questions), questions };
  }

  async findDimensionInfos(): Promise<DimensionWithMax[]> {
    return (await this.findScoringContext()).dimensions;
  }

  findQuestionById(id: number): Promise<Question | null> {
    return this.dimensionRepo.findQuestionById(id);
  }

  findQuestionsByDimension(dimensionId: number): Promise<Question[]> {
    return this.dimensionRepo.findQuestionsByDimension(dimensionId);
  }

  findAllQuestions(dimensionId?: number): Promise<Question[]> {
    return this.dimensionRepo.findAllQuestions(dimensionId);
  }
}
