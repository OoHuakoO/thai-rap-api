import { Test, type TestingModule } from '@nestjs/testing';
import {
  Role,
  Round,
  AssessmentStatus,
  ScoreStatus,
  type Assessment,
  type Dimension,
  type Question,
  type Score,
  type Evidence,
} from '@prisma/client';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@common/exceptions/app.exception';
import { ERROR_CODES } from '@constants/index';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { saveLocalFile, deleteLocalFile } from '@shared/file-storage.util';
import { StoreService } from '@modules/store/store.service';
import type { StoreResult } from '@modules/store/types/store-result.type';
import { AssessmentService } from './assessment.service';
import {
  AssessmentRepository,
  type AssessmentDetail,
  type AssessmentStatusRow,
  type AssessmentForRanking,
} from './assessment.repository';
import { DimensionService } from './dimension.service';
import type { CreateAssessmentDto } from './dto/create-assessment.dto';
import type { UpdateScoreDto } from './dto/update-score.dto';

jest.mock('@shared/file-storage.util', () => ({
  saveLocalFile: jest.fn(),
  deleteLocalFile: jest.fn(),
}));

const mockedSaveLocalFile = saveLocalFile as jest.MockedFunction<typeof saveLocalFile>;
const mockedDeleteLocalFile = deleteLocalFile as jest.MockedFunction<typeof deleteLocalFile>;

