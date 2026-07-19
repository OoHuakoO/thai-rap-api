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
import { DimensionRepository } from './dimension.repository';
import type { CreateAssessmentDto } from './dto/create-assessment.dto';
import type { UpdateScoreDto } from './dto/update-score.dto';
import type { BulkScoreDto } from './dto/bulk-score.dto';

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
    scores: mockQuestions.map((q) => ({ questionId: q.id, rawScore: 3 })),
  };
}

describe('AssessmentService', () => {
  let service: AssessmentService;
  let repo: jest.Mocked<AssessmentRepository>;
  let dimensionRepo: jest.Mocked<DimensionRepository>;
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
            findDetailById: jest.fn(),
            findStatusById: jest.fn(),
            create: jest.fn(),
            remove: jest.fn(),
            updateNotes: jest.fn(),
            reassignAssessor: jest.fn(),
            upsertScore: jest.fn(),
            bulkUpsertScores: jest.fn(),
            countScored: jest.fn(),
            findScore: jest.fn(),
            createEvidence: jest.fn(),
            findEvidenceByScoreId: jest.fn().mockResolvedValue([]),
            findEvidenceById: jest.fn(),
            removeEvidence: jest.fn(),
            submitAssessment: jest.fn(),
          },
        },
        {
          provide: DimensionRepository,
          useValue: {
            findAllDimensions: jest.fn().mockResolvedValue(mockDimensions),
            findAllQuestions: jest.fn().mockResolvedValue(mockQuestions),
            findQuestionById: jest.fn(),
          },
        },
        {
          provide: StoreService,
          useValue: { findOne: jest.fn().mockResolvedValue(mockStoreResult) },
        },
      ],
    }).compile();

    service = module.get(AssessmentService);
    repo = module.get(AssessmentRepository);
    dimensionRepo = module.get(DimensionRepository);
    storeService = module.get(StoreService);
  });

  describe('findAll', () => {
    it('should return paginated assessments', async () => {
      repo.findAll.mockResolvedValue([mockAssessmentRow]);
      repo.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  // findOne has no RBAC check of its own — it's a plain read, so there is no
  // forbidden case to cover here.
  describe('findOne', () => {
    it('should return assessment detail with all 50 questions mapped', async () => {
      repo.findDetailById.mockResolvedValue(mockAssessmentDetail);

      const result = await service.findOne('assessment-1');

      expect(result.id).toBe('assessment-1');
      expect(result.questions).toHaveLength(50);
      expect(result.questions[0].rawScore).toBe(3);
    });

    it('should throw NotFoundException when the assessment does not exist', async () => {
      repo.findDetailById.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // RBAC for getRank/getHistory is delegated entirely to storeService.findOne
  // (ENTREPRENEUR can only see their own store) — no separate forbidden/not-found
  // branch inside AssessmentService itself, so we only assert the pass-through.
  describe('getRank', () => {
    it('should compute overall rank, province rank, and dimension averages', async () => {
      repo.findSubmittedForRanking.mockResolvedValue([
        buildRankingAssessment('store-3', 400, 'เชียงใหม่'),
        buildRankingAssessment('store-1', 300, 'ชลบุรี'),
        buildRankingAssessment('store-2', 250, 'ชลบุรี'),
      ]);

      const result = await service.getRank('store-1', Round.T0, admin);

      expect(storeService.findOne).toHaveBeenCalledWith('store-1', admin);
      expect(result.overallRank).toBe(2);
      expect(result.overallTotal).toBe(3);
      expect(result.provinceRank).toBe(1);
      expect(result.provinceTotal).toBe(2);
      expect(result.dimensionAverages).toEqual([
        { dimensionId: 1, avgPct: 75 },
        { dimensionId: 2, avgPct: 75 },
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
      storeService.findOne.mockRejectedValue(
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

      expect(storeService.findOne).toHaveBeenCalledWith('store-1', admin);
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
      dimensionRepo.findQuestionById.mockResolvedValue(mockQuestions[0]);
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
      dimensionRepo.findQuestionById.mockResolvedValue(null);

      await expect(service.updateScore('assessment-1', 9999, dto, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for ENTREPRENEUR', async () => {
      await expect(
        service.updateScore('assessment-1', 1, dto, entrepreneur),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should throw BadRequestException when the assessment is already submitted', async () => {
      repo.findStatusById.mockResolvedValue({
        ...mockStatusRow,
        status: AssessmentStatus.SUBMITTED,
      });

      await expect(service.updateScore('assessment-1', 1, dto, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
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

  describe('bulkUpdateScores', () => {
    const dto: BulkScoreDto = {
      scores: [
        { questionId: 1, rawScore: 3 },
        { questionId: 2, rawScore: 4 },
      ],
    };

    it('should bulk upsert scores and return progress', async () => {
      repo.findStatusById.mockResolvedValue(mockStatusRow);
      repo.bulkUpsertScores.mockResolvedValue(undefined);
      repo.countScored.mockResolvedValue(2);

      const result = await service.bulkUpdateScores('assessment-1', dto, admin);

      expect(repo.bulkUpsertScores).toHaveBeenCalledWith('assessment-1', admin.sub, dto.scores);
      expect(result).toEqual({ scored: 2, total: 50 });
    });

    it('should throw NotFoundException when a questionId does not exist', async () => {
      repo.findStatusById.mockResolvedValue(mockStatusRow);
      const badDto: BulkScoreDto = { scores: [{ questionId: 9999, rawScore: 3 }] };

      await expect(service.bulkUpdateScores('assessment-1', badDto, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.bulkUpsertScores).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException for ENTREPRENEUR', async () => {
      await expect(
        service.bulkUpdateScores('assessment-1', dto, entrepreneur),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should throw BadRequestException when the assessment is already submitted', async () => {
      repo.findStatusById.mockResolvedValue({
        ...mockStatusRow,
        status: AssessmentStatus.SUBMITTED,
      });

      await expect(service.bulkUpdateScores('assessment-1', dto, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.bulkUpsertScores).not.toHaveBeenCalled();
    });
  });

  describe('getProgress', () => {
    it('should return scored/total counts', async () => {
      repo.findStatusById.mockResolvedValue(mockStatusRow);
      repo.countScored.mockResolvedValue(12);

      const result = await service.getProgress('assessment-1');

      expect(result).toEqual({ scored: 12, total: 50 });
    });

    it('should throw NotFoundException when the assessment does not exist', async () => {
      repo.findStatusById.mockResolvedValue(null);

      await expect(service.getProgress('missing')).rejects.toBeInstanceOf(NotFoundException);
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

    it('should throw BadRequestException when the assessment is already submitted', async () => {
      repo.findStatusById.mockResolvedValue({
        ...mockStatusRow,
        status: AssessmentStatus.SUBMITTED,
      });

      await expect(
        service.updateNotes('assessment-1', { notes: 'x' }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
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

  describe('remove', () => {
    it('should delete a draft assessment', async () => {
      repo.findDetailById.mockResolvedValue(mockAssessmentDetail);
      repo.remove.mockResolvedValue(mockAssessmentRow);

      await service.remove('assessment-1', admin);

      expect(repo.remove).toHaveBeenCalledWith('assessment-1');
    });

    it('should throw NotFoundException when the assessment does not exist', async () => {
      repo.findDetailById.mockResolvedValue(null);

      await expect(service.remove('missing', admin)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should throw ForbiddenException for ENTREPRENEUR', async () => {
      await expect(service.remove('assessment-1', entrepreneur)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when the assessment is not a draft', async () => {
      repo.findDetailById.mockResolvedValue({
        ...mockAssessmentDetail,
        status: AssessmentStatus.SUBMITTED,
      });

      await expect(service.remove('assessment-1', admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.remove).not.toHaveBeenCalled();
    });
  });
});
