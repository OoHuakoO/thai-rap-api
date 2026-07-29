import { Writable } from 'node:stream';
import { Test, type TestingModule } from '@nestjs/testing';
import { AssessmentStatus, RedFlagType, Role, Round, Severity } from '@prisma/client';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { ForbiddenException, NotFoundException } from '@common/exceptions/app.exception';
import { ERROR_CODES } from '@constants/index';
import { DimensionService } from '@modules/assessment/dimension.service';
import { StoreService } from '@modules/store/store.service';
import { streamRoundMatrixWorkbook } from './report-excel.util';
import { streamRoundMatrixPdf } from './report-pdf.util';
import {
  ReportRepository,
  type RoundMatrixRowData,
  type RoundReportRow,
} from './report.repository';
import { RECENT_REPORT_LIMIT, ReportService } from './report.service';

const admin: JwtPayload = { sub: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
const owner: JwtPayload = { sub: 'owner-1', email: 'owner@example.com', role: Role.ENTREPRENEUR };
const viewer: JwtPayload = { sub: 'viewer-1', email: 'viewer@example.com', role: Role.VIEWER };
const judge: JwtPayload = { sub: 'judge-1', email: 'judge@example.com', role: Role.JUDGE };
const superAdmin: JwtPayload = { sub: 'root-1', email: 'root@example.com', role: Role.SUPER_ADMIN };
const assessor: JwtPayload = { sub: 'ass-1', email: 'assessor@example.com', role: Role.ASSESSOR };
const mentor: JwtPayload = { sub: 'men-1', email: 'mentor@example.com', role: Role.MENTOR };

const store = {
  id: 'store-1',
  name: 'ครัวริมธาร',
  province: 'จันทบุรี',
  storeType: 'อาหารไทย',
  ownerName: 'นางสาวศิริวรรณ',
};

// Two dimensions, 2 questions each: a perfect 4/4 on both questions is 100%.
// maxTotal is what the scoring util divides by — 2 questions worth 4 each.
const dimensions = [
  {
    id: 1,
    name: 'ความปลอดภัยอาหาร',
    nameEn: 'Food Safety',
    weight: 60,
    questionCount: 2,
    maxTotal: 8,
  },
  { id: 2, name: 'การเงิน', nameEn: 'Financial', weight: 40, questionCount: 2, maxTotal: 8 },
];

const questions = [
  { id: 1, dimensionId: 1, questionNo: 1, questionText: 'ล้างมือก่อนปรุง', maxScore: 4 },
  { id: 2, dimensionId: 1, questionNo: 2, questionText: 'เก็บวัตถุดิบถูกอุณหภูมิ', maxScore: 4 },
  { id: 3, dimensionId: 2, questionNo: 3, questionText: 'บันทึกรายรับรายจ่าย', maxScore: 4 },
  { id: 4, dimensionId: 2, questionNo: 4, questionText: 'รู้ต้นทุนต่อจาน', maxScore: 4 },
];

function roundRow(overrides: Partial<RoundReportRow> = {}): RoundReportRow {
  return {
    id: 'assess-1',
    round: Round.T0,
    status: AssessmentStatus.SUBMITTED,
    totalScore: 62.105,
    notes: 'บันทึกผู้ประเมิน',
    submittedAt: new Date('2026-05-20T00:00:00.000Z'),
    updatedAt: new Date('2026-05-20T00:00:00.000Z'),
    assessor: { name: 'นายสมชาย' },
    scores: [
      { rawScore: 4, question: { questionNo: 1, dimensionId: 1 } },
      { rawScore: 2, question: { questionNo: 2, dimensionId: 1 } },
      { rawScore: 1, question: { questionNo: 3, dimensionId: 2 } },
      { rawScore: null, question: { questionNo: 4, dimensionId: 2 } },
    ],
    redFlags: [
      {
        type: RedFlagType.FINANCIAL,
        severity: Severity.CRITICAL,
        triggerQuestions: [3],
        resolved: false,
      },
    ],
    ...overrides,
  } as RoundReportRow;
}

function matrixRow(overrides: Partial<RoundMatrixRowData> = {}): RoundMatrixRowData {
  return {
    storeId: 'store-1',
    round: Round.T0,
    totalScore: 62.5,
    submittedAt: new Date('2026-05-20T00:00:00.000Z'),
    store: { code: 'RAP69-001', name: 'ครัวริมธาร', province: 'จันทบุรี' },
    scores: [
      { rawScore: 4, question: { dimensionId: 1 } },
      { rawScore: 2, question: { dimensionId: 1 } },
      { rawScore: 1, question: { dimensionId: 2 } },
      { rawScore: null, question: { dimensionId: 2 } },
    ],
    redFlags: [{ resolved: false }, { resolved: true }],
    ...overrides,
  } as RoundMatrixRowData;
}

async function collect(write: (out: Writable) => Promise<void>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const out = new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(Buffer.from(chunk));
      done();
    },
  });
  await write(out);
  return Buffer.concat(chunks);
}

