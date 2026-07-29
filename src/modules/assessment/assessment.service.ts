import { Injectable } from '@nestjs/common';
import { AssessmentStatus, Role, Round, type Evidence } from '@prisma/client';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@common/exceptions/app.exception';
import {
  ERROR_CODES,
  ASSESSMENT_EVIDENCE_ALLOWED_EXTENSIONS,
  canReadAssessment,
  isAdminRole,
} from '@constants/index';
import { normalizePagination, buildPaginatedResult } from '@shared/pagination.util';
import { saveLocalFile, deleteLocalFile } from '@shared/file-storage.util';
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
    this.assertCanRead(user);
    const { skip, take, page, limit } = normalizePagination(query);
    const ownerId = user.role === Role.ENTREPRENEUR ? user.sub : undefined;
    const [items, total] = await Promise.all([
      this.assessmentRepo.findAll(query, skip, take, ownerId),
      this.assessmentRepo.count(query, ownerId),
    ]);
    return buildPaginatedResult(items, total, page, limit);
  }

  async findOne(id: string, user: JwtPayload): Promise<AssessmentResult> {
    this.assertCanRead(user);
    const assessment = await this.assessmentRepo.findDetailById(id);
    if (!assessment) throw new NotFoundException(ERROR_CODES.ASSESS.NOT_FOUND, 'ไม่พบการประเมิน');
    // An assessment is only as readable as the store it belongs to — without
    // this, an entrepreneur who knows an id reads another store's full scores.
    await this.storeService.findAccessible(assessment.storeId, user);
    return this.toResult(assessment);
  }

  async getRank(storeId: string, round: Round, user: JwtPayload): Promise<AssessmentRankResult> {
    this.assertCanRead(user);
    const store = await this.storeService.findAccessible(storeId, user);
    const submitted = await this.assessmentRepo.findSubmittedForRanking(round);

    const ranked = [...submitted].sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));
    const overallIndex = ranked.findIndex((a) => a.storeId === storeId);
    const provinceRanked = ranked.filter((a) => a.store.province === store.province);
    const provinceIndex = provinceRanked.findIndex((a) => a.storeId === storeId);

    const [{ dimensions, questions }, questionSums] = await Promise.all([
      this.dimensionService.findScoringContext(),
      this.assessmentRepo.sumRawScoreByQuestion(round, store.province),
    ]);
    const dimensionIdByQuestionId = new Map(questions.map((q) => [q.id, q.dimensionId]));

    const rawSumByDimension = new Map<number, number>(dimensions.map((d) => [d.id, 0]));
    for (const { questionId, rawScoreSum } of questionSums) {
      const dimensionId = dimensionIdByQuestionId.get(questionId);
      if (dimensionId === undefined) continue;
      rawSumByDimension.set(dimensionId, (rawSumByDimension.get(dimensionId) ?? 0) + rawScoreSum);
    }

    // Every assessment in the cohort divides by the same maxTotal, so averaging
    // the per-assessment percentages is the same number as dividing one summed
    // total by (cohort size × maxTotal) — and it needs one aggregate row per
    // question rather than every score row in the province.
    const dimensionAverages: DimensionAverageResult[] = dimensions.map((dimension) => {
      const denominator = provinceRanked.length * dimension.maxTotal;
      const avgPct =
        denominator === 0 ? 0 : ((rawSumByDimension.get(dimension.id) ?? 0) / denominator) * 100;
      return { dimensionId: dimension.id, avgPct: Math.round(avgPct * 10) / 10 };
    });

    return {
      overallRank: overallIndex === -1 ? null : overallIndex + 1,
      overallTotal: ranked.length,
      provinceRank: provinceIndex === -1 ? null : provinceIndex + 1,
      provinceTotal: provinceRanked.length,
      dimensionAverages,
    };
  }

  async getHistory(storeId: string, user: JwtPayload): Promise<AssessmentHistoryItemResult[]> {
    this.assertCanRead(user);
    await this.storeService.findAccessible(storeId, user);
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
    await this.storeService.findAccessible(dto.storeId, user);
    await this.assertAssignedToStore(dto.storeId, user);

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
    await this.assertDraftOrInProgress(assessmentId, user);

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
    await this.assertDraftOrInProgress(assessmentId, user);

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
    await this.assertDraftOrInProgress(assessmentId, user);

    const evidence = await this.assessmentRepo.findEvidenceById(evidenceId);
    if (!evidence || evidence.score.assessmentId !== assessmentId) {
      throw new NotFoundException(ERROR_CODES.FILE.NOT_FOUND, 'ไม่พบไฟล์หลักฐาน');
    }

    await this.assessmentRepo.removeEvidence(evidenceId);
    await deleteLocalFile(evidence.url);
  }

  async updateNotes(
    assessmentId: string,
    dto: UpdateNotesDto,
    user: JwtPayload,
  ): Promise<AssessmentResult> {
    this.assertCanWrite(user);
    await this.assertDraftOrInProgress(assessmentId, user);
    await this.assessmentRepo.updateNotes(assessmentId, dto.notes ?? null);
    return this.findOne(assessmentId, user);
  }

  // The incomplete half of the two save modes: scores already persist on every
  // keystroke, so a draft save's only job is to record that the round has been
  // worked on but is not finished — otherwise an assessment sitting at 12/50
  // is indistinguishable from one nobody has opened.
  async saveDraft(assessmentId: string, user: JwtPayload): Promise<AssessmentResult> {
    this.assertCanWrite(user);
    await this.assertDraftOrInProgress(assessmentId, user);
    await this.assessmentRepo.markInProgress(assessmentId, user.sub);
    return this.findOne(assessmentId, user);
  }

  async submit(assessmentId: string, user: JwtPayload): Promise<AssessmentResult> {
    this.assertCanWrite(user);
    const assessment = await this.assessmentRepo.findDetailById(assessmentId);
    if (!assessment) throw new NotFoundException(ERROR_CODES.ASSESS.NOT_FOUND, 'ไม่พบการประเมิน');
    await this.assertAssignedToStore(assessment.storeId, user);
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

  private async assertDraftOrInProgress(assessmentId: string, user: JwtPayload): Promise<void> {
    const assessment = await this.findStatusOrThrow(assessmentId);
    await this.assertAssignedToStore(assessment.storeId, user);
    if (isCompleted(assessment.status)) {
      throw new BadRequestException(
        ERROR_CODES.ASSESS.SUBMITTED,
        'ไม่สามารถแก้ไขการประเมินที่ส่งไปแล้ว',
      );
    }
    await this.assertPriorRoundCompleted(assessment.storeId, assessment.round);
  }

  // "ร้านที่ได้รับมอบหมาย" — the ASSIGNED data scope, enforced on writes only.
  // A store read stays open to every staff role (see project-conventions.md);
  // what an assessor may *score* is the SUPER_ADMIN's assignment list, set
  // through PATCH /users/:id/assigned-stores.
  //
  // Admin roles are exempt: they run the programme and stand in for an assessor
  // when nobody is assigned yet. An ASSESSOR with an empty list can score
  // nothing at all, which is the point — assignment comes first.
  private async assertAssignedToStore(storeId: string, user: JwtPayload): Promise<void> {
    if (user.role !== Role.ASSESSOR) return;
    const isAssigned = await this.assessmentRepo.isStoreAssignedTo(storeId, user.sub);
    if (!isAssigned) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'ร้านนี้ไม่ได้อยู่ในรายการที่คุณได้รับมอบหมายให้ประเมิน',
      );
    }
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

  // Scoring is the assessor's job alone. "แบบ 50 ข้อ" §3.3 gives ผู้ติดตาม/Assessor
  // "ประเมินร้าน 50 ข้อ / ให้คะแนน T0–T4"; §3.4 lists ที่ปรึกษา/Mentor's eight
  // rights and none of them is scoring — it reads the result to build the IDP.
  // A mentor's own writing surface is a different page entirely (ข้อเสนอแนะจาก
  // Mentor on the report, หมายเหตุ Mentor on the portfolio, the IDP itself),
  // none of which exists yet — so do NOT widen this list to give a mentor
  // somewhere to type.
  private static readonly WRITE_ROLES: string[] = [Role.ASSESSOR];

  // Every read path lands here. StoreService.findOne only ever narrows an
  // ENTREPRENEUR to its own store, so without this gate any authenticated
  // account — including a self-registered VIEWER — reads every store's scores.
  private assertCanRead(user: JwtPayload): void {
    if (!canReadAssessment(user.role)) {
      throw new ForbiddenException(ERROR_CODES.PERM.FORBIDDEN, 'ไม่มีสิทธิ์ดูผลการประเมิน');
    }
  }

  private assertCanWrite(user: JwtPayload): void {
    if (!isAdminRole(user.role) && !AssessmentService.WRITE_ROLES.includes(user.role)) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'เฉพาะ admin หรือผู้ประเมินเท่านั้นที่จัดการการประเมินได้',
      );
    }
  }
}
