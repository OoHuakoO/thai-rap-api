import { Injectable } from '@nestjs/common';
import { Role, type Assessment, type Evidence } from '@prisma/client';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@common/exceptions/app.exception';
import { ERROR_CODES, ASSESSMENT_EVIDENCE_ALLOWED_EXTENSIONS } from '@constants/index';
import { normalizePagination, buildPaginatedResult } from '@shared/pagination.util';
import { saveLocalFile, deleteLocalFile } from '@shared/file-storage.util';
import type { PaginatedResult } from '@common/types/api-response.type';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { StoreService } from '@modules/store/store.service';
import { AssessmentRepository, type AssessmentDetail } from './assessment.repository';
import { DimensionRepository } from './dimension.repository';
import type { CreateAssessmentDto } from './dto/create-assessment.dto';
import type { UpdateScoreDto } from './dto/update-score.dto';
import type { BulkScoreDto } from './dto/bulk-score.dto';
import type { QueryAssessmentDto } from './dto/query-assessment.dto';
import {
  computeDimensionScores,
  computeTotalScore,
  detectRedFlags,
  getZone,
  type ScoredQuestion,
} from './assessment-scoring.util';

const TOTAL_QUESTIONS = 50;

export interface EvidenceResult {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  url: string;
  uploadedAt: Date;
}

export interface AssessmentQuestionResult {
  questionId: number;
  questionNo: number;
  dimensionId: number;
  questionText: string;
  maxScore: number;
  rawScore: number | null;
  note: string | null;
  suggestion: string | null;
  evidence: EvidenceResult[];
}

export interface AssessmentResult {
  id: string;
  storeId: string;
  round: AssessmentDetail['round'];
  assessorId: string;
  status: AssessmentDetail['status'];
  totalScore: number | null;
  zone: string | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  questions: AssessmentQuestionResult[];
  redFlags: AssessmentDetail['redFlags'];
}

@Injectable()
export class AssessmentService {
  constructor(
    private readonly assessmentRepo: AssessmentRepository,
    private readonly dimensionRepo: DimensionRepository,
    private readonly storeService: StoreService,
  ) {}

  async findAll(query: QueryAssessmentDto): Promise<PaginatedResult<Assessment>> {
    const { skip, take, page, limit } = normalizePagination(query);
    const [items, total] = await Promise.all([
      this.assessmentRepo.findAll(query, skip, take),
      this.assessmentRepo.count(query),
    ]);
    return buildPaginatedResult(items, total, page, limit);
  }

  async findOne(id: string): Promise<AssessmentResult> {
    const assessment = await this.assessmentRepo.findDetailById(id);
    if (!assessment)
      throw new NotFoundException(ERROR_CODES.ASSESS.NOT_FOUND, 'Assessment not found');
    return this.toResult(assessment);
  }

  async create(dto: CreateAssessmentDto, user: JwtPayload): Promise<AssessmentResult> {
    this.assertCanWrite(user);
    await this.storeService.findOne(dto.storeId, user);

    const existing = await this.assessmentRepo.findByStoreAndRound(dto.storeId, dto.round);
    if (existing) {
      throw new ConflictException(
        ERROR_CODES.ASSESS.DUPLICATE,
        `An assessment for round ${dto.round} already exists for this store`,
      );
    }

    const created = await this.assessmentRepo.create({
      store: { connect: { id: dto.storeId } },
      round: dto.round,
      assessor: { connect: { id: user.sub } },
    });
    return this.findOne(created.id);
  }

  async updateScore(
    assessmentId: string,
    questionId: number,
    dto: UpdateScoreDto,
    user: JwtPayload,
  ): Promise<AssessmentQuestionResult> {
    this.assertCanWrite(user);
    await this.assertDraftOrInProgress(assessmentId);

    const question = await this.dimensionRepo.findQuestionById(questionId);
    if (!question) {
      throw new NotFoundException(ERROR_CODES.ASSESS.QUESTION_NOT_FOUND, 'Question not found');
    }

    const score = await this.assessmentRepo.upsertScore(assessmentId, questionId, dto);
    return {
      questionId: question.id,
      questionNo: question.questionNo,
      dimensionId: question.dimensionId,
      questionText: question.questionText,
      maxScore: question.maxScore,
      rawScore: score.rawScore,
      note: score.note,
      suggestion: score.suggestion,
      evidence: await this.findEvidenceForScore(score.id),
    };
  }