const admin: JwtPayload = { sub: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
const entrepreneur: JwtPayload = {
  sub: 'owner-1',
  email: 'owner@example.com',
  role: Role.ENTREPRENEUR,
};
const assessor: JwtPayload = {
  sub: 'assessor-1',
  email: 'assessor@example.com',
  role: Role.ASSESSOR,
};
const mentor: JwtPayload = { sub: 'mentor-1', email: 'mentor@example.com', role: Role.MENTOR };
const viewer: JwtPayload = { sub: 'viewer-1', email: 'viewer@example.com', role: Role.VIEWER };
const judge: JwtPayload = { sub: 'judge-1', email: 'judge@example.com', role: Role.JUDGE };

// Two dimensions, 25 questions each — enough to exercise the weighted-total
// and per-dimension-average formulas without mirroring the real 8-dimension seed.
const mockDimensions: Dimension[] = [
  { id: 1, name: 'มิติ 1', nameEn: 'Dimension 1', weight: 30, questionCount: 25 },
  { id: 2, name: 'มิติ 2', nameEn: 'Dimension 2', weight: 70, questionCount: 25 },
];

function buildQuestion(id: number, dimensionId: number): Question {
  return { id, dimensionId, questionNo: id, questionText: `คำถามที่ ${id}`, maxScore: 4 };
}

const mockQuestions: Question[] = Array.from({ length: 50 }, (_, i) =>
  buildQuestion(i + 1, i < 25 ? 1 : 2),
);

// What DimensionService derives from the two above: 25 questions × maxScore 4.
const mockDimensionInfos = mockDimensions.map((dimension) => ({ ...dimension, maxTotal: 100 }));

function buildScore(questionId: number, rawScore: number | null) {
  const question = mockQuestions.find((q) => q.id === questionId)!;
  const dimension = mockDimensions.find((d) => d.id === question.dimensionId)!;
  return {
    id: `score-${questionId}`,
    assessmentId: 'assessment-1',
    questionId,
    rawScore,
    displayScore: rawScore,
    note: null,
    suggestion: null,
    status: rawScore !== null ? ScoreStatus.SCORED : ScoreStatus.PENDING,
    question: { ...question, dimension },
    evidences: [] as Evidence[],
  };
}

// rawScore 3 on all 50 questions keeps computeTotalScore/detectRedFlags
// predictable: dimension pct is 75% everywhere and no red-flag threshold trips.
const mockFullScores = mockQuestions.map((q) => buildScore(q.id, 3));

const mockAssessmentRow: Assessment = {
  id: 'assessment-1',
  storeId: 'store-1',
  round: Round.T0,
  assessorId: 'assessor-1',
  status: AssessmentStatus.DRAFT,
  totalScore: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  submittedAt: null,
};

const mockAssessmentDetail: AssessmentDetail = {
  ...mockAssessmentRow,
  scores: mockFullScores,
  redFlags: [],
};

const mockStatusRow: AssessmentStatusRow = {
  id: 'assessment-1',
  status: AssessmentStatus.DRAFT,
  storeId: 'store-1',
  round: Round.T0,
};

const mockScoreRow: Score = {
  id: 'score-1',
  assessmentId: 'assessment-1',
  questionId: 1,
  rawScore: 3,
  displayScore: 3,
  note: null,
  suggestion: null,
  status: ScoreStatus.SCORED,
};

const mockEvidence: Evidence = {
  id: 'evidence-1',
  scoreId: 'score-1',
  filename: 'evidence.jpg',
  fileType: 'image/jpeg',
  fileSize: 2048,
  url: '/uploads/evidence/assessment-1/evidence.jpg',
  uploadedAt: new Date(),
};

const mockFile = {
  originalname: 'evidence.jpg',
  mimetype: 'image/jpeg',
  size: 2048,
  buffer: Buffer.from('data'),
} as Express.Multer.File;

const mockStoreResult: StoreResult = {
  id: 'store-1',
  code: 'RAP69-001',
  name: 'ร้านทดสอบ',
  province: 'ชลบุรี',
  storeType: 'อาหารตามสั่ง',
  ownerName: 'เจ้าของร้าน',
  phone: '0812345678',
  email: null,
  address: 'ที่อยู่ร้าน',
  socialLinks: {},
  avgRevenueMin: null,
  avgRevenueMax: null,
  mainProblems: [],
  goals: [],
  menuPhotos: [],
  coverUrl: null,
  storePhotos: [],
  documents: [],
  status: 'REGISTERED' as StoreResult['status'],
  ownerId: 'owner-1',
  latestScore: null,
  latestAssessorName: null,
  latestAssessedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildRankingAssessment(
  storeId: string,
  totalScore: number,
  province: string,
): AssessmentForRanking {
  return {
    storeId,
    totalScore,
    store: { province },
  };
}

describe('AssessmentService', () => {
  let service: AssessmentService;
  let repo: jest.Mocked<AssessmentRepository>;
  let dimensionService: jest.Mocked<DimensionService>;
  let storeService: jest.Mocked<StoreService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssessmentService,
        {
          provide: AssessmentRepository,
          useValue: {
            findAll: jest.fn(),
            count: jest.fn(),
            findByStoreAndRound: jest.fn(),
            findHistoryByStore: jest.fn(),
            findSubmittedForRanking: jest.fn(),
            sumRawScoreByQuestion: jest.fn().mockResolvedValue([]),
            findDetailById: jest.fn(),
            findStatusById: jest.fn(),
            isStoreAssignedTo: jest.fn().mockResolvedValue(true),
            create: jest.fn(),
            updateNotes: jest.fn(),
            reassignAssessor: jest.fn(),
            markInProgress: jest.fn(),
            upsertScore: jest.fn(),
            findScore: jest.fn(),
            createEvidence: jest.fn(),
            findEvidenceByScoreId: jest.fn().mockResolvedValue([]),
            findEvidenceById: jest.fn(),
            removeEvidence: jest.fn(),
            submitAssessment: jest.fn(),
            rescoreAssessment: jest.fn(),
          },
        },
        {
          provide: DimensionService,
          useValue: {
            findAllDimensions: jest.fn().mockResolvedValue(mockDimensions),
            findAllQuestions: jest.fn().mockResolvedValue(mockQuestions),
            findDimensionInfos: jest.fn().mockResolvedValue(mockDimensionInfos),
            findScoringContext: jest
              .fn()
              .mockResolvedValue({ dimensions: mockDimensionInfos, questions: mockQuestions }),
            findQuestionById: jest.fn(),
          },
        },
        {
          provide: StoreService,
          useValue: { findAccessible: jest.fn().mockResolvedValue(mockStoreResult) },
        },
      ],
    }).compile();

    service = module.get(AssessmentService);
    repo = module.get(AssessmentRepository);
    dimensionService = module.get(DimensionService);
    storeService = module.get(StoreService);
  });

  describe('findAll', () => {
    it('should return paginated assessments', async () => {
      repo.findAll.mockResolvedValue([mockAssessmentRow]);
      repo.count.mockResolvedValue(1);

      const result = await service.findAll({}, admin);

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(repo.findAll).toHaveBeenCalledWith({}, 0, expect.any(Number), undefined);
    });

    it('should scope the list to the owner stores for ENTREPRENEUR', async () => {
      repo.findAll.mockResolvedValue([]);
      repo.count.mockResolvedValue(0);

      await service.findAll({}, entrepreneur);

      expect(repo.findAll).toHaveBeenCalledWith({}, 0, expect.any(Number), entrepreneur.sub);
      expect(repo.count).toHaveBeenCalledWith({}, entrepreneur.sub);
    });

    // Anyone can self-register as a VIEWER and the account is ACTIVE at once,
    // so an ungated list published every store's scores to the internet.
    it.each([
      ['VIEWER', viewer],
      ['JUDGE', judge],
    ])('should throw ForbiddenException for %s', async (_label, user) => {
      await expect(service.findAll({}, user)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.findAll).not.toHaveBeenCalled();
    });
  });

  // findOne narrows an ENTREPRENEUR through storeService.findAccessible on the owning
  // store, so that half of the RBAC is asserted as a pass-through rather than
  // re-tested here; the role allow-list is its own case below.
  describe('findOne', () => {
    it('should throw ForbiddenException for a role outside the read allow-list', async () => {
      await expect(service.findOne('assessment-1', viewer)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repo.findDetailById).not.toHaveBeenCalled();
    });

    it('should return assessment detail with all 50 questions mapped', async () => {
      repo.findDetailById.mockResolvedValue(mockAssessmentDetail);

      const result = await service.findOne('assessment-1', admin);

      expect(result.id).toBe('assessment-1');
      expect(result.questions).toHaveLength(50);
      expect(result.questions[0].rawScore).toBe(3);
    });

    it('should return a live currentScore while totalScore is still unset', async () => {
      repo.findDetailById.mockResolvedValue(mockAssessmentDetail);

      const result = await service.findOne('assessment-1', admin);

      // Every question scored 3 of 4 — 75% in both dimensions, so the weighted
      // total is 75 whatever the weights are. Not yet submitted, so totalScore
      // stays null and zone stays unset.
      expect(result.currentScore).toBe(75);
      expect(result.totalScore).toBeNull();
      expect(result.zone).toBeNull();
    });

    it('should count unscored questions as zero in currentScore', async () => {
      repo.findDetailById.mockResolvedValue({
        ...mockAssessmentDetail,
        scores: mockFullScores.map((score) =>
          score.question.dimensionId === 1 ? score : { ...score, rawScore: null },
        ),
      });

      const result = await service.findOne('assessment-1', admin);

      // Dimension 1 at 75% carrying weight 30, dimension 2 untouched at 0%.
      expect(result.currentScore).toBe(22.5);
    });

    it('should throw NotFoundException when the assessment does not exist', async () => {
      repo.findDetailById.mockResolvedValue(null);

      await expect(service.findOne('missing', admin)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should propagate the store access check for an entrepreneur reading another store', async () => {
      repo.findDetailById.mockResolvedValue(mockAssessmentDetail);
      storeService.findAccessible.mockRejectedValue(
        new ForbiddenException(ERROR_CODES.PERM.FORBIDDEN, 'ไม่มีสิทธิ์เข้าถึง'),
      );

      await expect(service.findOne('assessment-1', entrepreneur)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // RBAC for getRank/getHistory is delegated entirely to storeService.findAccessible
  // (ENTREPRENEUR can only see their own store) — no separate forbidden/not-found
  // branch inside AssessmentService itself, so we only assert the pass-through.
  describe('getRank', () => {
    it('should compute overall rank, province rank, and dimension averages', async () => {
      repo.findSubmittedForRanking.mockResolvedValue([
        buildRankingAssessment('store-3', 400, 'เชียงใหม่'),
        buildRankingAssessment('store-1', 300, 'ชลบุรี'),
        buildRankingAssessment('store-2', 250, 'ชลบุรี'),
      ]);
      // Both ชลบุรี stores scored 3 on every question, so the database returns
      // 3 + 3 per question — 75% of full marks in each dimension.
      repo.sumRawScoreByQuestion.mockResolvedValue(
        mockQuestions.map((q) => ({ questionId: q.id, rawScoreSum: 6 })),
      );

      const result = await service.getRank('store-1', Round.T0, admin);

      expect(repo.sumRawScoreByQuestion).toHaveBeenCalledWith(Round.T0, 'ชลบุรี');

      expect(storeService.findAccessible).toHaveBeenCalledWith('store-1', admin);
      expect(result.overallRank).toBe(2);
      expect(result.overallTotal).toBe(3);
      expect(result.provinceRank).toBe(1);
      expect(result.provinceTotal).toBe(2);
      expect(result.dimensionAverages).toEqual([
        { dimensionId: 1, avgPct: 75 },
        { dimensionId: 2, avgPct: 75 },
      ]);
    });

    // The aggregate replaces averaging per-assessment percentages; the two are
    // the same number only because every assessment shares one denominator.
    it('should average the province sums over the cohort size, not over the rows returned', async () => {
      repo.findSubmittedForRanking.mockResolvedValue([
        buildRankingAssessment('store-1', 300, 'ชลบุรี'),
        buildRankingAssessment('store-2', 250, 'ชลบุรี'),
      ]);
      // Only dimension 1 was scored, and only by one of the two stores: 25
      // questions × 4 = 100 raw out of a cohort maximum of 2 × 100.
      repo.sumRawScoreByQuestion.mockResolvedValue(
        mockQuestions
          .filter((q) => q.dimensionId === 1)
          .map((q) => ({ questionId: q.id, rawScoreSum: 4 })),
      );

      const result = await service.getRank('store-1', Round.T0, admin);

      expect(result.dimensionAverages).toEqual([
        { dimensionId: 1, avgPct: 50 },
        { dimensionId: 2, avgPct: 0 },
      ]);
    });

    it('should return null ranks when the store has no submitted assessment for the round', async () => {
      repo.findSubmittedForRanking.mockResolvedValue([
        buildRankingAssessment('store-2', 250, 'ชลบุรี'),
      ]);

      const result = await service.getRank('store-1', Round.T0, admin);

      expect(result.overallRank).toBeNull();
      expect(result.provinceRank).toBeNull();
    });

    it('should propagate the error when the store lookup fails (e.g. not found)', async () => {
      storeService.findAccessible.mockRejectedValue(
        new NotFoundException(ERROR_CODES.STORE.NOT_FOUND, 'ไม่พบร้านค้า'),
      );

      await expect(service.getRank('missing-store', Round.T0, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.findSubmittedForRanking).not.toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('should return round history for a store', async () => {
      repo.findHistoryByStore.mockResolvedValue([
        {
          round: Round.T0,
          status: AssessmentStatus.SUBMITTED,
          totalScore: 80,
          updatedAt: new Date(),
          submittedAt: new Date(),
          assessor: { name: 'ผู้ประเมิน' },
        },
      ]);

      const result = await service.getHistory('store-1', admin);

      expect(storeService.findAccessible).toHaveBeenCalledWith('store-1', admin);
      expect(result).toHaveLength(1);
      expect(result[0].assessorName).toBe('ผู้ประเมิน');
    });
  });

  describe('create', () => {
    const dto: CreateAssessmentDto = { storeId: 'store-1', round: Round.T0 };

    it('should create a draft assessment', async () => {
      repo.findByStoreAndRound.mockResolvedValue(null);
      repo.create.mockResolvedValue(mockAssessmentRow);
      repo.findDetailById.mockResolvedValue(mockAssessmentDetail);

      const result = await service.create(dto, admin);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ round: Round.T0, assessor: { connect: { id: admin.sub } } }),
      );
      expect(result.id).toBe('assessment-1');
    });

    it('should throw ForbiddenException for ENTREPRENEUR', async () => {
      await expect(service.create(dto, entrepreneur)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when an assessment already exists for the round', async () => {
      repo.findByStoreAndRound.mockResolvedValue(mockAssessmentRow);

      await expect(service.create(dto, admin)).rejects.toBeInstanceOf(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when the prior round has not been completed', async () => {
      const t1Dto: CreateAssessmentDto = { storeId: 'store-1', round: Round.T1 };
      repo.findByStoreAndRound
        .mockResolvedValueOnce(null) // no existing T1 assessment
        .mockResolvedValueOnce(null); // no T0 assessment at all -> prior round incomplete

      await expect(service.create(t1Dto, admin)).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('updateScore', () => {
    const dto: UpdateScoreDto = { rawScore: 3, note: 'บันทึก', suggestion: 'คำแนะนำ' };

    it('should upsert the score and reassign the assessor', async () => {
      repo.findStatusById.mockResolvedValue(mockStatusRow);
      dimensionService.findQuestionById.mockResolvedValue(mockQuestions[0]);
      repo.upsertScore.mockResolvedValue({
        ...mockScoreRow,
        note: 'บันทึก',
        suggestion: 'คำแนะนำ',
      });

      const result = await service.updateScore('assessment-1', 1, dto, admin);

      expect(result.questionId).toBe(1);
      expect(repo.reassignAssessor).toHaveBeenCalledWith('assessment-1', admin.sub);
    });

    it('should throw NotFoundException when the question does not exist', async () => {
      repo.findStatusById.mockResolvedValue(mockStatusRow);
      dimensionService.findQuestionById.mockResolvedValue(null);

      await expect(service.updateScore('assessment-1', 9999, dto, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for ENTREPRENEUR', async () => {
      await expect(
        service.updateScore('assessment-1', 1, dto, entrepreneur),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should throw BadRequestException when an ASSESSOR edits an already submitted assessment', async () => {
      repo.findStatusById.mockResolvedValue({
        ...mockStatusRow,
        status: AssessmentStatus.SUBMITTED,
      });

      await expect(service.updateScore('assessment-1', 1, dto, assessor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.upsertScore).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when an ASSESSOR edits an already approved assessment', async () => {
      repo.findStatusById.mockResolvedValue({
        ...mockStatusRow,
        status: AssessmentStatus.APPROVED,
      });

      await expect(service.updateScore('assessment-1', 1, dto, assessor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.upsertScore).not.toHaveBeenCalled();
    });

    // The correction path: a finished round may be wrong, and only an admin
    // role may fix it — the score it froze feeds ranking and every report.
    it('should let an ADMIN correct a submitted assessment and re-freeze its score', async () => {
      repo.findStatusById.mockResolvedValue({
        ...mockStatusRow,
        status: AssessmentStatus.SUBMITTED,
      });
      dimensionService.findQuestionById.mockResolvedValue(mockQuestions[0]);
      repo.upsertScore.mockResolvedValue(mockScoreRow);
      repo.findDetailById.mockResolvedValue({
        ...mockAssessmentDetail,
        status: AssessmentStatus.SUBMITTED,
      });

      await service.updateScore('assessment-1', 1, dto, admin);

      // 75% in both dimensions, weighted 30/70 — the same formula submit() ran.
      expect(repo.rescoreAssessment).toHaveBeenCalledWith('assessment-1', 75, expect.any(Array));
    });

    it('should keep the original assessor when an ADMIN corrects a submitted assessment', async () => {
      repo.findStatusById.mockResolvedValue({
        ...mockStatusRow,
        status: AssessmentStatus.SUBMITTED,
      });
      dimensionService.findQuestionById.mockResolvedValue(mockQuestions[0]);
      repo.upsertScore.mockResolvedValue(mockScoreRow);
      repo.findDetailById.mockResolvedValue({
        ...mockAssessmentDetail,
        status: AssessmentStatus.SUBMITTED,
      });

      await service.updateScore('assessment-1', 1, dto, admin);

      expect(repo.reassignAssessor).not.toHaveBeenCalled();
    });

    it('should not re-freeze the score when the assessment is still in progress', async () => {
      repo.findStatusById.mockResolvedValue({
        ...mockStatusRow,
        status: AssessmentStatus.IN_PROGRESS,
      });
      dimensionService.findQuestionById.mockResolvedValue(mockQuestions[0]);
      repo.upsertScore.mockResolvedValue(mockScoreRow);

      await service.updateScore('assessment-1', 1, dto, admin);

      expect(repo.rescoreAssessment).not.toHaveBeenCalled();
      expect(repo.reassignAssessor).toHaveBeenCalledWith('assessment-1', admin.sub);
    });

    it('should let an ASSESSOR score a store assigned to them', async () => {
      repo.findStatusById.mockResolvedValue(mockStatusRow);
      dimensionService.findQuestionById.mockResolvedValue(mockQuestions[0]);
      repo.upsertScore.mockResolvedValue(mockScoreRow);

      await expect(service.updateScore('assessment-1', 1, dto, assessor)).resolves.toBeDefined();
    });

    it('should throw ForbiddenException for an ASSESSOR the store is not assigned to', async () => {
      repo.findStatusById.mockResolvedValue(mockStatusRow);
      repo.isStoreAssignedTo.mockResolvedValue(false);

      await expect(service.updateScore('assessment-1', 1, dto, assessor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repo.upsertScore).not.toHaveBeenCalled();
    });

    // Admin roles stand in for an assessor before anyone is assigned, so the
    // assignment list must not gate them.
    it('should let an ADMIN score a store assigned to nobody', async () => {
      repo.findStatusById.mockResolvedValue(mockStatusRow);
      repo.isStoreAssignedTo.mockResolvedValue(false);
      dimensionService.findQuestionById.mockResolvedValue(mockQuestions[0]);
      repo.upsertScore.mockResolvedValue(mockScoreRow);

      await expect(service.updateScore('assessment-1', 1, dto, admin)).resolves.toBeDefined();
    });

    // "แบบ 50 ข้อ" §3.3 vs §3.4: ผู้ติดตาม/Assessor "ให้คะแนน T0–T4", while the
    // eight rights listed for ที่ปรึกษา/Mentor are all reads plus its own IDP.
    it('should throw ForbiddenException for MENTOR, who only reads the result', async () => {
      await expect(service.updateScore('assessment-1', 1, dto, mentor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repo.upsertScore).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when rawScore exceeds the question maxScore', async () => {
      repo.findStatusById.mockResolvedValue(mockStatusRow);
      dimensionService.findQuestionById.mockResolvedValue({ ...mockQuestions[0], maxScore: 2 });

      await expect(
        service.updateScore('assessment-1', 1, { rawScore: 3 }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.upsertScore).not.toHaveBeenCalled();
    });
  });

  describe('uploadEvidence', () => {
    it('should save the file and create an evidence row', async () => {
      repo.findStatusById.mockResolvedValue(mockStatusRow);
      repo.findScore.mockResolvedValue(mockScoreRow);
      mockedSaveLocalFile.mockResolvedValue({
        storedName: 'x.jpg',
        relativeUrl: '/uploads/evidence/assessment-1/x.jpg',
      });
      repo.createEvidence.mockResolvedValue(mockEvidence);

      const result = await service.uploadEvidence('assessment-1', 1, mockFile, admin);

      expect(result.id).toBe(mockEvidence.id);
      expect(mockedSaveLocalFile).toHaveBeenCalled();
    });

    it('should throw BadRequestException when the question has not been scored yet', async () => {
      repo.findStatusById.mockResolvedValue(mockStatusRow);
      repo.findScore.mockResolvedValue(null);

      await expect(
        service.uploadEvidence('assessment-1', 1, mockFile, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockedSaveLocalFile).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException for ENTREPRENEUR', async () => {
      await expect(
        service.uploadEvidence('assessment-1', 1, mockFile, entrepreneur),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('removeEvidence', () => {
    it('should remove the evidence row and delete the file', async () => {
      repo.findStatusById.mockResolvedValue(mockStatusRow);
      repo.findEvidenceById.mockResolvedValue({
        ...mockEvidence,
        score: { assessmentId: 'assessment-1' },
      });

      await service.removeEvidence('assessment-1', 'evidence-1', admin);

      expect(repo.removeEvidence).toHaveBeenCalledWith('evidence-1');
      expect(mockedDeleteLocalFile).toHaveBeenCalledWith(mockEvidence.url);
    });

    it('should throw NotFoundException when the evidence belongs to a different assessment', async () => {
      repo.findStatusById.mockResolvedValue(mockStatusRow);
      repo.findEvidenceById.mockResolvedValue({
        ...mockEvidence,
        score: { assessmentId: 'other-assessment' },
      });

      await expect(
        service.removeEvidence('assessment-1', 'evidence-1', admin),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.removeEvidence).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException for ENTREPRENEUR', async () => {
      await expect(
        service.removeEvidence('assessment-1', 'evidence-1', entrepreneur),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('updateNotes', () => {
    it('should update notes and return the assessment', async () => {
      repo.findStatusById.mockResolvedValue(mockStatusRow);
      repo.updateNotes.mockResolvedValue(mockAssessmentRow);
      repo.findDetailById.mockResolvedValue(mockAssessmentDetail);

      const result = await service.updateNotes('assessment-1', { notes: 'บันทึกใหม่' }, admin);

      expect(repo.updateNotes).toHaveBeenCalledWith('assessment-1', 'บันทึกใหม่');
      expect(result.id).toBe('assessment-1');
    });

    it('should throw ForbiddenException for ENTREPRENEUR', async () => {
      await expect(
        service.updateNotes('assessment-1', { notes: 'x' }, entrepreneur),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should throw BadRequestException when an ASSESSOR edits notes on a submitted assessment', async () => {
      repo.findStatusById.mockResolvedValue({
        ...mockStatusRow,
        status: AssessmentStatus.SUBMITTED,
      });

      await expect(
        service.updateNotes('assessment-1', { notes: 'x' }, assessor),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.updateNotes).not.toHaveBeenCalled();
    });

    it('should let an ADMIN edit notes on a submitted assessment', async () => {
      repo.findStatusById.mockResolvedValue({
        ...mockStatusRow,
        status: AssessmentStatus.SUBMITTED,
      });
      repo.findDetailById.mockResolvedValue({
        ...mockAssessmentDetail,
        status: AssessmentStatus.SUBMITTED,
      });

      await service.updateNotes('assessment-1', { notes: 'แก้ไขภายหลัง' }, admin);

      expect(repo.updateNotes).toHaveBeenCalledWith('assessment-1', 'แก้ไขภายหลัง');
      // Notes carry no score — nothing to re-freeze.
      expect(repo.rescoreAssessment).not.toHaveBeenCalled();
    });
  });

  describe('saveDraft', () => {
    it('should mark the assessment in progress and return it', async () => {
      repo.findStatusById.mockResolvedValue(mockStatusRow);
      repo.markInProgress.mockResolvedValue(mockAssessmentRow);
      repo.findDetailById.mockResolvedValue(mockAssessmentDetail);

      const result = await service.saveDraft('assessment-1', admin);

      expect(repo.markInProgress).toHaveBeenCalledWith('assessment-1', admin.sub);
      expect(result.id).toBe('assessment-1');
    });

    it('should throw ForbiddenException for ENTREPRENEUR', async () => {
      await expect(service.saveDraft('assessment-1', entrepreneur)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when the assessment is already submitted', async () => {
      repo.findStatusById.mockResolvedValue({
        ...mockStatusRow,
        status: AssessmentStatus.SUBMITTED,
      });

      await expect(service.saveDraft('assessment-1', admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when the assessment does not exist', async () => {
      repo.findStatusById.mockResolvedValue(null);

      await expect(service.saveDraft('assessment-1', admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('submit', () => {
    it('should compute the weighted total score and submit with no red flags', async () => {
      repo.findDetailById.mockResolvedValue(mockAssessmentDetail);
      repo.submitAssessment.mockResolvedValue({
        ...mockAssessmentDetail,
        status: AssessmentStatus.SUBMITTED,
        totalScore: 75,
        submittedAt: new Date(),
      });

      const result = await service.submit('assessment-1', admin);

      expect(repo.submitAssessment).toHaveBeenCalledWith(
        'assessment-1',
        'store-1',
        Round.T0,
        75,
        [],
      );
      expect(result.status).toBe(AssessmentStatus.SUBMITTED);
      expect(result.zone).toBe('Growth Zone');
    });

    it('should throw NotFoundException when the assessment does not exist', async () => {
      repo.findDetailById.mockResolvedValue(null);

      await expect(service.submit('missing', admin)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should throw BadRequestException when already submitted', async () => {
      repo.findDetailById.mockResolvedValue({
        ...mockAssessmentDetail,
        status: AssessmentStatus.SUBMITTED,
      });

      await expect(service.submit('assessment-1', admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    // Re-submitting an approved round would write its red flags a second time.
    it('should throw BadRequestException when already approved', async () => {
      repo.findDetailById.mockResolvedValue({
        ...mockAssessmentDetail,
        status: AssessmentStatus.APPROVED,
      });

      await expect(service.submit('assessment-1', admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.submitAssessment).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when not all 50 questions are scored', async () => {
      repo.findDetailById.mockResolvedValue({
        ...mockAssessmentDetail,
        scores: mockAssessmentDetail.scores.slice(0, 10),
      });

      await expect(service.submit('assessment-1', admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.submitAssessment).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException for ENTREPRENEUR', async () => {
      await expect(service.submit('assessment-1', entrepreneur)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when the prior round has not been submitted', async () => {
      repo.findDetailById.mockResolvedValue({ ...mockAssessmentDetail, round: Round.T1 });
      repo.findByStoreAndRound.mockResolvedValue(null); // no T0 assessment

      await expect(service.submit('assessment-1', admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.submitAssessment).not.toHaveBeenCalled();
    });
  });
});
