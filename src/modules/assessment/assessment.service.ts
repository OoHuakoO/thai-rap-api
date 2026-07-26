import { Injectable } from '@nestjs/common';
import { AssessmentStatus, Role, Round, type Evidence } from '@prisma/client';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@common/exceptions/app.exception';
import { ERROR_CODES, ASSESSMENT_EVIDENCE_ALLOWED_EXTENSIONS, isAdminRole } from '@constants/index';
import { normalizePagination, buildPaginatedResult } from '@shared/pagination.util';
import { saveLocalFile, deleteLocalFile, deleteLocalDir } from '@shared/file-storage.util';
import type { PaginatedResult } from '@common/types/api-response.type';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { StoreService } from '@modules/store/store.service';
import {
  AssessmentRepository,
  type AssessmentDetail,
  type AssessmentStatusRow,
  type AssessmentSummaryRow,
} from './assessment.repository';
import { DimensionService } from './dimension.service';
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
  type ScoredQuestion,
} from './assessment-scoring.util';

// Mirrors REQUIRED_PRIOR_ROUND in the web's utils/round.ts — the UI lock is
// UX only, this is the real gate. Enforced on every write (create, score,
// evidence, notes, submit) via assertPriorRoundCompleted, not just create —
// otherwise a round record that already exists (e.g. seeded/legacy data)
// could keep being scored and submitted regardless of the prior round.
const REQUIRED_PRIOR_ROUND: Partial<Record<Round, Round>> = {
  [Round.T1]: Round.T0,
  [Round.T2]: Round.T1,
  [Round.T3]: Round.T1,
};

// A round is finished once it is submitted; an admin approving it afterwards
// does not un-finish it. Every read of "is this round done" goes through this
// list — treating only SUBMITTED as done let an APPROVED round be re-scored
// and re-submitted (duplicating its red flags) and dropped it out of ranking.
const COMPLETED_STATUSES: AssessmentStatus[] = [
  AssessmentStatus.SUBMITTED,
  AssessmentStatus.APPROVED,
];