  async uploadEvidence(
    assessmentId: string,
    questionId: number,
    file: Express.Multer.File,
    user: JwtPayload,
  ): Promise<EvidenceResult> {
    this.assertCanWrite(user);
    await this.assertDraftOrInProgress(assessmentId);

    const score = await this.assessmentRepo.findScore(assessmentId, questionId);
    if (!score) {
      throw new BadRequestException(
        ERROR_CODES.ASSESS.INVALID_STATE,
        'Score the question before attaching evidence',
      );
    }

    // Multer decodes the multipart filename as latin1 — re-decode as UTF-8 so
    // Thai filenames survive.
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const saved = await saveLocalFile(
      `evidence/${assessmentId}`,
      originalName,
      file.buffer,
      ASSESSMENT_EVIDENCE_ALLOWED_EXTENSIONS,
    );
    const evidence = await this.assessmentRepo.createEvidence(score.id, {
      filename: originalName,
      fileType: file.mimetype,
      fileSize: file.size,
      url: saved.relativeUrl,
    });
    return this.toEvidenceResult(evidence);
  }

  async removeEvidence(assessmentId: string, evidenceId: string, user: JwtPayload): Promise<void> {
    this.assertCanWrite(user);
    await this.assertDraftOrInProgress(assessmentId);

    const evidence = await this.assessmentRepo.findEvidenceById(evidenceId);
    if (!evidence || evidence.score.assessmentId !== assessmentId) {
      throw new NotFoundException(ERROR_CODES.FILE.NOT_FOUND, 'Evidence file not found');
    }

    await this.assessmentRepo.removeEvidence(evidenceId);
    await deleteLocalFile(evidence.url);
  }

  async bulkUpdateScores(
    assessmentId: string,
    dto: BulkScoreDto,
    user: JwtPayload,
  ): Promise<{ scored: number; total: number }> {
    this.assertCanWrite(user);
    await this.assertDraftOrInProgress(assessmentId);

    const validQuestionIds = new Set(
      (await this.dimensionRepo.findAllQuestions()).map((q) => q.id),
    );
    for (const item of dto.scores) {
      if (!validQuestionIds.has(item.questionId)) {
        throw new NotFoundException(
          ERROR_CODES.ASSESS.QUESTION_NOT_FOUND,
          `Question ${item.questionId} not found`,
        );
      }
    }

    for (const item of dto.scores) {
      await this.assessmentRepo.upsertScore(assessmentId, item.questionId, {
        rawScore: item.rawScore,
        note: item.note,
        suggestion: item.suggestion,
      });
    }

    return this.getProgress(assessmentId);
  }

  async getProgress(assessmentId: string): Promise<{ scored: number; total: number }> {
    await this.findOne(assessmentId);
    const scored = await this.assessmentRepo.countScored(assessmentId);
    return { scored, total: TOTAL_QUESTIONS };
  }

  async submit(assessmentId: string, user: JwtPayload): Promise<AssessmentResult> {
    this.assertCanWrite(user);
    const assessment = await this.assessmentRepo.findDetailById(assessmentId);
    if (!assessment)
      throw new NotFoundException(ERROR_CODES.ASSESS.NOT_FOUND, 'Assessment not found');
    if (assessment.status === 'SUBMITTED') {
      throw new BadRequestException(
        ERROR_CODES.ASSESS.SUBMITTED,
        'Assessment has already been submitted',
      );
    }

    const scoredEntries = assessment.scores.filter((s) => s.rawScore !== null);
    if (scoredEntries.length < TOTAL_QUESTIONS) {
      throw new BadRequestException(
        ERROR_CODES.ASSESS.NOT_ALL_SCORED,
        `All ${TOTAL_QUESTIONS} questions must be scored before submitting (${scoredEntries.length}/${TOTAL_QUESTIONS})`,
      );
    }

    const scoredQuestions: ScoredQuestion[] = scoredEntries.map((s) => ({
      questionNo: s.question.questionNo,
      dimensionId: s.question.dimensionId,
      rawScore: s.rawScore as number,
    }));

    const dimensions = await this.dimensionRepo.findAllDimensions();
    const dimensionScores = computeDimensionScores(scoredQuestions, dimensions);
    const totalScore = computeTotalScore(dimensionScores, dimensions);
    const redFlags = detectRedFlags(scoredQuestions);

    const updated = await this.assessmentRepo.submitAssessment(assessmentId, totalScore, redFlags);
    return this.toResult(updated);
  }

