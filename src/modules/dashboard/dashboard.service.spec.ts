import { Test, type TestingModule } from '@nestjs/testing';
import { NewsType, Role, Round, StoreStatus } from '@prisma/client';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { ForbiddenException } from '@common/exceptions/app.exception';
import { STORE_TARGET_TOTAL } from '@constants/index';
import { NewsService } from '@modules/news/news.service';
import { ReportService } from '@modules/report/report.service';
import { DashboardService } from './dashboard.service';
import { DashboardRepository, type StoreScoreRow } from './dashboard.repository';
import { TOP20_ALL_ROUNDS } from './dto/query-top20.dto';

const admin: JwtPayload = { sub: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
const owner: JwtPayload = { sub: 'owner-1', email: 'owner@example.com', role: Role.ENTREPRENEUR };
const assessor: JwtPayload = {
  sub: 'assessor-1',
  email: 'assessor@example.com',
  role: Role.ASSESSOR,
};
const mentor: JwtPayload = { sub: 'mentor-1', email: 'mentor@example.com', role: Role.MENTOR };
const judge: JwtPayload = { sub: 'judge-1', email: 'judge@example.com', role: Role.JUDGE };

const ownerScope = { ownerId: owner.sub };
const assessorScope = { assignedToId: assessor.sub };
const mentorScope = { assignedToId: mentor.sub };

function scoreRow(storeId: string, totalScore: number | null, name = 'ร้านทดสอบ'): StoreScoreRow {
  return {
    storeId,
    totalScore,
    store: { name, province: 'จันทบุรี', storeType: 'อาหารตามสั่ง' },
  };
}

describe('DashboardService', () => {
  let service: DashboardService;
  let repository: jest.Mocked<DashboardRepository>;
  let newsService: jest.Mocked<NewsService>;
  let reportService: jest.Mocked<ReportService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: DashboardRepository,
          useValue: {
            countStores: jest.fn().mockResolvedValue(0),
            countSubmittedByRound: jest.fn().mockResolvedValue(0),
            countStoresByProvince: jest.fn().mockResolvedValue([]),
            countStoresByStatus: jest.fn().mockResolvedValue([]),
            findRoundScores: jest.fn().mockResolvedValue([]),
            findProvinceRoundScores: jest.fn().mockResolvedValue([]),
            findStoreRoundScores: jest.fn().mockResolvedValue([]),
            findScoresByRound: jest.fn().mockResolvedValue([]),
            findLatestScores: jest.fn().mockResolvedValue([]),
            findLastSubmittedAt: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: NewsService,
          useValue: { listForFeed: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: ReportService,
          useValue: { listAvailableReports: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    repository = module.get(DashboardRepository);
    newsService = module.get(NewsService);
    reportService = module.get(ReportService);
  });

  // A judge sits on the panel for the stores it is assigned; the programme
  // overview is not part of that, so every /dashboard read is closed to it.
  describe('judge access', () => {
    it('should refuse every overview read to a judge', async () => {
      await expect(service.getKpis(judge)).rejects.toThrow(ForbiddenException);
      await expect(service.getProvinceDistribution(judge)).rejects.toThrow(ForbiddenException);
      await expect(service.getTop20({}, judge)).rejects.toThrow(ForbiddenException);
      await expect(service.getIncubationProgress(judge)).rejects.toThrow(ForbiddenException);
      await expect(service.getProvinceComparison({}, judge)).rejects.toThrow(ForbiddenException);
      await expect(service.getStoreRoundScores(judge)).rejects.toThrow(ForbiddenException);
      await expect(service.exportStoreRoundScores(judge)).rejects.toThrow(ForbiddenException);
      await expect(service.getActivities(judge)).rejects.toThrow(ForbiddenException);
      await expect(service.getReportsStatus(judge)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getKpis', () => {
    it('should compute completion percentages against the store total', async () => {
      repository.countStores.mockResolvedValue(200);
      repository.countSubmittedByRound.mockImplementation((round) =>
        Promise.resolve(round === Round.T0 ? 180 : 100),
      );

      const result = await service.getKpis(admin);

      expect(result.totalStores).toBe(200);
      expect(result.targetStores).toBe(STORE_TARGET_TOTAL);
      expect(result.t0Completed).toBe(180);
      expect(result.t0Percentage).toBe(90);
      expect(result.t1Percentage).toBe(50);
    });

    it('should count a store as improved when any round beats the one before it', async () => {
      repository.countStores.mockResolvedValue(5);
      repository.findRoundScores.mockResolvedValue([
        { storeId: 'a', round: Round.T0, totalScore: 60 },
        { storeId: 'a', round: Round.T1, totalScore: 70 },
        { storeId: 'b', round: Round.T0, totalScore: 80 },
        { storeId: 'b', round: Round.T1, totalScore: 75 },
        { storeId: 'b', round: Round.T2, totalScore: 78 },
        { storeId: 'c', round: Round.T0, totalScore: 50 },
        { storeId: 'd', round: Round.T1, totalScore: 90 },
        { storeId: 'e', round: Round.T0, totalScore: 90 },
        { storeId: 'e', round: Round.T2, totalScore: 85 },
        { storeId: 'e', round: Round.T3, totalScore: 80 },
      ]);

      const result = await service.getKpis(admin);

      expect(result.improvedStores).toBe(2);
      expect(result.improvementRate).toBe(40);
    });

    it('should count a store that improved in several rounds only once', async () => {
      repository.countStores.mockResolvedValue(1);
      repository.findRoundScores.mockResolvedValue([
        { storeId: 'a', round: Round.T0, totalScore: 50 },
        { storeId: 'a', round: Round.T1, totalScore: 60 },
        { storeId: 'a', round: Round.T2, totalScore: 70 },
        { storeId: 'a', round: Round.T3, totalScore: 80 },
      ]);

      const result = await service.getKpis(admin);

      expect(result.improvedStores).toBe(1);
      expect(result.improvementRate).toBe(100);
    });

    it('should average the latest score per store, ignoring unscored rows', async () => {
      repository.countStores.mockResolvedValue(3);
      repository.findLatestScores.mockResolvedValue([
        scoreRow('a', 70),
        scoreRow('b', 80),
        scoreRow('c', null),
      ]);

      const result = await service.getKpis(admin);

      expect(result.avgScore).toBe(75);
    });

    it('should return zero percentages when there are no stores', async () => {
      const result = await service.getKpis(admin);

      expect(result.totalStores).toBe(0);
      expect(result.t0Percentage).toBe(0);
      expect(result.improvementRate).toBe(0);
      expect(result.avgScore).toBe(0);
    });

    it('should count every post-selection status as selected', async () => {
      repository.countStores.mockResolvedValue(10);
      repository.countStoresByStatus.mockResolvedValue([
        { status: StoreStatus.SELECTED, count: 2 },
        { status: StoreStatus.IDP_CREATED, count: 1 },
        { status: StoreStatus.NOT_SELECTED, count: 5 },
      ]);

      const result = await service.getKpis(admin);

      expect(result.selectedStores).toBe(3);
      expect(result.selectedPercentage).toBe(30);
    });

    it('should scope every query to the stores an ENTREPRENEUR owns', async () => {
      await service.getKpis(owner);

      expect(repository.countStores).toHaveBeenCalledWith(ownerScope);
      expect(repository.countSubmittedByRound).toHaveBeenCalledWith(Round.T0, ownerScope);
      expect(repository.countStoresByStatus).toHaveBeenCalledWith(ownerScope);
      expect(repository.findRoundScores).toHaveBeenCalledWith(expect.anything(), ownerScope);
      expect(repository.findLatestScores).toHaveBeenCalledWith(ownerScope);
      expect(repository.findLastSubmittedAt).toHaveBeenCalledWith(ownerScope);
    });

    it('should scope every query to the stores an ASSESSOR is assigned', async () => {
      await service.getKpis(assessor);

      expect(repository.countStores).toHaveBeenCalledWith(assessorScope);
      expect(repository.countSubmittedByRound).toHaveBeenCalledWith(Round.T0, assessorScope);
      expect(repository.countStoresByStatus).toHaveBeenCalledWith(assessorScope);
      expect(repository.findRoundScores).toHaveBeenCalledWith(expect.anything(), assessorScope);
      expect(repository.findLatestScores).toHaveBeenCalledWith(assessorScope);
      expect(repository.findLastSubmittedAt).toHaveBeenCalledWith(assessorScope);
    });

    it('should scope every query to the stores a MENTOR is assigned', async () => {
      await service.getKpis(mentor);

      expect(repository.countStores).toHaveBeenCalledWith(mentorScope);
      expect(repository.findLatestScores).toHaveBeenCalledWith(mentorScope);
    });

    it('should leave a staff role unscoped', async () => {
      await service.getKpis(admin);

      expect(repository.countStores).toHaveBeenCalledWith(undefined);
      expect(repository.findLatestScores).toHaveBeenCalledWith(undefined);
    });

    // targetStores is the programme's own goal, not a count of what the caller
    // reaches — a narrowed role still measures itself against all of it.
    it('should keep targetStores project-wide for a narrowed role', async () => {
      const result = await service.getKpis(assessor);

      expect(result.targetStores).toBe(STORE_TARGET_TOTAL);
    });
  });

  describe('getProvinceDistribution', () => {
    it('should return each province share of the total', async () => {
      repository.countStoresByProvince.mockResolvedValue([
        { province: 'จันทบุรี', count: 60 },
        { province: 'ชลบุรี', count: 40 },
      ]);

      const result = await service.getProvinceDistribution(admin);

      expect(result).toEqual([
        { province: 'จันทบุรี', count: 60, percentage: 60 },
        { province: 'ชลบุรี', count: 40, percentage: 40 },
      ]);
    });

    it('should return an empty list when no stores exist', async () => {
      await expect(service.getProvinceDistribution(admin)).resolves.toEqual([]);
    });

    it('should count only the provinces an ENTREPRENEUR owns stores in', async () => {
      await service.getProvinceDistribution(owner);

      expect(repository.countStoresByProvince).toHaveBeenCalledWith(ownerScope);
    });

    it('should count only the provinces a narrowed role is assigned stores in', async () => {
      await service.getProvinceDistribution(assessor);
      expect(repository.countStoresByProvince).toHaveBeenCalledWith(assessorScope);

      await service.getProvinceDistribution(mentor);
      expect(repository.countStoresByProvince).toHaveBeenCalledWith(mentorScope);
    });
  });

  describe('getTop20', () => {
    it('should rank by the latest score when round is all', async () => {
      repository.findLatestScores.mockResolvedValue([
        scoreRow('a', 70, 'ร้าน A'),
        scoreRow('b', 90, 'ร้าน B'),
      ]);

      const result = await service.getTop20({ round: TOP20_ALL_ROUNDS }, admin);

      expect(repository.findLatestScores).toHaveBeenCalled();
      expect(result[0]).toMatchObject({ rank: 1, storeName: 'ร้าน B', t1Score: 90 });
      expect(result[1]).toMatchObject({ rank: 2, storeName: 'ร้าน A', t1Score: 70 });
    });

    it('should default to the latest score when no round is given', async () => {
      await service.getTop20({}, admin);

      expect(repository.findLatestScores).toHaveBeenCalled();
      expect(repository.findScoresByRound).not.toHaveBeenCalled();
    });

    it('should query the requested round when one is given', async () => {
      repository.findScoresByRound.mockResolvedValue([scoreRow('a', 88)]);

      const result = await service.getTop20({ round: Round.T2 }, admin);

      expect(repository.findScoresByRound).toHaveBeenCalledWith(Round.T2, 20, undefined);
      expect(result).toHaveLength(1);
    });

    it('should drop rows without a total score', async () => {
      repository.findLatestScores.mockResolvedValue([scoreRow('a', null), scoreRow('b', 60)]);

      const result = await service.getTop20({}, admin);

      expect(result).toHaveLength(1);
      expect(result[0].storeId).toBe('b');
    });

    it('should cap the result at 20 entries', async () => {
      repository.findLatestScores.mockResolvedValue(
        Array.from({ length: 25 }, (_, i) => scoreRow(`store-${i}`, 100 - i)),
      );

      const result = await service.getTop20({}, admin);

      expect(result).toHaveLength(20);
      expect(result[19].rank).toBe(20);
    });

    it('should rank only the stores an ENTREPRENEUR owns', async () => {
      await service.getTop20({}, owner);
      expect(repository.findLatestScores).toHaveBeenCalledWith(ownerScope);

      await service.getTop20({ round: Round.T2 }, owner);
      expect(repository.findScoresByRound).toHaveBeenCalledWith(Round.T2, 20, ownerScope);
    });

    it('should rank only the stores a narrowed role is assigned', async () => {
      await service.getTop20({}, assessor);
      expect(repository.findLatestScores).toHaveBeenCalledWith(assessorScope);

      await service.getTop20({ round: Round.T2 }, mentor);
      expect(repository.findScoresByRound).toHaveBeenCalledWith(Round.T2, 20, mentorScope);
    });
  });

  describe('getIncubationProgress', () => {
    it('should report one round per step so each step matches its round badge', async () => {
      const submittedByRound: Record<Round, number> = {
        [Round.T0]: 90,
        [Round.T1]: 70,
        [Round.T2]: 50,
        [Round.T3]: 30,
      };
      repository.countStores.mockResolvedValue(100);
      repository.countSubmittedByRound.mockImplementation((round) =>
        Promise.resolve(submittedByRound[round]),
      );
      repository.countStoresByStatus.mockResolvedValue([
        { status: StoreStatus.REGISTERED, count: 30 },
        { status: StoreStatus.CAMP_COMPLETED, count: 40 },
        { status: StoreStatus.NOT_SELECTED, count: 20 },
        { status: StoreStatus.SELECTED, count: 10 },
      ]);

      const result = await service.getIncubationProgress(admin);

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({ label: 'คัดกรองเบื้องต้น', count: 90, percentage: 90 });
      expect(result[1]).toEqual({ label: 'ประเมิน T1', count: 70, percentage: 70 });
      expect(result[2]).toEqual({ label: 'พัฒนาศักยภาพ', count: 50, percentage: 50 });
      expect(result[3]).toEqual({ label: 'ประเมิน', count: 30, percentage: 30 });
      expect(result[4]).toEqual({ label: 'ผ่านเข้ารอบ', count: 10, percentage: 10 });
    });

    it('should count every post-selection status in the final step', async () => {
      repository.countStores.mockResolvedValue(100);
      repository.countStoresByStatus.mockResolvedValue([
        { status: StoreStatus.NOT_SELECTED, count: 40 },
        { status: StoreStatus.SELECTED, count: 10 },
        { status: StoreStatus.FIELD_AUDITED, count: 6 },
        { status: StoreStatus.COMPLETED, count: 4 },
      ]);

      const result = await service.getIncubationProgress(admin);

      expect(result[4]).toEqual({ label: 'ผ่านเข้ารอบ', count: 20, percentage: 20 });
    });

    it('should return zero percentages when there are no stores', async () => {
      const result = await service.getIncubationProgress(admin);

      expect(result).toHaveLength(5);
      expect(result.every((step) => step.count === 0 && step.percentage === 0)).toBe(true);
    });

    it('should build the funnel from the stores an ENTREPRENEUR owns', async () => {
      await service.getIncubationProgress(owner);

      expect(repository.countStores).toHaveBeenCalledWith(ownerScope);
      expect(repository.countStoresByStatus).toHaveBeenCalledWith(ownerScope);
      expect(repository.countSubmittedByRound).toHaveBeenCalledWith(Round.T0, ownerScope);
    });
  });

  describe('getProvinceComparison', () => {
    it('should default to averaging T0 against T1 per province', async () => {
      repository.findProvinceRoundScores.mockResolvedValue([
        { storeId: 'a', round: Round.T0, totalScore: 60, store: { province: 'จันทบุรี' } },
        { storeId: 'a', round: Round.T1, totalScore: 80, store: { province: 'จันทบุรี' } },
        { storeId: 'b', round: Round.T0, totalScore: 70, store: { province: 'จันทบุรี' } },
        { storeId: 'b', round: Round.T1, totalScore: 90, store: { province: 'จันทบุรี' } },
      ]);

      const result = await service.getProvinceComparison({}, admin);

      expect(repository.findProvinceRoundScores).toHaveBeenCalledWith(
        [Round.T0, Round.T1],
        undefined,
      );
      expect(result).toEqual([
        {
          province: 'จันทบุรี',
          fromRound: Round.T0,
          toRound: Round.T1,
          fromScore: 65,
          toScore: 85,
        },
      ]);
    });

    it('should average only stores holding both rounds', async () => {
      repository.findProvinceRoundScores.mockResolvedValue([
        { storeId: 'a', round: Round.T0, totalScore: 60, store: { province: 'จันทบุรี' } },
        { storeId: 'a', round: Round.T1, totalScore: 80, store: { province: 'จันทบุรี' } },
        // Sat T0 but dropped out before T1 — counting it would drag the T0 bar
        // down against a T1 bar it never contributed to.
        { storeId: 'b', round: Round.T0, totalScore: 20, store: { province: 'จันทบุรี' } },
        { storeId: 'c', round: Round.T1, totalScore: null, store: { province: 'จันทบุรี' } },
        { storeId: 'c', round: Round.T0, totalScore: 30, store: { province: 'จันทบุรี' } },
      ]);

      const result = await service.getProvinceComparison({}, admin);

      expect(result).toEqual([
        {
          province: 'จันทบุรี',
          fromRound: Round.T0,
          toRound: Round.T1,
          fromScore: 60,
          toScore: 80,
        },
      ]);
    });

    it('should drop a province with no store holding both rounds', async () => {
      repository.findProvinceRoundScores.mockResolvedValue([
        { storeId: 'a', round: Round.T0, totalScore: 60, store: { province: 'จันทบุรี' } },
        { storeId: 'a', round: Round.T1, totalScore: 80, store: { province: 'จันทบุรี' } },
        { storeId: 'b', round: Round.T1, totalScore: 90, store: { province: 'ชลบุรี' } },
      ]);

      const result = await service.getProvinceComparison({}, admin);

      expect(result.map((item) => item.province)).toEqual(['จันทบุรี']);
    });

    it('should keep only the five provinces with the most paired stores', async () => {
      // Seven provinces, each with a different number of paired stores. The two
      // smallest must be cut even though their averages are the highest.
      const pairedStores = [
        { province: 'จันทบุรี', stores: 7, score: 50 },
        { province: 'ชลบุรี', stores: 6, score: 55 },
        { province: 'ระยอง', stores: 5, score: 60 },
        { province: 'ตราด', stores: 4, score: 65 },
        { province: 'สระแก้ว', stores: 3, score: 70 },
        { province: 'ปราจีนบุรี', stores: 2, score: 95 },
        { province: 'ฉะเชิงเทรา', stores: 1, score: 99 },
      ];
      repository.findProvinceRoundScores.mockResolvedValue(
        pairedStores.flatMap(({ province, stores, score }) =>
          Array.from({ length: stores }, (_, i) => [
            {
              storeId: `${province}-${i}`,
              round: Round.T0,
              totalScore: score - 10,
              store: { province },
            },
            {
              storeId: `${province}-${i}`,
              round: Round.T1,
              totalScore: score,
              store: { province },
            },
          ]).flat(),
        ),
      );

      const result = await service.getProvinceComparison({}, admin);

      expect(result.map((item) => item.province)).toEqual([
        'สระแก้ว',
        'ตราด',
        'ระยอง',
        'ชลบุรี',
        'จันทบุรี',
      ]);
    });

    it('should compare the requested rounds when they are given', async () => {
      repository.findProvinceRoundScores.mockResolvedValue([
        { storeId: 'a', round: Round.T2, totalScore: 70, store: { province: 'ระยอง' } },
        { storeId: 'a', round: Round.T3, totalScore: 84, store: { province: 'ระยอง' } },
      ]);

      const result = await service.getProvinceComparison({ from: Round.T2, to: Round.T3 }, admin);

      expect(repository.findProvinceRoundScores).toHaveBeenCalledWith(
        [Round.T2, Round.T3],
        undefined,
      );
      expect(result).toEqual([
        {
          province: 'ระยอง',
          fromRound: Round.T2,
          toRound: Round.T3,
          fromScore: 70,
          toScore: 84,
        },
      ]);
    });

    it('should return an empty list when nothing is scored', async () => {
      await expect(service.getProvinceComparison({}, admin)).resolves.toEqual([]);
    });

    it('should compare only the stores an ENTREPRENEUR owns', async () => {
      await service.getProvinceComparison({}, owner);

      expect(repository.findProvinceRoundScores).toHaveBeenCalledWith(
        [Round.T0, Round.T1],
        ownerScope,
      );
    });
  });

  describe('getStoreRoundScores', () => {
    it('should fill every round, leaving rounds the store never sat as null', async () => {
      repository.findStoreRoundScores.mockResolvedValue([
        {
          id: 'store-01',
          name: 'ครัวริมธาร',
          province: 'จันทบุรี',
          storeType: 'อาหารไทย',
          assessments: [
            { round: Round.T0, totalScore: 62.1 },
            { round: Round.T1, totalScore: 75.8 },
          ],
        },
      ]);

      const result = await service.getStoreRoundScores(admin);

      expect(result).toEqual([
        {
          storeId: 'store-01',
          storeName: 'ครัวริมธาร',
          province: 'จันทบุรี',
          storeType: 'อาหารไทย',
          scores: { T0: 62.1, T1: 75.8, T2: null, T3: null },
        },
      ]);
    });

    it('should list only the stores an ENTREPRENEUR owns', async () => {
      await service.getStoreRoundScores(owner);

      expect(repository.findStoreRoundScores).toHaveBeenCalledWith(ownerScope);
    });

    it('should list only the stores a narrowed role is assigned', async () => {
      await service.getStoreRoundScores(assessor);
      expect(repository.findStoreRoundScores).toHaveBeenCalledWith(assessorScope);

      await service.getStoreRoundScores(mentor);
      expect(repository.findStoreRoundScores).toHaveBeenCalledWith(mentorScope);
    });
  });

  describe('exportStoreRoundScores', () => {
    it('should return a non-empty xlsx buffer', async () => {
      repository.findStoreRoundScores.mockResolvedValue([
        {
          id: 'store-01',
          name: 'ครัวริมธาร',
          province: 'จันทบุรี',
          storeType: 'อาหารไทย',
          assessments: [{ round: Round.T0, totalScore: 62.1 }],
        },
      ]);

      const buffer = await service.exportStoreRoundScores(admin);

      expect(buffer.length).toBeGreaterThan(0);
      // xlsx files are zip archives — "PK" is the zip local file header magic.
      expect(buffer.subarray(0, 2).toString()).toBe('PK');
    });

    it('should export only the stores an ENTREPRENEUR owns', async () => {
      await service.exportStoreRoundScores(owner);

      expect(repository.findStoreRoundScores).toHaveBeenCalledWith(ownerScope);
    });

    it('should export only the stores a narrowed role is assigned', async () => {
      await service.exportStoreRoundScores(assessor);

      expect(repository.findStoreRoundScores).toHaveBeenCalledWith(assessorScope);
    });
  });

  describe('getActivities', () => {
    it('should return nothing when no news has been published', async () => {
      await expect(service.getActivities(admin)).resolves.toEqual([]);
    });

    it('should read the feed from the news module only', async () => {
      await service.getActivities(admin);

      expect(newsService.listForFeed).toHaveBeenCalledWith(10);
    });

    it('should map published announcements onto their feed type', async () => {
      newsService.listForFeed.mockResolvedValue([
        {
          id: 'news-1',
          type: NewsType.EVENT,
          title: 'กิจกรรมอบรมหลักสูตรการจัดการต้นทุน',
          description: 'วันที่ 25 พ.ค. 2569 เวลา 09:00 น.',
          urgent: false,
          publishedAt: new Date('2026-05-19T00:00:00.000Z'),
          authorId: 'admin-1',
          authorName: 'ผู้ดูแลระบบ',
        },
        {
          id: 'news-2',
          type: NewsType.ALERT,
          title: 'แจ้งเตือนปิดระบบชั่วคราว',
          description: 'คืนวันที่ 20 พ.ค. 2569',
          urgent: true,
          publishedAt: new Date('2026-05-18T00:00:00.000Z'),
          authorId: 'admin-1',
          authorName: 'ผู้ดูแลระบบ',
        },
      ]);

      const result = await service.getActivities(admin);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ type: 'event', urgent: false });
      expect(result[1]).toMatchObject({ type: 'warning', urgent: true });
    });

    it('should map a general announcement onto the announcement type', async () => {
      newsService.listForFeed.mockResolvedValue([
        {
          id: 'news-1',
          type: NewsType.GENERAL,
          title: 'ประกาศทั่วไป',
          description: 'รายละเอียด',
          urgent: false,
          publishedAt: new Date('2026-05-19T00:00:00.000Z'),
          authorId: 'admin-1',
          authorName: 'ผู้ดูแลระบบ',
        },
      ]);

      const result = await service.getActivities(admin);

      expect(result[0]).toMatchObject({ type: 'announcement', title: 'ประกาศทั่วไป' });
    });
  });

  describe('getReportsStatus', () => {
    it('should map an available report onto the card contract', async () => {
      const createdAt = new Date('2026-07-29T02:00:00.000Z');
      reportService.listAvailableReports.mockResolvedValue([
        {
          id: 'store-1:T1:xlsx',
          name: 'รายงานผลการประเมิน T1 - ครัวริมธาร',
          format: 'XLSX',
          status: 'DONE',
          createdAt,
          downloadPath: '/reports/stores/store-1/rounds/T1/export?format=xlsx',
        },
      ]);

      await expect(service.getReportsStatus(admin)).resolves.toEqual([
        {
          id: 'store-1:T1:xlsx',
          name: 'รายงานผลการประเมิน T1 - ครัวริมธาร',
          format: 'XLSX',
          status: 'DONE',
          createdAt,
          downloadUrl: '/reports/stores/store-1/rounds/T1/export?format=xlsx',
        },
      ]);
    });

    it('should return an empty list when no round has been submitted yet', async () => {
      await expect(service.getReportsStatus(admin)).resolves.toEqual([]);
    });

    it('should pass the caller through so the report scope can narrow it', async () => {
      await service.getReportsStatus(owner);

      expect(reportService.listAvailableReports).toHaveBeenCalledWith(owner);
    });
  });
});
