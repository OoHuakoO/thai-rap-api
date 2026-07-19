import { Injectable } from '@nestjs/common';
import { AssessmentStatus, Role, Round, type Assessment, type Evidence } from '@prisma/client';
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
import type { UpdateNotesDto } from './dto/update-notes.dto';
import {
  computeDimensionScores,
  computeTotalScore,
  detectRedFlags,
  getZone,
  MAX_SCORE_PER_QUESTION,
  type ScoredQuestion,
} from './assessment-scoring.util';

const TOTAL_QUESTIONS = 50;

// Mirrors REQUIRED_PRIOR_ROUND in the web's utils/round.ts — the UI lock is
// UX only, this is the real gate. Enforced on every write (create, score,
// evidence, notes, submit) via assertPriorRoundCompleted, not just create —
// otherwise a round record that already exists (e.g. seeded/legacy data)
// could keep being scored and submitted regardless of the prior round.
const REQUIRED_PRIOR_ROUND: Partial<Record<Round, Round>> = {
  [Round.T1]: Round.T0,
  [Round.T2]: Round.T1,
  [Round.T3]: Round.T1,
  [Round.T4]: Round.T1,
};

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
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  questions: AssessmentQuestionResult[];
  redFlags: AssessmentDetail['redFlags'];
}

export interface DimensionAverageResult {
  dimensionId: number;
  avgPct: number;
}

export interface AssessmentRankResult {
  overallRank: number | null;
  overallTotal: number;
  provinceRank: number | null;
  provinceTotal: number;
  dimensionAverages: DimensionAverageResult[];
}