describe('ReportService', () => {
  let service: ReportService;
  let repository: jest.Mocked<ReportRepository>;
  let storeService: jest.Mocked<StoreService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportService,
        {
          provide: ReportRepository,
          useValue: {
            findSubmittedRound: jest.fn().mockResolvedValue(null),
            findSubmittedRounds: jest.fn().mockResolvedValue([]),
            findSubmittedByRound: jest.fn().mockResolvedValue([]),
            countSubmittedByRound: jest.fn().mockResolvedValue(0),
            sumRawScoresByQuestion: jest.fn().mockResolvedValue([]),
            findRecentSubmitted: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: DimensionService,
          useValue: {
            findAllDimensions: jest.fn().mockResolvedValue(dimensions),
            findDimensionInfos: jest.fn().mockResolvedValue(dimensions),
            findAllQuestions: jest.fn().mockResolvedValue(questions),
            findScoringContext: jest.fn().mockResolvedValue({ dimensions, questions }),
          },
        },
        {
          provide: StoreService,
          useValue: {
            findAccessible: jest.fn().mockResolvedValue(store),
            findAccessibleStoreIds: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<ReportService>(ReportService);
    repository = module.get(ReportRepository);
    storeService = module.get(StoreService);
  });

  describe('getRoundReport', () => {
    it('should weight each dimension and label the zone', async () => {
      repository.findSubmittedRound.mockResolvedValue(roundRow());

      const result = await service.getRoundReport('store-1', Round.T0, admin);

      expect(result.store.name).toBe('ครัวริมธาร');
      expect(result.totalScore).toBe(62.11);
      expect(result.zone).toBe('Improve Zone');
      // (4+2)/8 = 75%, (1+0)/8 = 12.5%
      expect(result.dimensions.map((d) => [d.dimensionId, d.scorePct, d.weightedScore])).toEqual([
        [1, 75, 45],
        [2, 12.5, 5],
      ]);
      expect(result.redFlags[0]).toMatchObject({ type: RedFlagType.FINANCIAL, resolved: false });
    });

    it('should report the raw score, its percentage and how complete the round is', async () => {
      repository.findSubmittedRound.mockResolvedValue(roundRow());

      const result = await service.getRoundReport('store-1', Round.T0, admin);

      // 4 + 2 + 1 out of 4 questions worth 4 each; Q4 was left unanswered.
      expect(result.rawScore).toBe(7);
      expect(result.maxScore).toBe(16);
      expect(result.rawScorePct).toBe(43.75);
      expect(result.completionPct).toBe(75);
    });

    it('should list every question of a dimension, unanswered ones included', async () => {
      repository.findSubmittedRound.mockResolvedValue(roundRow());

      const result = await service.getRoundReport('store-1', Round.T0, admin);

      expect(result.dimensions[1].questions).toEqual([
        { questionNo: 3, questionText: 'บันทึกรายรับรายจ่าย', rawScore: 1, maxScore: 4 },
        { questionNo: 4, questionText: 'รู้ต้นทุนต่อจาน', rawScore: null, maxScore: 4 },
      ]);
    });

    it('should throw when the round has no submitted assessment', async () => {
      await expect(service.getRoundReport('store-1', Round.T2, admin)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getRoundReport('store-1', Round.T2, admin)).rejects.toMatchObject({
        code: ERROR_CODES.RPT.NOT_FOUND,
      });
    });

    it('should let the store access check reject a foreign owner', async () => {
      storeService.findAccessible.mockRejectedValue(
        new ForbiddenException(ERROR_CODES.PERM.FORBIDDEN, 'ไม่มีสิทธิ์เข้าถึง'),
      );

      await expect(service.getRoundReport('store-1', Round.T0, owner)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.findSubmittedRound).not.toHaveBeenCalled();
    });

    // A report is a rendering of assessment scores, so it answers to the same
    // allow-list — and a VIEWER is self-registerable, i.e. effectively public.
    it.each([
      ['VIEWER', viewer],
      ['JUDGE', judge],
    ])('should throw ForbiddenException for %s before touching the store', async (_l, user) => {
      await expect(service.getRoundReport('store-1', Round.T0, user)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(storeService.findAccessible).not.toHaveBeenCalled();
      expect(repository.findSubmittedRound).not.toHaveBeenCalled();
    });
  });

  describe('getOverviewReport', () => {
    it('should list each assessed round with its delta against the previous one', async () => {
      repository.findSubmittedRounds.mockResolvedValue([
        roundRow({ round: Round.T0, totalScore: 60 }),
        roundRow({ round: Round.T1, totalScore: 72.5 }),
        roundRow({ round: Round.T3, totalScore: 70 }),
      ]);

      const result = await service.getOverviewReport('store-1', admin);

      expect(result.rounds.map((r) => [r.round, r.totalScore, r.delta])).toEqual([
        [Round.T0, 60, null],
        [Round.T1, 72.5, 12.5],
        [Round.T3, 70, -2.5],
      ]);
      expect(result.rounds[1].zone).toBe('Improve Zone');
    });

    it('should return an empty round list when nothing is submitted', async () => {
      const result = await service.getOverviewReport('store-1', admin);

      expect(result.rounds).toEqual([]);
      expect(result.unresolvedRedFlagCount).toBe(0);
    });

    it('should count unresolved red flags across every round', async () => {
      repository.findSubmittedRounds.mockResolvedValue([
        roundRow({ round: Round.T0 }),
        roundRow({
          round: Round.T1,
          redFlags: [
            {
              type: RedFlagType.LEGAL,
              severity: Severity.CRITICAL,
              triggerQuestions: [13],
              resolved: true,
            },
          ],
        } as Partial<RoundReportRow>),
      ]);

      const result = await service.getOverviewReport('store-1', admin);

      expect(result.unresolvedRedFlagCount).toBe(1);
    });

    it('should track each dimension across the rounds it was scored in', async () => {
      repository.findSubmittedRounds.mockResolvedValue([
        roundRow({ round: Round.T0 }),
        roundRow({ round: Round.T1 }),
      ]);

      const result = await service.getOverviewReport('store-1', admin);

      expect(result.dimensionTrends[0].scoresByRound).toEqual({ T0: 75, T1: 75 });
    });
  });

  describe('getRoundMatrixReport', () => {
    beforeEach(() => {
      repository.countSubmittedByRound.mockResolvedValue(1);
    });

    it('should give every store a row of dimension percentages', async () => {
      repository.findSubmittedByRound.mockResolvedValue([matrixRow()]);

      const result = await service.getRoundMatrixReport(Round.T0, admin);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        storeCode: 'RAP69-001',
        province: 'จันทบุรี',
        rawScore: 7,
        rawScorePct: 43.75,
        completionPct: 75,
        weightedScore: 62.5,
        overallLevel: 'ต้องพัฒนา',
        redFlagCount: 2,
        unresolvedRedFlagCount: 1,
        scoresByDimension: { 1: 75, 2: 12.5 },
      });
    });

    it('should name the lowest dimension as the one to fix first', async () => {
      repository.findSubmittedByRound.mockResolvedValue([matrixRow()]);

      const result = await service.getRoundMatrixReport(Round.T0, admin);

      expect(result.rows[0].criticalDimensionName).toBe('การเงิน');
    });

    // The averages cover the whole round, not the page — they come from a
    // database-side sum of the raw scores, which is the same number as the mean
    // of the stores' percentages because every store is out of the same total.
    it('should average each dimension across the cohort, not the page', async () => {
      repository.countSubmittedByRound.mockResolvedValue(2);
      repository.findSubmittedByRound.mockResolvedValue([matrixRow()]);
      // Two stores: Q1 4+2, Q2 2+0, Q3 1+3, Q4 0+1.
      repository.sumRawScoresByQuestion.mockResolvedValue([
        { questionId: 1, rawScore: 6 },
        { questionId: 2, rawScore: 2 },
        { questionId: 3, rawScore: 4 },
        { questionId: 4, rawScore: 1 },
      ]);

      const result = await service.getRoundMatrixReport(Round.T0, admin, { limit: 1 });

      // dimension 1: (75 + 25) / 2, dimension 2: (12.5 + 50) / 2
      expect(result.rows).toHaveLength(1);
      expect(result.averageByDimension).toEqual({ 1: 50, 2: 31.25 });
      expect(result.averageWeightedScore).toBe(42.5);
    });

    it('should return one page of stores and say how many there are in all', async () => {
      repository.countSubmittedByRound.mockResolvedValue(42);
      repository.findSubmittedByRound.mockResolvedValue([matrixRow()]);

      const result = await service.getRoundMatrixReport(Round.T0, admin, { page: 3, limit: 20 });

      expect(result.meta).toEqual({ page: 3, limit: 20, total: 42, totalPages: 3 });
      expect(repository.findSubmittedByRound).toHaveBeenCalledWith(Round.T0, undefined, {
        skip: 40,
        take: 20,
      });
    });

    // This is the one report that shows a store its neighbours' scores, so it
    // is narrower than the rest of /reports: admin roles only. Reading their own
    // round report still works for every role in ASSESSMENT_READ_ROLES.
    it.each([
      ['ENTREPRENEUR', owner],
      ['ASSESSOR', assessor],
      ['MENTOR', mentor],
      ['VIEWER', viewer],
      ['JUDGE', judge],
    ])('should throw ForbiddenException for %s', async (_l, user) => {
      await expect(service.getRoundMatrixReport(Round.T0, user)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.findSubmittedByRound).not.toHaveBeenCalled();
    });

    it('should let SUPER_ADMIN read it too', async () => {
      repository.findSubmittedByRound.mockResolvedValue([matrixRow()]);

      const result = await service.getRoundMatrixReport(Round.T0, superAdmin);

      expect(result.rows).toHaveLength(1);
    });

    // The gate above is admin-only today, so the scope resolves to null. The
    // narrowing still has to hold: an empty scope reaches no store, not all.
    it('should return no row when the caller reaches no store at all', async () => {
      storeService.findAccessibleStoreIds.mockResolvedValue([]);

      const result = await service.getRoundMatrixReport(Round.T0, admin);

      expect(result.rows).toEqual([]);
      expect(result.averageWeightedScore).toBeNull();
      expect(result.meta.total).toBe(0);
      expect(repository.findSubmittedByRound).not.toHaveBeenCalled();
      expect(repository.countSubmittedByRound).not.toHaveBeenCalled();
    });
  });

  describe('openRoundMatrixExport', () => {
    it('should cover every store in the round, not the page the table is on', async () => {
      repository.countSubmittedByRound.mockResolvedValue(3);
      repository.findSubmittedByRound.mockResolvedValue([
        matrixRow(),
        matrixRow({
          storeId: 'store-2',
          store: { code: 'RAP69-002', name: 'ร้านสอง', province: 'ระยอง' },
        } as Partial<RoundMatrixRowData>),
        matrixRow({
          storeId: 'store-3',
          store: { code: 'RAP69-003', name: 'ร้านสาม', province: 'ตราด' },
        } as Partial<RoundMatrixRowData>),
      ]);

      const source = await service.openRoundMatrixExport(Round.T0, admin);
      const codes: string[] = [];
      for await (const row of source.rows) codes.push(row.storeCode);

      expect(source.storeCount).toBe(3);
      expect(codes).toEqual(['RAP69-001', 'RAP69-002', 'RAP69-003']);
      // One batch, because it came back shorter than the batch size.
      expect(repository.findSubmittedByRound).toHaveBeenCalledTimes(1);
    });

    it('should refuse a non-admin before opening anything', async () => {
      await expect(service.openRoundMatrixExport(Round.T0, owner)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.countSubmittedByRound).not.toHaveBeenCalled();
    });
  });

  describe('exports', () => {
    it('should build an xlsx (zip) buffer for a round', async () => {
      repository.findSubmittedRound.mockResolvedValue(roundRow());

      const file = await service.exportRoundReport('store-1', Round.T0, 'xlsx', admin);

      expect(file.subarray(0, 2).toString()).toBe('PK');
    });

    it('should build a pdf buffer for a round', async () => {
      repository.findSubmittedRound.mockResolvedValue(roundRow());

      const file = await service.exportRoundReport('store-1', Round.T0, 'pdf', admin);

      expect(file.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('should build a pdf buffer for the overview', async () => {
      repository.findSubmittedRounds.mockResolvedValue([roundRow()]);

      const file = await service.exportOverviewReport('store-1', 'pdf', admin);

      expect(file.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('should build an xlsx buffer for the overview', async () => {
      repository.findSubmittedRounds.mockResolvedValue([roundRow()]);

      const file = await service.exportOverviewReport('store-1', 'xlsx', admin);

      expect(file.subarray(0, 2).toString()).toBe('PK');
    });

    it('should stream an xlsx for the all-stores matrix', async () => {
      repository.countSubmittedByRound.mockResolvedValue(1);
      repository.findSubmittedByRound.mockResolvedValue([matrixRow()]);
      const source = await service.openRoundMatrixExport(Round.T0, admin);

      const file = await collect((out) => streamRoundMatrixWorkbook(source, out));

      expect(file.subarray(0, 2).toString()).toBe('PK');
    });

    it('should stream a pdf for the all-stores matrix', async () => {
      repository.countSubmittedByRound.mockResolvedValue(1);
      repository.findSubmittedByRound.mockResolvedValue([matrixRow()]);
      const source = await service.openRoundMatrixExport(Round.T0, admin);

      const file = await collect((out) => streamRoundMatrixPdf(source, out));

      expect(file.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('should still produce a pdf when no store submitted the round', async () => {
      const source = await service.openRoundMatrixExport(Round.T0, admin);

      const file = await collect((out) => streamRoundMatrixPdf(source, out));

      expect(file.subarray(0, 4).toString()).toBe('%PDF');
    });
  });

  describe('listAvailableReports', () => {
    const submittedAt = new Date('2026-07-29T02:00:00.000Z');

    function submittedRow(round: Round, storeId = 'store-1', at = submittedAt) {
      return { storeId, round, submittedAt: at, store: { name: 'ครัวริมธาร' } };
    }

    it('should offer a round report and an overview report in both formats', async () => {
      repository.findRecentSubmitted.mockResolvedValue([submittedRow(Round.T1)]);

      const result = await service.listAvailableReports(admin);

      expect(result).toEqual([
        {
          id: 'store-1:T1:xlsx',
          name: 'รายงานผลการประเมิน T1 - ครัวริมธาร',
          format: 'XLSX',
          status: 'DONE',
          createdAt: submittedAt,
          downloadPath: '/reports/stores/store-1/rounds/T1/export?format=xlsx',
        },
        {
          id: 'store-1:T1:pdf',
          name: 'รายงานผลการประเมิน T1 - ครัวริมธาร',
          format: 'PDF',
          status: 'DONE',
          createdAt: submittedAt,
          downloadPath: '/reports/stores/store-1/rounds/T1/export?format=pdf',
        },
        {
          id: 'store-1:overview:xlsx',
          name: 'รายงานสรุปผลทุกรอบ - ครัวริมธาร',
          format: 'XLSX',
          status: 'DONE',
          createdAt: submittedAt,
          downloadPath: '/reports/stores/store-1/overview/export?format=xlsx',
        },
        {
          id: 'store-1:overview:pdf',
          name: 'รายงานสรุปผลทุกรอบ - ครัวริมธาร',
          format: 'PDF',
          status: 'DONE',
          createdAt: submittedAt,
          downloadPath: '/reports/stores/store-1/overview/export?format=pdf',
        },
      ]);
    });

    it('should list a store overview once no matter how many rounds it submitted', async () => {
      const older = new Date('2026-07-01T00:00:00.000Z');
      repository.findRecentSubmitted.mockResolvedValue([
        submittedRow(Round.T1),
        submittedRow(Round.T0, 'store-1', older),
      ]);

      const result = await service.listAvailableReports(admin);
      const overviews = result.filter((report) => report.id.includes(':overview:'));

      expect(overviews).toHaveLength(2);
      // Dated by the newest round it covers, not the oldest.
      expect(overviews.every((report) => report.createdAt === submittedAt)).toBe(true);
    });

    it('should read every store for staff', async () => {
      await service.listAvailableReports(admin);

      expect(repository.findRecentSubmitted).toHaveBeenCalledWith(RECENT_REPORT_LIMIT, undefined);
    });

    it('should narrow an ENTREPRENEUR to the stores it owns', async () => {
      await service.listAvailableReports(owner);

      expect(repository.findRecentSubmitted).toHaveBeenCalledWith(RECENT_REPORT_LIMIT, {
        ownerId: owner.sub,
      });
    });

    it('should narrow an ASSESSOR and a MENTOR to their assignment list', async () => {
      await service.listAvailableReports(assessor);
      expect(repository.findRecentSubmitted).toHaveBeenCalledWith(RECENT_REPORT_LIMIT, {
        assignedToId: assessor.sub,
      });

      await service.listAvailableReports(mentor);
      expect(repository.findRecentSubmitted).toHaveBeenCalledWith(RECENT_REPORT_LIMIT, {
        assignedToId: mentor.sub,
      });
    });

    it('should offer nothing to a role that cannot read assessments', async () => {
      await expect(service.listAvailableReports(viewer)).resolves.toEqual([]);
      await expect(service.listAvailableReports(judge)).resolves.toEqual([]);
      expect(repository.findRecentSubmitted).not.toHaveBeenCalled();
    });

    it('should cap the list at the dashboard card limit', async () => {
      repository.findRecentSubmitted.mockResolvedValue([
        submittedRow(Round.T0, 'store-1'),
        submittedRow(Round.T0, 'store-2'),
        submittedRow(Round.T0, 'store-3'),
      ]);

      const result = await service.listAvailableReports(admin);

      expect(result).toHaveLength(RECENT_REPORT_LIMIT);
    });
  });
});