  async remove(id: string, user: JwtPayload): Promise<void> {
    this.assertCanWrite(user);
    const assessment = await this.assessmentRepo.findDetailById(id);
    if (!assessment)
      throw new NotFoundException(ERROR_CODES.ASSESS.NOT_FOUND, 'Assessment not found');
    if (assessment.status !== 'DRAFT') {
      throw new BadRequestException(
        ERROR_CODES.ASSESS.INVALID_STATE,
        'Only draft assessments can be deleted',
      );
    }
    await this.assessmentRepo.remove(id);
  }

  private async toResult(assessment: AssessmentDetail): Promise<AssessmentResult> {
    const allQuestions = await this.dimensionRepo.findAllQuestions();
    const scoreByQuestionId = new Map(assessment.scores.map((s) => [s.questionId, s]));

    const questions: AssessmentQuestionResult[] = allQuestions.map((question) => {
      const score = scoreByQuestionId.get(question.id);
      return {
        questionId: question.id,
        questionNo: question.questionNo,
        dimensionId: question.dimensionId,
        questionText: question.questionText,
        maxScore: question.maxScore,
        rawScore: score?.rawScore ?? null,
        note: score?.note ?? null,
        suggestion: score?.suggestion ?? null,
        evidence: (score?.evidences ?? []).map((e) => this.toEvidenceResult(e)),
      };
    });

    return {
      id: assessment.id,
      storeId: assessment.storeId,
      round: assessment.round,
      assessorId: assessment.assessorId,
      status: assessment.status,
      totalScore: assessment.totalScore,
      zone: assessment.totalScore !== null ? getZone(assessment.totalScore) : null,
      createdAt: assessment.createdAt,
      updatedAt: assessment.updatedAt,
      submittedAt: assessment.submittedAt,
      questions,
      redFlags: assessment.redFlags,
    };
  }

  private async findEvidenceForScore(scoreId: string): Promise<EvidenceResult[]> {
    const evidences = await this.assessmentRepo.findEvidenceByScoreId(scoreId);
    return evidences.map((e) => this.toEvidenceResult(e));
  }

  private toEvidenceResult(evidence: Evidence): EvidenceResult {
    return {
      id: evidence.id,
      filename: evidence.filename,
      fileType: evidence.fileType,
      fileSize: evidence.fileSize,
      url: evidence.url,
      uploadedAt: evidence.uploadedAt,
    };
  }

  private async assertDraftOrInProgress(assessmentId: string): Promise<void> {
    const assessment = await this.assessmentRepo.findDetailById(assessmentId);
    if (!assessment)
      throw new NotFoundException(ERROR_CODES.ASSESS.NOT_FOUND, 'Assessment not found');
    if (assessment.status === 'SUBMITTED') {
      throw new BadRequestException(
        ERROR_CODES.ASSESS.SUBMITTED,
        'Cannot modify a submitted assessment',
      );
    }
  }

  // Write access is ADMIN/ASSESSOR-only for this phase, matching the store module —
  // mentor/entrepreneur/judge/me_team read-only access is a later epic.
  private assertCanWrite(user: JwtPayload): void {
    if (user.role !== Role.ADMIN && user.role !== Role.ASSESSOR) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'Only admins or assessors can manage assessments',
      );
    }
  }
}