export interface AssessmentHistoryItemResult {
  round: Round;
  status: AssessmentStatus;
  totalScore: number | null;
  assessorName: string;
  updatedAt: Date;
  submittedAt: Date | null;
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
    if (!assessment) throw new NotFoundException(ERROR_CODES.ASSESS.NOT_FOUND, 'ไม่พบการประเมิน');
    return this.toResult(assessment);
  }

  async getRank(storeId: string, round: Round, user: JwtPayload): Promise<AssessmentRankResult> {
    const store = await this.storeService.findOne(storeId, user);
    const submitted = await this.assessmentRepo.findSubmittedForRanking(round);

    const ranked = [...submitted].sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));
    const overallIndex = ranked.findIndex((a) => a.storeId === storeId);
    const provinceRanked = ranked.filter((a) => a.store.province === store.province);
    const provinceIndex = provinceRanked.findIndex((a) => a.storeId === storeId);

    const dimensions = await this.dimensionRepo.findAllDimensions();
    const questions = await this.dimensionRepo.findAllQuestions();
    const dimensionIdByQuestionId = new Map(questions.map((q) => [q.id, q.dimensionId]));

    const dimensionPctSums = new Map<number, number>(dimensions.map((d) => [d.id, 0]));
    for (const assessment of provinceRanked) {
      for (const dimension of dimensions) {
        const raw = assessment.scores
          .filter((s) => dimensionIdByQuestionId.get(s.questionId) === dimension.id)
          .reduce((sum, s) => sum + (s.rawScore ?? 0), 0);
        const max = dimension.questionCount * MAX_SCORE_PER_QUESTION;
        const pct = max === 0 ? 0 : (raw / max) * 100;
        dimensionPctSums.set(dimension.id, (dimensionPctSums.get(dimension.id) ?? 0) + pct);
      }
    }

    const dimensionAverages: DimensionAverageResult[] = dimensions.map((dimension) => ({
      dimensionId: dimension.id,
      avgPct:
        provinceRanked.length === 0
          ? 0
          : Math.round(((dimensionPctSums.get(dimension.id) ?? 0) / provinceRanked.length) * 10) /
            10,
    }));

    return {
      overallRank: overallIndex === -1 ? null : overallIndex + 1,
      overallTotal: ranked.length,
      provinceRank: provinceIndex === -1 ? null : provinceIndex + 1,
      provinceTotal: provinceRanked.length,
      dimensionAverages,
    };
  }

  async getHistory(storeId: string, user: JwtPayload): Promise<AssessmentHistoryItemResult[]> {
    await this.storeService.findOne(storeId, user);
    const rows = await this.assessmentRepo.findHistoryByStore(storeId);
    return rows.map((row) => ({
      round: row.round,
      status: row.status,
      totalScore: row.totalScore,
      assessorName: row.assessor.name,
      updatedAt: row.updatedAt,
      submittedAt: row.submittedAt,
    }));
  }

  async create(dto: CreateAssessmentDto, user: JwtPayload): Promise<AssessmentResult> {
    this.assertCanWrite(user);
    await this.storeService.findOne(dto.storeId, user);

    const existing = await this.assessmentRepo.findByStoreAndRound(dto.storeId, dto.round);
    if (existing) {
      throw new ConflictException(
        ERROR_CODES.ASSESS.DUPLICATE,
        `มีการประเมินรอบ ${dto.round} สำหรับร้านนี้อยู่แล้ว`,
      );
    }

    await this.assertPriorRoundCompleted(dto.storeId, dto.round);

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
      throw new NotFoundException(ERROR_CODES.ASSESS.QUESTION_NOT_FOUND, 'ไม่พบคำถาม');
    }

    const score = await this.assessmentRepo.upsertScore(assessmentId, questionId, dto);
    await this.assessmentRepo.reassignAssessor(assessmentId, user.sub);
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
        'ต้องให้คะแนนคำถามนี้ก่อนแนบหลักฐาน',
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
      throw new NotFoundException(ERROR_CODES.FILE.NOT_FOUND, 'ไม่พบไฟล์หลักฐาน');
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
          `ไม่พบคำถามหมายเลข ${item.questionId}`,
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

  async updateNotes(
    assessmentId: string,
    dto: UpdateNotesDto,
    user: JwtPayload,
  ): Promise<AssessmentResult> {
    this.assertCanWrite(user);
    await this.assertDraftOrInProgress(assessmentId);
    await this.assessmentRepo.updateNotes(assessmentId, dto.notes ?? null);
    return this.findOne(assessmentId);
  }

  async submit(assessmentId: string, user: JwtPayload): Promise<AssessmentResult> {
    this.assertCanWrite(user);
    const assessment = await this.assessmentRepo.findDetailById(assessmentId);
    if (!assessment) throw new NotFoundException(ERROR_CODES.ASSESS.NOT_FOUND, 'ไม่พบการประเมิน');
    if (assessment.status === 'SUBMITTED') {
      throw new BadRequestException(ERROR_CODES.ASSESS.SUBMITTED, 'การประเมินนี้ถูกส่งไปแล้ว');
    }
    await this.assertPriorRoundCompleted(assessment.storeId, assessment.round);

    const scoredEntries = assessment.scores.filter((s) => s.rawScore !== null);
    if (scoredEntries.length < TOTAL_QUESTIONS) {
      throw new BadRequestException(
        ERROR_CODES.ASSESS.NOT_ALL_SCORED,
        `ต้องให้คะแนนครบทั้ง ${TOTAL_QUESTIONS} ข้อก่อนส่ง (${scoredEntries.length}/${TOTAL_QUESTIONS})`,
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

    const updated = await this.assessmentRepo.submitAssessment(
      assessmentId,
      assessment.storeId,
      assessment.round,
      totalScore,
      redFlags,
    );
    return this.toResult(updated);
  }

  async remove(id: string, user: JwtPayload): Promise<void> {
    this.assertCanWrite(user);
    const assessment = await this.assessmentRepo.findDetailById(id);
    if (!assessment) throw new NotFoundException(ERROR_CODES.ASSESS.NOT_FOUND, 'ไม่พบการประเมิน');
    if (assessment.status !== 'DRAFT') {
      throw new BadRequestException(
        ERROR_CODES.ASSESS.INVALID_STATE,
        'ลบได้เฉพาะการประเมินที่ยังเป็นแบบร่างเท่านั้น',
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
      notes: assessment.notes,
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
    if (!assessment) throw new NotFoundException(ERROR_CODES.ASSESS.NOT_FOUND, 'ไม่พบการประเมิน');
    if (assessment.status === 'SUBMITTED') {
      throw new BadRequestException(
        ERROR_CODES.ASSESS.SUBMITTED,
        'ไม่สามารถแก้ไขการประเมินที่ส่งไปแล้ว',
      );
    }
    await this.assertPriorRoundCompleted(assessment.storeId, assessment.round);
  }

  private async assertPriorRoundCompleted(storeId: string, round: Round): Promise<void> {
    const requiredPriorRound = REQUIRED_PRIOR_ROUND[round];
    if (!requiredPriorRound) return;

    const prior = await this.assessmentRepo.findByStoreAndRound(storeId, requiredPriorRound);
    const priorCompleted =
      prior?.status === AssessmentStatus.SUBMITTED || prior?.status === AssessmentStatus.APPROVED;
    if (!priorCompleted) {
      throw new BadRequestException(
        ERROR_CODES.ASSESS.INVALID_STATE,
        `ต้องส่งผลประเมินรอบ ${requiredPriorRound} ก่อน จึงจะเริ่มประเมินรอบ ${round} ได้`,
      );
    }
  }

  // Write access is ADMIN/ASSESSOR-only for this phase, matching the store module —
  // mentor/entrepreneur/judge/me_team read-only access is a later epic.
  private assertCanWrite(user: JwtPayload): void {
    if (user.role !== Role.ADMIN && user.role !== Role.ASSESSOR) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'เฉพาะ admin หรือ assessor เท่านั้นที่จัดการการประเมินได้',
      );
    }
  }
}