function isCompleted(status: AssessmentStatus | undefined): boolean {
  return status !== undefined && COMPLETED_STATUSES.includes(status);
}

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
  /** The frozen result — null until the round is submitted. */
  totalScore: number | null;
  /** Weighted score of whatever is scored right now; equals totalScore once submitted. */
  currentScore: number;
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
    private readonly dimensionService: DimensionService,
    private readonly storeService: StoreService,
  ) {}

  async findAll(
    query: QueryAssessmentDto,
    user: JwtPayload,
  ): Promise<PaginatedResult<AssessmentSummaryRow>> {
    const { skip, take, page, limit } = normalizePagination(query);
    const ownerId = user.role === Role.ENTREPRENEUR ? user.sub : undefined;
    const [items, total] = await Promise.all([
      this.assessmentRepo.findAll(query, skip, take, ownerId),
      this.assessmentRepo.count(query, ownerId),
    ]);
    return buildPaginatedResult(items, total, page, limit);
  }

  async findOne(id: string, user: JwtPayload): Promise<AssessmentResult> {
    const assessment = await this.assessmentRepo.findDetailById(id);
    if (!assessment) throw new NotFoundException(ERROR_CODES.ASSESS.NOT_FOUND, 'ไม่พบการประเมิน');
    // An assessment is only as readable as the store it belongs to — without
    // this, an entrepreneur who knows an id reads another store's full scores.
    await this.storeService.findOne(assessment.storeId, user);
    return this.toResult(assessment);
  }

  async getRank(storeId: string, round: Round, user: JwtPayload): Promise<AssessmentRankResult> {
    const store = await this.storeService.findOne(storeId, user);
    const submitted = await this.assessmentRepo.findSubmittedForRanking(round);

    const ranked = [...submitted].sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));
    const overallIndex = ranked.findIndex((a) => a.storeId === storeId);
    const provinceRanked = ranked.filter((a) => a.store.province === store.province);
    const provinceIndex = provinceRanked.findIndex((a) => a.storeId === storeId);

    const { dimensions, questions } = await this.dimensionService.findScoringContext();
    const dimensionIdByQuestionId = new Map(questions.map((q) => [q.id, q.dimensionId]));

    const dimensionPctSums = new Map<number, number>(dimensions.map((d) => [d.id, 0]));
    for (const assessment of provinceRanked) {
      const scoredQuestions = assessment.scores.map((s) => ({
        dimensionId: dimensionIdByQuestionId.get(s.questionId) ?? -1,
        rawScore: s.rawScore ?? 0,
      }));
      const dimensionPcts = computeDimensionScores(scoredQuestions, dimensions);
      for (const dimension of dimensions) {
        dimensionPctSums.set(
          dimension.id,
          (dimensionPctSums.get(dimension.id) ?? 0) + (dimensionPcts.get(dimension.id) ?? 0),
        );
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
    return this.findOne(created.id, user);
  }

  async updateScore(
    assessmentId: string,
    questionId: number,
    dto: UpdateScoreDto,
    user: JwtPayload,
  ): Promise<AssessmentQuestionResult> {
    this.assertCanWrite(user);
    await this.assertDraftOrInProgress(assessmentId);

    const question = await this.dimensionService.findQuestionById(questionId);
    if (!question) {
      throw new NotFoundException(ERROR_CODES.ASSESS.QUESTION_NOT_FOUND, 'ไม่พบคำถาม');
    }
    this.assertScoreWithinMax(dto.rawScore, question);

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

    const questionById = new Map(
      (await this.dimensionService.findAllQuestions()).map((q) => [q.id, q]),
    );
    for (const item of dto.scores) {
      const question = questionById.get(item.questionId);
      if (!question) {
        throw new NotFoundException(
          ERROR_CODES.ASSESS.QUESTION_NOT_FOUND,
          `ไม่พบคำถามหมายเลข ${item.questionId}`,
        );
      }
      this.assertScoreWithinMax(item.rawScore, question);
    }

    await this.assessmentRepo.bulkUpsertScores(assessmentId, user.sub, dto.scores);

    return this.getProgress(assessmentId, user);
  }

  async getProgress(
    assessmentId: string,
    user: JwtPayload,
  ): Promise<{ scored: number; total: number }> {
    const assessment = await this.findStatusOrThrow(assessmentId);
    await this.storeService.findOne(assessment.storeId, user);
    const [scored, questions] = await Promise.all([
      this.assessmentRepo.countScored(assessmentId),
      this.dimensionService.findAllQuestions(),
    ]);
    return { scored, total: questions.length };
  }

  async updateNotes(
    assessmentId: string,
    dto: UpdateNotesDto,
    user: JwtPayload,
  ): Promise<AssessmentResult> {
    this.assertCanWrite(user);
    await this.assertDraftOrInProgress(assessmentId);
    await this.assessmentRepo.updateNotes(assessmentId, dto.notes ?? null);
    return this.findOne(assessmentId, user);
  }

  // The incomplete half of the two save modes: scores already persist on every
  // keystroke, so a draft save's only job is to record that the round has been
  // worked on but is not finished — otherwise an assessment sitting at 12/50
  // is indistinguishable from one nobody has opened.
  async saveDraft(assessmentId: string, user: JwtPayload): Promise<AssessmentResult> {
    this.assertCanWrite(user);
    await this.assertDraftOrInProgress(assessmentId);
    await this.assessmentRepo.markInProgress(assessmentId, user.sub);
    return this.findOne(assessmentId, user);
  }

  async submit(assessmentId: string, user: JwtPayload): Promise<AssessmentResult> {
    this.assertCanWrite(user);
    const assessment = await this.assessmentRepo.findDetailById(assessmentId);
    if (!assessment) throw new NotFoundException(ERROR_CODES.ASSESS.NOT_FOUND, 'ไม่พบการประเมิน');
    if (isCompleted(assessment.status)) {
      throw new BadRequestException(ERROR_CODES.ASSESS.SUBMITTED, 'การประเมินนี้ถูกส่งไปแล้ว');
    }
    await this.assertPriorRoundCompleted(assessment.storeId, assessment.round);

    const { dimensions, questions } = await this.dimensionService.findScoringContext();

    // The bar is "every question that exists", read from the question table
    // rather than a hardcoded 50 — the seed owns how many there are.
    const scoredEntries = assessment.scores.filter((s) => s.rawScore !== null);
    if (scoredEntries.length < questions.length) {
      throw new BadRequestException(
        ERROR_CODES.ASSESS.NOT_ALL_SCORED,
        `ต้องให้คะแนนครบทั้ง ${questions.length} ข้อก่อนส่ง (${scoredEntries.length}/${questions.length})`,
      );
    }

    const scoredQuestions: ScoredQuestion[] = scoredEntries.map((s) => ({
      questionNo: s.question.questionNo,
      dimensionId: s.question.dimensionId,
      rawScore: s.rawScore as number,
    }));

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
    const assessment = await this.assessmentRepo.findStatusById(id);
    if (!assessment) throw new NotFoundException(ERROR_CODES.ASSESS.NOT_FOUND, 'ไม่พบการประเมิน');
    await this.storeService.findOne(assessment.storeId, user);
    if (assessment.status !== AssessmentStatus.DRAFT) {
      throw new BadRequestException(
        ERROR_CODES.ASSESS.INVALID_STATE,
        'ลบได้เฉพาะการประเมินที่ยังเป็นแบบร่างเท่านั้น',
      );
    }
    await this.assessmentRepo.remove(id);
    // The rows are gone; the files they pointed at would otherwise sit in
    // uploads/ forever with nothing left referencing them.
    await deleteLocalDir(`evidence/${id}`);
  }

  private async toResult(assessment: AssessmentDetail): Promise<AssessmentResult> {
    const { dimensions, questions: allQuestions } =
      await this.dimensionService.findScoringContext();
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

    // The same formula submit() will apply, run over whatever is scored so far
    // — unscored questions count as 0, exactly as they would at submit. That
    // makes this converge on totalScore rather than jump when the round is
    // submitted. Never persisted: only submit() writes a score to the row, so
    // ranking and dashboard aggregates keep seeing finished rounds only.
    const currentScore = computeTotalScore(
      computeDimensionScores(
        questions.map((q) => ({ dimensionId: q.dimensionId, rawScore: q.rawScore ?? 0 })),
        dimensions,
      ),
      dimensions,
    );

    return {
      id: assessment.id,
      storeId: assessment.storeId,
      round: assessment.round,
      assessorId: assessment.assessorId,
      status: assessment.status,
      totalScore: assessment.totalScore,
      currentScore,
      zone: assessment.totalScore !== null ? getZone(assessment.totalScore) : null,
      notes: assessment.notes,
      createdAt: assessment.createdAt,
      updatedAt: assessment.updatedAt,
      submittedAt: assessment.submittedAt,
      questions,
      redFlags: assessment.redFlags,
    };
  }

  // The DTO's @Max is the coarse schema bound; the real ceiling is per question,
  // so a question worth fewer points than that bound can't be over-scored.
  private assertScoreWithinMax(rawScore: number, question: { maxScore: number }): void {
    if (rawScore > question.maxScore) {
      throw new BadRequestException(
        ERROR_CODES.ASSESS.SCORE_OUT_OF_RANGE,
        `คะแนนต้องไม่เกิน ${question.maxScore}`,
      );
    }
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

  private async findStatusOrThrow(assessmentId: string): Promise<AssessmentStatusRow> {
    const assessment = await this.assessmentRepo.findStatusById(assessmentId);
    if (!assessment) throw new NotFoundException(ERROR_CODES.ASSESS.NOT_FOUND, 'ไม่พบการประเมิน');
    return assessment;
  }

  private async assertDraftOrInProgress(assessmentId: string): Promise<void> {
    const assessment = await this.findStatusOrThrow(assessmentId);
    if (isCompleted(assessment.status)) {
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
    if (!isCompleted(prior?.status)) {
      throw new BadRequestException(
        ERROR_CODES.ASSESS.INVALID_STATE,
        `ต้องส่งผลประเมินรอบ ${requiredPriorRound} ก่อน จึงจะเริ่มประเมินรอบ ${round} ได้`,
      );
    }
  }

  // Mirrors ASSESSMENT_WRITE in the web's ROLE_PERMISSIONS: admin roles,
  // ASSESSOR and MENTOR — the brief gives a mentor the same evaluation duty as
  // an assessor. ENTREPRENEUR/JUDGE/ME_TEAM/VIEWER stay read-only.
  private static readonly WRITE_ROLES: string[] = [Role.ASSESSOR, Role.MENTOR];

  private assertCanWrite(user: JwtPayload): void {
    if (!isAdminRole(user.role) && !AssessmentService.WRITE_ROLES.includes(user.role)) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'เฉพาะ admin, assessor หรือ mentor เท่านั้นที่จัดการการประเมินได้',
      );
    }
  }
}
