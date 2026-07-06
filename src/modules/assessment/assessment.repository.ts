import { Injectable } from '@nestjs/common';
import type { Assessment, Prisma, RedFlag, Round, Score } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import type { QueryAssessmentDto } from './dto/query-assessment.dto';

const assessmentDetailInclude = {
  scores: { include: { question: { include: { dimension: true } } } },
  redFlags: true,
} satisfies Prisma.AssessmentInclude;

export type AssessmentDetail = Prisma.AssessmentGetPayload<{
  include: typeof assessmentDetailInclude;
}>;

@Injectable()
export class AssessmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(query: QueryAssessmentDto): Prisma.AssessmentWhereInput {
    const where: Prisma.AssessmentWhereInput = {};
    if (query.storeId) where.storeId = query.storeId;
    if (query.round) where.round = query.round;
    if (query.status) where.status = query.status;
    return where;
  }

  findAll(query: QueryAssessmentDto, skip: number, take: number): Promise<Assessment[]> {
    return this.prisma.assessment.findMany({
      where: this.buildWhere(query),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(query: QueryAssessmentDto): Promise<number> {
    return this.prisma.assessment.count({ where: this.buildWhere(query) });
  }

  findByStoreAndRound(storeId: string, round: Round): Promise<Assessment | null> {
    return this.prisma.assessment.findUnique({ where: { storeId_round: { storeId, round } } });
  }

  findDetailById(id: string): Promise<AssessmentDetail | null> {
    return this.prisma.assessment.findUnique({
      where: { id },
      include: assessmentDetailInclude,
    });
  }

  create(data: Prisma.AssessmentCreateInput): Promise<Assessment> {
    return this.prisma.assessment.create({ data });
  }

  remove(id: string): Promise<Assessment> {
    return this.prisma.assessment.delete({ where: { id } });
  }

  upsertScore(
    assessmentId: string,
    questionId: number,
    data: { rawScore: number; note?: string; suggestion?: string },
  ): Promise<Score> {
    return this.prisma.score.upsert({
      where: { assessmentId_questionId: { assessmentId, questionId } },
      update: { ...data, displayScore: data.rawScore, status: 'SCORED' },
      create: { assessmentId, questionId, ...data, displayScore: data.rawScore, status: 'SCORED' },
    });
  }

  countScored(assessmentId: string): Promise<number> {
    return this.prisma.score.count({ where: { assessmentId, rawScore: { not: null } } });
  }

  async submitAssessment(
    id: string,
    totalScore: number,
    redFlags: Array<{
      type: RedFlag['type'];
      severity: RedFlag['severity'];
      triggerQuestions: number[];
    }>,
  ): Promise<AssessmentDetail> {
    await this.prisma.$transaction(async (tx) => {
      await tx.assessment.update({
        where: { id },
        data: { status: 'SUBMITTED', totalScore, submittedAt: new Date() },
      });
      if (redFlags.length > 0) {
        await tx.redFlag.createMany({
          data: redFlags.map((flag) => ({
            assessmentId: id,
            type: flag.type,
            severity: flag.severity,
            triggerQuestions: flag.triggerQuestions,
          })),
        });
      }
    });
    const updated = await this.findDetailById(id);
    if (!updated) throw new Error('Assessment disappeared after submit transaction');
    return updated;
  }
}
