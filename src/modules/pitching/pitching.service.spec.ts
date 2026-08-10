import { Test, type TestingModule } from '@nestjs/testing';
import {
  PitchingRecommendation,
  PitchingRound,
  PitchingStatus,
  Role,
  type Prisma,
} from '@prisma/client';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@common/exceptions/app.exception';
import { StoreService } from '@modules/store/store.service';
import {
  PitchingRepository,
  type PitchingCriterionRow,
  type PitchingRow,
} from './pitching.repository';
import { PitchingService } from './pitching.service';

const judge: JwtPayload = { sub: 'judge-1', email: 'judge@example.com', role: Role.JUDGE };
const otherJudge: JwtPayload = { sub: 'judge-2', email: 'judge2@example.com', role: Role.JUDGE };
const admin: JwtPayload = { sub: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
const entrepreneur: JwtPayload = {
  sub: 'owner-1',
  email: 'owner@example.com',
  role: Role.ENTREPRENEUR,
};

function criterion(overrides: Partial<PitchingCriterionRow> = {}): PitchingCriterionRow {
  return {
    id: 101,
    round: PitchingRound.PITCH_DECK,
    code: '1',
    section: null,
    title: 'แนะนำร้านและข้อมูลพื้นฐาน',
    guideline: 'บอกได้ชัดเจนว่าร้านคือใคร',
    maxScore: 5,
    sortOrder: 1,
    ...overrides,
  };
}

function pitchingRow(overrides: Partial<PitchingRow> = {}): PitchingRow {
  return {
    id: 'pitch-1',
    storeId: 'store-1',
    round: PitchingRound.PITCH_DECK,
    judgeId: judge.sub,
    status: PitchingStatus.DRAFT,
    totalScore: null,
    prototypeProduct: null,
    scoreCardTotal: null,
    participationPct: null,
    evidenceChecked: [] as unknown as Prisma.JsonValue,
    comments: {} as unknown as Prisma.JsonValue,
    recommendation: null,
    recommendationReason: null,
    noConflictOfInterest: false,
    evaluatedAt: null,
    createdAt: new Date('2026-05-20T00:00:00.000Z'),
    updatedAt: new Date('2026-05-20T00:00:00.000Z'),
    submittedAt: null,
    store: {
      id: 'store-1',
      code: 'RAP69-001',
      name: 'หมึกสดริมเล',
      province: 'จันทบุรี',
      coverUrl: null,
    },
    judge: { id: judge.sub, name: 'ดร.กฤษฎา' },
    scores: [],
    ...overrides,
  };
}

function scoredRow(score: number, overrides: Partial<PitchingRow> = {}): PitchingRow {
  return pitchingRow({
    scores: [{ criterionId: 101, score, note: null, criterion: criterion() }],
    ...overrides,
  });
}

describe('PitchingService', () => {
  let service: PitchingService;
  let repository: jest.Mocked<PitchingRepository>;
  let storeService: jest.Mocked<StoreService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PitchingService,
        {
          provide: PitchingRepository,
          useValue: {
            findCriteria: jest.fn().mockResolvedValue([criterion()]),
            findCriterionById: jest.fn().mockResolvedValue(criterion()),
            findById: jest.fn().mockResolvedValue(null),
            findByStoreRoundJudge: jest.fn().mockResolvedValue(null),
            findAll: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
            findSubmittedByRound: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockResolvedValue(pitchingRow()),
            update: jest.fn().mockResolvedValue(pitchingRow()),
            upsertScore: jest.fn().mockResolvedValue(pitchingRow()),
            submit: jest.fn().mockResolvedValue(pitchingRow()),
          },
        },
        {
          provide: StoreService,
          useValue: {
            findAccessible: jest.fn().mockResolvedValue({
              id: 'store-1',
              code: 'RAP69-001',
              name: 'หมึกสดริมเล',
              province: 'จันทบุรี',
            }),
            findAccessibleStoreIds: jest.fn().mockResolvedValue(null),
            updateStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PitchingService>(PitchingService);
    repository = module.get(PitchingRepository);
    storeService = module.get(StoreService);
  });

  describe('read access', () => {
    it('lets a judge list forms', async () => {
      await expect(service.findAll({}, judge)).resolves.toMatchObject({ items: [] });
    });

    // The panel and the people running it, nobody else — a judge's comments are
    // committee material about a store that has not heard the outcome.
    it.each([
      ['ENTREPRENEUR', entrepreneur],
      ['ASSESSOR', { sub: 'a-1', email: 'a@example.com', role: Role.ASSESSOR }],
      ['MENTOR', { sub: 'm-1', email: 'm@example.com', role: Role.MENTOR }],
      ['VIEWER', { sub: 'v-1', email: 'v@example.com', role: Role.VIEWER }],
    ])('refuses %s, which is outside PITCHING_READ_ROLES', async (_label, caller) => {
      await expect(service.findAll({}, caller as JwtPayload)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('404s an unknown form', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.findOne('missing', judge)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('opens a draft for the calling judge', async () => {
      const result = await service.create(
        { storeId: 'store-1', round: PitchingRound.PITCH_DECK },
        judge,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ judge: { connect: { id: judge.sub } } }),
      );
      expect(result.status).toBe(PitchingStatus.DRAFT);
    });

    // A brand-new form has no PitchingScore rows at all, so the criteria come
    // from the round's master list — otherwise the judge opens an empty form.
    it('returns every criterion of the round, unscored', async () => {
      const result = await service.create(
        { storeId: 'store-1', round: PitchingRound.PITCH_DECK },
        judge,
      );

      expect(result.criteria).toEqual([expect.objectContaining({ id: 101, score: null })]);
    });

    it('refuses a role outside PITCHING_WRITE_ROLES', async () => {
      const mentor: JwtPayload = { sub: 'm-1', email: 'm@example.com', role: Role.MENTOR };
      await expect(
        service.create({ storeId: 'store-1', round: PitchingRound.PITCH_DECK }, mentor),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('conflicts when the judge already has a form for that store and round', async () => {
      repository.findByStoreRoundJudge.mockResolvedValue(pitchingRow());
      await expect(
        service.create({ storeId: 'store-1', round: PitchingRound.PITCH_DECK }, judge),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('propagates the store 403 for a store the caller may not reach', async () => {
      storeService.findAccessible.mockRejectedValue(new ForbiddenException('PERM_001', 'no'));
      await expect(
        service.create({ storeId: 'store-9', round: PitchingRound.PITCH_DECK }, judge),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('update', () => {
    beforeEach(() => repository.findById.mockResolvedValue(pitchingRow()));

    it('rejects a comment key that is not on this round’s form', async () => {
      await expect(
        service.update('pitch-1', { comments: { madeUpKey: 'x' } }, judge),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an evidence key on the pitch deck form, which has no checklist', async () => {
      await expect(
        service.update('pitch-1', { evidenceChecked: ['SCORE_CARD'] }, judge),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects MINIMUM_NOT_MET on the pitch deck form', async () => {
      await expect(
        service.update(
          'pitch-1',
          { recommendation: PitchingRecommendation.MINIMUM_NOT_MET },
          judge,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts MINIMUM_NOT_MET on the acceleration form', async () => {
      repository.findById.mockResolvedValue(pitchingRow({ round: PitchingRound.ACCELERATION }));
      await service.update(
        'pitch-1',
        { recommendation: PitchingRecommendation.MINIMUM_NOT_MET },
        judge,
      );
      expect(repository.update).toHaveBeenCalled();
    });

    it('refuses another judge’s form', async () => {
      await expect(
        service.update('pitch-1', { recommendationReason: 'x' }, otherJudge),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets an admin correct a judge’s draft', async () => {
      await service.update('pitch-1', { recommendationReason: 'แก้โดย admin' }, admin);
      expect(repository.update).toHaveBeenCalled();
    });

    it('still edits a submitted form', async () => {
      repository.findById.mockResolvedValue(
        pitchingRow({ status: PitchingStatus.SUBMITTED, totalScore: 83 }),
      );
      await service.update('pitch-1', { recommendationReason: 'x' }, judge);
      expect(repository.update).toHaveBeenCalled();
    });
  });

  describe('updateScore', () => {
    beforeEach(() => repository.findById.mockResolvedValue(pitchingRow()));

    it('stores a score inside the criterion’s own range', async () => {
      await service.updateScore('pitch-1', 101, { score: 4 }, judge);
      expect(repository.upsertScore).toHaveBeenCalledWith('pitch-1', 101, {
        score: 4,
        note: undefined,
      });
    });

    it('rejects a score above the criterion maximum', async () => {
      await expect(service.updateScore('pitch-1', 101, { score: 6 }, judge)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('re-freezes the total when the form was already submitted', async () => {
      repository.findById.mockResolvedValue(pitchingRow({ status: PitchingStatus.SUBMITTED }));
      repository.upsertScore.mockResolvedValue(
        scoredRow(3, { status: PitchingStatus.SUBMITTED, totalScore: 5 }),
      );

      await service.updateScore('pitch-1', 101, { score: 3 }, judge);

      expect(repository.update).toHaveBeenCalledWith('pitch-1', { totalScore: 3 });
    });

    it('leaves a draft total unfrozen', async () => {
      repository.upsertScore.mockResolvedValue(scoredRow(3));

      await service.updateScore('pitch-1', 101, { score: 3 }, judge);

      expect(repository.update).not.toHaveBeenCalled();
    });

    // Only the acceleration form prints a หลักฐาน/ข้อสังเกต column per criterion.
    it('rejects a per-criterion note on the pitch deck form', async () => {
      await expect(
        service.updateScore('pitch-1', 101, { note: 'มีหลักฐาน' }, judge),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a per-criterion note on the acceleration form', async () => {
      repository.findById.mockResolvedValue(pitchingRow({ round: PitchingRound.ACCELERATION }));
      repository.findCriterionById.mockResolvedValue(
        criterion({ id: 201, round: PitchingRound.ACCELERATION, code: '1.1', maxScore: 10 }),
      );

      await service.updateScore('pitch-1', 201, { note: 'มีหลักฐาน' }, judge);

      expect(repository.upsertScore).toHaveBeenCalledWith('pitch-1', 201, {
        score: undefined,
        note: 'มีหลักฐาน',
      });
    });

    it('404s a criterion belonging to the other round', async () => {
      repository.findCriterionById.mockResolvedValue(
        criterion({ id: 201, round: PitchingRound.ACCELERATION }),
      );
      await expect(service.updateScore('pitch-1', 201, { score: 1 }, judge)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('submit', () => {
    it('freezes the summed total once every criterion is scored', async () => {
      repository.findById.mockResolvedValue(
        scoredRow(4, { recommendation: PitchingRecommendation.SELECTED }),
      );

      await service.submit('pitch-1', {}, judge);

      expect(repository.submit).toHaveBeenCalledWith('pitch-1', expect.anything(), [], 4, null);
    });

    // The judge fills the form offline: nothing is stored until this call, so
    // the payload's own scores and fields have to count towards the total and
    // towards every precondition.
    it('writes the whole payload and totals its scores in one call', async () => {
      repository.findById.mockResolvedValue(pitchingRow());

      await service.submit(
        'pitch-1',
        {
          recommendation: PitchingRecommendation.SELECTED,
          recommendationReason: 'ศักยภาพดี',
          scores: [{ criterionId: 101, score: 4 }],
        },
        judge,
      );

      expect(repository.submit).toHaveBeenCalledWith(
        'pitch-1',
        expect.objectContaining({
          recommendation: PitchingRecommendation.SELECTED,
          recommendationReason: 'ศักยภาพดี',
        }),
        [{ criterionId: 101, score: 4 }],
        4,
        null,
      );
    });

    it('rejects a payload score above the criterion maximum', async () => {
      repository.findById.mockResolvedValue(pitchingRow());

      await expect(
        service.submit(
          'pitch-1',
          {
            recommendation: PitchingRecommendation.SELECTED,
            scores: [{ criterionId: 101, score: 9 }],
          },
          judge,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // Resubmitting a correction must not restamp the hand-in time.
    it('keeps the first submittedAt on a resubmit', async () => {
      const submittedAt = new Date('2026-05-21T00:00:00.000Z');
      repository.findById.mockResolvedValue(
        scoredRow(4, {
          status: PitchingStatus.SUBMITTED,
          submittedAt,
          recommendation: PitchingRecommendation.SELECTED,
        }),
      );

      await service.submit('pitch-1', {}, judge);

      expect(repository.submit).toHaveBeenCalledWith(
        'pitch-1',
        expect.anything(),
        [],
        4,
        submittedAt,
      );
    });

    it('refuses while a criterion is still unscored', async () => {
      repository.findById.mockResolvedValue(
        pitchingRow({ recommendation: PitchingRecommendation.SELECTED }),
      );
      await expect(service.submit('pitch-1', {}, judge)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses without a committee verdict', async () => {
      repository.findById.mockResolvedValue(scoredRow(4));
      await expect(service.submit('pitch-1', {}, judge)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses an acceleration form missing its minimum-condition readings', async () => {
      repository.findCriteria.mockResolvedValue([
        criterion({ id: 201, round: PitchingRound.ACCELERATION, code: '1.1', maxScore: 10 }),
      ]);
      repository.findById.mockResolvedValue(
        pitchingRow({
          round: PitchingRound.ACCELERATION,
          recommendation: PitchingRecommendation.SELECTED,
          scores: [
            {
              criterionId: 201,
              score: 8,
              note: null,
              criterion: criterion({ id: 201, round: PitchingRound.ACCELERATION, code: '1.1' }),
            },
          ],
        }),
      );

      await expect(service.submit('pitch-1', {}, judge)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    // Selection is decided later on the averaged scores, so a judge saving a
    // form must leave Store.status exactly as it was.
    it('never advances the store status', async () => {
      repository.findById.mockResolvedValue(
        scoredRow(4, { recommendation: PitchingRecommendation.SELECTED }),
      );

      await service.submit('pitch-1', {}, judge);

      expect(storeService.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('getSummary', () => {
    it('averages the judges per store and ranks them', async () => {
      repository.findSubmittedByRound.mockResolvedValue([
        scoredRow(0, { id: 'p-1', totalScore: 83, status: PitchingStatus.SUBMITTED }),
        scoredRow(0, {
          id: 'p-2',
          judgeId: otherJudge.sub,
          totalScore: 80,
          status: PitchingStatus.SUBMITTED,
        }),
        scoredRow(0, {
          id: 'p-3',
          storeId: 'store-2',
          totalScore: 91.12,
          status: PitchingStatus.SUBMITTED,
          store: {
            id: 'store-2',
            code: 'RAP69-002',
            name: 'ครัวบ้านทะเล',
            province: 'ตราด',
            coverUrl: null,
          },
        }),
      ]);

      const result = await service.getSummary({ round: PitchingRound.PITCH_DECK }, admin);

      expect(result.items).toMatchObject([
        { storeId: 'store-2', rank: 1, avgScore: 91.12, judgeCount: 1, level: 'HIGHLY_SUITABLE' },
        { storeId: 'store-1', rank: 2, avgScore: 81.5, judgeCount: 2, level: 'HIGHLY_SUITABLE' },
      ]);
    });

    it('gives stores on the same average the same rank', async () => {
      repository.findSubmittedByRound.mockResolvedValue([
        scoredRow(0, { id: 'p-1', totalScore: 75, status: PitchingStatus.SUBMITTED }),
        scoredRow(0, {
          id: 'p-2',
          storeId: 'store-2',
          totalScore: 75,
          status: PitchingStatus.SUBMITTED,
          store: {
            id: 'store-2',
            code: 'RAP69-002',
            name: 'ครัวบ้านทะเล',
            province: 'ตราด',
            coverUrl: null,
          },
        }),
      ]);

      const result = await service.getSummary({ round: PitchingRound.PITCH_DECK }, admin);

      expect(result.items.map((item) => item.rank)).toEqual([1, 1]);
    });

    it('refuses a role outside PITCHING_READ_ROLES', async () => {
      await expect(
        service.getSummary({ round: PitchingRound.PITCH_DECK }, entrepreneur),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // Filtering must not renumber: an "อันดับ 1" inside จันทบุรี that is really
    // the programme's third store would be read as the top of the cohort.
    it('filters by province while keeping each store’s rank in the whole round', async () => {
      repository.findSubmittedByRound.mockResolvedValue([
        scoredRow(0, { id: 'p-1', totalScore: 95, status: PitchingStatus.SUBMITTED }),
        scoredRow(0, {
          id: 'p-2',
          storeId: 'store-2',
          totalScore: 80,
          status: PitchingStatus.SUBMITTED,
          store: {
            id: 'store-2',
            code: 'RAP69-002',
            name: 'ครัวบ้านทะเล',
            province: 'ตราด',
            coverUrl: null,
          },
        }),
      ]);

      const result = await service.getSummary(
        { round: PitchingRound.PITCH_DECK, province: 'ตราด' },
        admin,
      );

      expect(result.items).toMatchObject([{ storeId: 'store-2', rank: 2 }]);
      expect(result.meta.total).toBe(1);
    });

    // The pitch deck form has no เงื่อนไขขั้นต่ำ, so both readings are always
    // null on it. Counting them anyway reports "0 of 2 judges passed" for a
    // gate that form cannot record either way.
    // A JUDGE reads only its assignment list, but "อันดับ 1 จาก 3" for a store
    // that is the programme's second would be read as the top of the cohort.
    it('ranks the whole round before narrowing to the caller’s stores', async () => {
      storeService.findAccessibleStoreIds.mockResolvedValue(['store-2']);
      repository.findSubmittedByRound.mockResolvedValue([
        scoredRow(0, { id: 'p-1', totalScore: 95, status: PitchingStatus.SUBMITTED }),
        scoredRow(0, {
          id: 'p-2',
          storeId: 'store-2',
          totalScore: 80,
          status: PitchingStatus.SUBMITTED,
          store: {
            id: 'store-2',
            code: 'RAP69-002',
            name: 'ครัวบ้านทะเล',
            province: 'ตราด',
            coverUrl: null,
          },
        }),
      ]);

      const result = await service.getSummary({ round: PitchingRound.PITCH_DECK }, judge);

      // The unreachable store is not a row, but it is still the store above.
      expect(repository.findSubmittedByRound).toHaveBeenCalledWith(PitchingRound.PITCH_DECK, null);
      expect(result.items).toMatchObject([{ storeId: 'store-2', rank: 2 }]);
      expect(result.meta.total).toBe(1);
    });

    it('reports no minimum-condition count on PITCH_DECK', async () => {
      repository.findSubmittedByRound.mockResolvedValue([
        scoredRow(0, { id: 'p-1', totalScore: 83, status: PitchingStatus.SUBMITTED }),
      ]);

      const result = await service.getSummary({ round: PitchingRound.PITCH_DECK }, admin);

      expect(result.items[0].minimumPassedCount).toBeNull();
    });

    it('counts the judges who cleared both minimum conditions on ACCELERATION', async () => {
      repository.findSubmittedByRound.mockResolvedValue([
        scoredRow(0, {
          id: 'p-1',
          round: PitchingRound.ACCELERATION,
          totalScore: 83,
          status: PitchingStatus.SUBMITTED,
          scoreCardTotal: 34,
          participationPct: 95,
        }),
        scoredRow(0, {
          id: 'p-2',
          round: PitchingRound.ACCELERATION,
          judgeId: otherJudge.sub,
          totalScore: 80,
          status: PitchingStatus.SUBMITTED,
          scoreCardTotal: 22,
          participationPct: 95,
        }),
      ]);

      const result = await service.getSummary({ round: PitchingRound.ACCELERATION }, admin);

      expect(result.items[0]).toMatchObject({ judgeCount: 2, minimumPassedCount: 1 });
    });
  });

  describe('exports', () => {
    beforeEach(() =>
      repository.findSubmittedByRound.mockResolvedValue([
        scoredRow(4, { id: 'p-1', totalScore: 83, status: PitchingStatus.SUBMITTED }),
      ]),
    );

    it.each(['xlsx', 'pdf'] as const)('writes the ranking as %s', async (format) => {
      const file = await service.exportRanking({ round: PitchingRound.PITCH_DECK }, format, admin);
      expect(file.length).toBeGreaterThan(0);
    });

    it.each(['xlsx', 'pdf'] as const)('writes a store report as %s', async (format) => {
      const file = await service.exportStoreReport(
        'store-1',
        { round: PitchingRound.PITCH_DECK },
        format,
        admin,
      );
      expect(file.length).toBeGreaterThan(0);
    });

    // The export is the whole round by design — a file cut to the page on
    // screen would have to be stitched back together by hand.
    it('ignores page and limit', async () => {
      const file = await service.exportRanking(
        { round: PitchingRound.PITCH_DECK, page: 5, limit: 1 },
        'xlsx',
        admin,
      );
      expect(file.length).toBeGreaterThan(0);
    });

    it('refuses a role outside PITCHING_READ_ROLES', async () => {
      await expect(
        service.exportRanking({ round: PitchingRound.PITCH_DECK }, 'xlsx', entrepreneur),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // Called in-process by AnalyticsService for the IRS. It answers a number and
  // nothing else, which is why it may skip the read-role check.
  describe('getStoreAverageScore', () => {
    it('averages the store’s submitted forms for the round', async () => {
      repository.findSubmittedByRound.mockResolvedValue([
        scoredRow(0, { id: 'p-1', totalScore: 83, status: PitchingStatus.SUBMITTED }),
        scoredRow(0, { id: 'p-2', totalScore: 80, status: PitchingStatus.SUBMITTED }),
      ]);

      await expect(service.getStoreAverageScore('store-1', PitchingRound.PITCH_DECK)).resolves.toBe(
        81.5,
      );
    });

    it('returns null when no judge has submitted', async () => {
      repository.findSubmittedByRound.mockResolvedValue([]);

      await expect(
        service.getStoreAverageScore('store-1', PitchingRound.PITCH_DECK),
      ).resolves.toBeNull();
    });
  });

  describe('getStoreReport', () => {
    it('carries the store’s rank within the whole round, not just its own rows', async () => {
      repository.findSubmittedByRound.mockResolvedValue([
        scoredRow(4, { id: 'p-1', totalScore: 80, status: PitchingStatus.SUBMITTED }),
        scoredRow(0, {
          id: 'p-3',
          storeId: 'store-2',
          totalScore: 95,
          status: PitchingStatus.SUBMITTED,
          store: {
            id: 'store-2',
            code: 'RAP69-002',
            name: 'ครัวบ้านทะเล',
            province: 'ตราด',
            coverUrl: null,
          },
        }),
      ]);

      const report = await service.getStoreReport(
        'store-1',
        { round: PitchingRound.PITCH_DECK },
        admin,
      );

      expect(report).toMatchObject({ rank: 2, rankedStoreCount: 2, judgeCount: 1, avgScore: 80 });
      expect(report.criteria[0]).toMatchObject({ id: 101, avgScore: 4, avgPct: 80 });
    });

    it('answers a store nobody has judged yet with nulls rather than a 404', async () => {
      repository.findSubmittedByRound.mockResolvedValue([]);

      const report = await service.getStoreReport(
        'store-1',
        { round: PitchingRound.PITCH_DECK },
        admin,
      );

      expect(report).toMatchObject({ rank: null, avgScore: null, level: null, judgeCount: 0 });
    });

    // Reaching the store is gated by findAccessible; the cohort behind the rank
    // is not, or a judge's report would rank its store inside its own list.
    it('counts the rank against the whole round for an assignment-scoped caller', async () => {
      storeService.findAccessibleStoreIds.mockResolvedValue(['store-1']);
      repository.findSubmittedByRound.mockResolvedValue([
        scoredRow(4, { id: 'p-1', totalScore: 80, status: PitchingStatus.SUBMITTED }),
        scoredRow(0, {
          id: 'p-3',
          storeId: 'store-2',
          totalScore: 95,
          status: PitchingStatus.SUBMITTED,
          store: {
            id: 'store-2',
            code: 'RAP69-002',
            name: 'ครัวบ้านทะเล',
            province: 'ตราด',
            coverUrl: null,
          },
        }),
      ]);

      const report = await service.getStoreReport(
        'store-1',
        { round: PitchingRound.PITCH_DECK },
        judge,
      );

      expect(repository.findSubmittedByRound).toHaveBeenCalledWith(PitchingRound.PITCH_DECK, null);
      expect(report).toMatchObject({ rank: 2, rankedStoreCount: 2, judgeCount: 1 });
      // The unreachable store contributes a rank and nothing else.
      expect(report.judges.every((item) => item.storeId === 'store-1')).toBe(true);
    });
  });
});
