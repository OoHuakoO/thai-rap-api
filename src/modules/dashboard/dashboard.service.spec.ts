import { Test, type TestingModule } from '@nestjs/testing';
import { NewsType, Role, Round, StoreStatus } from '@prisma/client';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { ForbiddenException } from '@common/exceptions/app.exception';
import { ERROR_CODES, STORE_TARGET_TOTAL } from '@constants/index';
import { NewsService } from '@modules/news/news.service';
import { DashboardService } from './dashboard.service';
import { DashboardRepository, type StoreScoreRow } from './dashboard.repository';
import { TOP20_ALL_ROUNDS } from './dto/query-top20.dto';

const admin: JwtPayload = { sub: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
const owner: JwtPayload = { sub: 'owner-1', email: 'owner@example.com', role: Role.ENTREPRENEUR };

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
            countStoresAwaitingT1: jest.fn().mockResolvedValue(0),
            countUnresolvedRedFlags: jest.fn().mockResolvedValue(0),
          },
        },
        {
          provide: NewsService,
          useValue: { findAll: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    repository = module.get(DashboardRepository);
    newsService = module.get(NewsService);
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

    it('should reject ENTREPRENEUR', async () => {
      await expect(service.getKpis(owner)).rejects.toThrow(ForbiddenException);
      await expect(service.getKpis(owner)).rejects.toMatchObject({
        code: ERROR_CODES.PERM.FORBIDDEN,
      });
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

    it('should reject ENTREPRENEUR', async () => {
      await expect(service.getProvinceDistribution(owner)).rejects.toThrow(ForbiddenException);
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

      expect(repository.findScoresByRound).toHaveBeenCalledWith(Round.T2, 20);
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

    it('should reject ENTREPRENEUR', async () => {
      await expect(service.getTop20({}, owner)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getIncubationProgress', () => {
    it('should build the five funnel steps from statuses and submitted rounds', async () => {
      repository.countStores.mockResolvedValue(100);
      repository.countSubmittedByRound.mockImplementation((round) =>
        Promise.resolve(round === Round.T0 ? 90 : 50),
      );
      repository.countStoresByStatus.mockResolvedValue([
        { status: StoreStatus.REGISTERED, count: 30 },
        { status: StoreStatus.CAMP_COMPLETED, count: 40 },
        { status: StoreStatus.NOT_SELECTED, count: 20 },
        { status: StoreStatus.SELECTED, count: 10 },
      ]);

      const result = await service.getIncubationProgress(admin);

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({ label: 'คัดกรองเบื้องต้น', count: 100, percentage: 100 });
      expect(result[1]).toEqual({ label: 'ประเมิน T1', count: 90, percentage: 90 });
      expect(result[2]).toEqual({ label: 'พัฒนาศักยภาพ', count: 70, percentage: 70 });
      expect(result[3]).toEqual({ label: 'ประเมิน', count: 50, percentage: 50 });
      expect(result[4]).toEqual({ label: 'ผ่านเข้ารอบ', count: 10, percentage: 10 });
    });

    it('should reject ENTREPRENEUR', async () => {
      await expect(service.getIncubationProgress(owner)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getProvinceComparison', () => {
    it('should default to averaging T0 against T1 per province', async () => {
      repository.findProvinceRoundScores.mockResolvedValue([
        { round: Round.T0, totalScore: 60, store: { province: 'จันทบุรี' } },
        { round: Round.T0, totalScore: 70, store: { province: 'จันทบุรี' } },
        { round: Round.T1, totalScore: 80, store: { province: 'จันทบุรี' } },
        { round: Round.T1, totalScore: 90, store: { province: 'ชลบุรี' } },
        { round: Round.T1, totalScore: null, store: { province: 'ชลบุรี' } },
      ]);

      const result = await service.getProvinceComparison({}, admin);

      expect(repository.findProvinceRoundScores).toHaveBeenCalledWith([Round.T0, Round.T1]);
      expect(result).toEqual([
        {
          province: 'ชลบุรี',
          fromRound: Round.T0,
          toRound: Round.T1,
          fromScore: 0,
          toScore: 90,
        },
        {
          province: 'จันทบุรี',
          fromRound: Round.T0,
          toRound: Round.T1,
          fromScore: 65,
          toScore: 80,
        },
      ]);
    });

    it('should compare the requested rounds when they are given', async () => {
      repository.findProvinceRoundScores.mockResolvedValue([
        { round: Round.T2, totalScore: 70, store: { province: 'ระยอง' } },
        { round: Round.T3, totalScore: 84, store: { province: 'ระยอง' } },
      ]);

      const result = await service.getProvinceComparison({ from: Round.T2, to: Round.T3 }, admin);

      expect(repository.findProvinceRoundScores).toHaveBeenCalledWith([Round.T2, Round.T3]);
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

    it('should reject ENTREPRENEUR', async () => {
      await expect(service.getProvinceComparison({}, owner)).rejects.toThrow(ForbiddenException);
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

    it('should reject ENTREPRENEUR', async () => {
      await expect(service.getStoreRoundScores(owner)).rejects.toThrow(ForbiddenException);
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

    it('should reject ENTREPRENEUR', async () => {
      await expect(service.exportStoreRoundScores(owner)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getActivities', () => {
    it('should raise an urgent item for stores still missing T1', async () => {
      repository.countStoresAwaitingT1.mockResolvedValue(36);

      const result = await service.getActivities(admin);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'warning',
        title: 'ร้านอาหาร 36 ร้าน ยังไม่ประเมิน T1',
        urgent: true,
      });
    });

    it('should raise an item for unresolved red flags', async () => {
      repository.countUnresolvedRedFlags.mockResolvedValue(4);

      const result = await service.getActivities(admin);

      expect(result).toHaveLength(1);
      expect(result[0].title).toContain('4');
    });

    it('should return nothing when there is no follow-up', async () => {
      await expect(service.getActivities(admin)).resolves.toEqual([]);
    });

    it('should append published announcements mapped to their feed type', async () => {
      newsService.findAll.mockResolvedValue([
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

    it('should keep auto-generated warnings ahead of announcements', async () => {
      repository.countStoresAwaitingT1.mockResolvedValue(36);
      newsService.findAll.mockResolvedValue([
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

      expect(result[0].title).toContain('ยังไม่ประเมิน T1');
      expect(result[1]).toMatchObject({ type: 'announcement', title: 'ประกาศทั่วไป' });
    });

    it('should reject ENTREPRENEUR', async () => {
      await expect(service.getActivities(owner)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getReportsStatus', () => {
    it('should return an empty list while reports are not persisted', async () => {
      await expect(service.getReportsStatus(admin)).resolves.toEqual([]);
    });

    it('should reject ENTREPRENEUR', async () => {
      await expect(service.getReportsStatus(owner)).rejects.toThrow(ForbiddenException);
    });
  });
});
