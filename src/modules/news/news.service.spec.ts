import { Test, type TestingModule } from '@nestjs/testing';
import { NewsType, Role } from '@prisma/client';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { ForbiddenException, NotFoundException } from '@common/exceptions/app.exception';
import { NEWS_DEFAULT_LIMIT } from './dto/query-news.dto';
import { NewsRepository, type NewsRow } from './news.repository';
import { NewsService } from './news.service';

const admin: JwtPayload = { sub: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
const superAdmin: JwtPayload = {
  sub: 'super-1',
  email: 'super@example.com',
  role: Role.SUPER_ADMIN,
};
const assessor: JwtPayload = { sub: 'assessor-1', email: 'a@example.com', role: Role.ASSESSOR };

function newsRow(overrides: Partial<NewsRow> = {}): NewsRow {
  return {
    id: 'news-1',
    type: NewsType.GENERAL,
    title: 'อัปเดตเกณฑ์การประเมินโครงการ ปี 2569',
    description: 'มีผลตั้งแต่วันที่ 18 พ.ค. 2569 เป็นต้นไป',
    urgent: false,
    publishedAt: new Date('2026-05-18T00:00:00.000Z'),
    authorId: 'admin-1',
    author: { name: 'ผู้ดูแลระบบ' },
    ...overrides,
  };
}

describe('NewsService', () => {
  let service: NewsService;
  let repository: jest.Mocked<NewsRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewsService,
        {
          provide: NewsRepository,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
            findById: jest.fn().mockResolvedValue(null),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NewsService>(NewsService);
    repository = module.get(NewsRepository);
  });

  describe('findAll', () => {
    it('should flatten the author name onto each item', async () => {
      repository.findAll.mockResolvedValue([newsRow()]);

      const result = await service.findAll({});

      expect(result[0].authorName).toBe('ผู้ดูแลระบบ');
      expect(repository.findAll).toHaveBeenCalledWith({
        type: undefined,
        limit: NEWS_DEFAULT_LIMIT,
      });
    });

    it('should pass the type filter and limit through', async () => {
      await service.findAll({ type: NewsType.EVENT, limit: 5 });

      expect(repository.findAll).toHaveBeenCalledWith({ type: NewsType.EVENT, limit: 5 });
    });
  });

  describe('findOne', () => {
    it('should throw when the announcement does not exist', async () => {
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('should return the announcement to a non-admin role', async () => {
      repository.findById.mockResolvedValue(newsRow());

      const result = await service.findOne('news-1');

      expect(result.title).toBe('อัปเดตเกณฑ์การประเมินโครงการ ปี 2569');
    });
  });

  // The dashboard activity feed shows announcements to every role, so this
  // path stays open — it is not reachable through the /news endpoints.
  describe('listForFeed', () => {
    it('should return items without any role check', async () => {
      repository.findAll.mockResolvedValue([newsRow()]);

      const result = await service.listForFeed(3);

      expect(result[0].authorName).toBe('ผู้ดูแลระบบ');
      expect(repository.findAll).toHaveBeenCalledWith({ type: undefined, limit: 3 });
    });
  });

  describe('create', () => {
    it('should publish as the current admin and default urgent to false', async () => {
      repository.create.mockResolvedValue(newsRow());

      await service.create(
        { type: NewsType.GENERAL, title: 'หัวข้อ', description: 'รายละเอียด' },
        admin,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          urgent: false,
          author: { connect: { id: 'admin-1' } },
        }),
      );
    });

    it('should allow SUPER_ADMIN', async () => {
      repository.create.mockResolvedValue(newsRow());

      await expect(
        service.create({ type: NewsType.ALERT, title: 'หัวข้อ', description: 'ราย' }, superAdmin),
      ).resolves.toBeDefined();
    });

    it('should reject a non-admin role', async () => {
      await expect(
        service.create({ type: NewsType.GENERAL, title: 'หัวข้อ', description: 'ราย' }, assessor),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should throw when the announcement does not exist', async () => {
      await expect(service.update('missing', { title: 'ใหม่' }, admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject a non-admin role before touching the repository', async () => {
      await expect(service.update('news-1', { title: 'ใหม่' }, assessor)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.findById).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete an existing announcement', async () => {
      repository.findById.mockResolvedValue(newsRow());
      repository.remove.mockResolvedValue(newsRow());

      await service.remove('news-1', admin);

      expect(repository.remove).toHaveBeenCalledWith('news-1');
    });

    it('should reject a non-admin role', async () => {
      await expect(service.remove('news-1', assessor)).rejects.toThrow(ForbiddenException);
    });
  });
});
