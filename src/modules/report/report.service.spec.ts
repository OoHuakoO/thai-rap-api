import { Test, type TestingModule } from '@nestjs/testing';
import { AssessmentStatus, RedFlagType, Role, Round, Severity } from '@prisma/client';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { ForbiddenException, NotFoundException } from '@common/exceptions/app.exception';
import { ERROR_CODES } from '@constants/index';
import { DimensionService } from '@modules/assessment/dimension.service';
import { StoreService } from '@modules/store/store.service';
import { ReportRepository, type RoundReportRow } from './report.repository';
import { RECENT_REPORT_LIMIT, ReportService } from './report.service';

const admin: JwtPayload = { sub: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
const owner: JwtPayload = { sub: 'owner-1', email: 'owner@example.com', role: Role.ENTREPRENEUR };
const viewer: JwtPayload = { sub: 'viewer-1', email: 'viewer@example.com', role: Role.VIEWER };
const judge: JwtPayload = { sub: 'judge-1', email: 'judge@example.com', role: Role.JUDGE };

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
            findRecentSubmitted: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: DimensionService,
          useValue: {
            findAllDimensions: jest.fn().mockResolvedValue(dimensions),
            findDimensionInfos: jest.fn().mockResolvedValue(dimensions),
            findAllQuestions: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: StoreService,
          useValue: { findAccessible: jest.fn().mockResolvedValue(store) },
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
      expect(result.dimensions).toEqual([
        { dimensionId: 1, dimensionName: 'ความปลอดภัยอาหาร', weight: 60, scorePct: 75 },
        { dimensionId: 2, dimensionName: 'การเงิน', weight: 40, scorePct: 12.5 },
      ]);
      expect(result.redFlags[0]).toMatchObject({ type: RedFlagType.FINANCIAL, resolved: false });
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

      expect(repository.findRecentSubmitted).toHaveBeenCalledWith(RECENT_REPORT_LIMIT, owner.sub);
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
