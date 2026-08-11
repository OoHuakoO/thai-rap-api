import { Test, type TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { ForbiddenException, NotFoundException } from '@common/exceptions/app.exception';
import { ActivityRepository, type ActivityRow } from './activity.repository';
import { ActivityService } from './activity.service';

jest.mock('@shared/file-storage.util', () => ({
  saveLocalFile: jest.fn(async (subdir: string, originalName: string) => ({
    storedName: originalName,
    relativeUrl: `/uploads/${subdir}/${originalName}`,
  })),
  deleteLocalFile: jest.fn(async () => undefined),
  deleteLocalDir: jest.fn(async () => undefined),
}));

import { deleteLocalDir, deleteLocalFile, saveLocalFile } from '@shared/file-storage.util';

const admin: JwtPayload = { sub: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
const superAdmin: JwtPayload = {
  sub: 'super-1',
  email: 'super@example.com',
  role: Role.SUPER_ADMIN,
};
const viewer: JwtPayload = { sub: 'viewer-1', email: 'v@example.com', role: Role.VIEWER };

function activityRow(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: 'act-1',
    title: 'ค่ายอบรมผู้ประกอบการ รุ่นที่ 1',
    description: 'อบรมเข้มข้น 3 วัน',
    note: null,
    activityDate: new Date('2026-06-14T00:00:00.000Z'),
    location: 'กรุงเทพฯ',
    createdById: 'admin-1',
    createdAt: new Date('2026-06-15T00:00:00.000Z'),
    updatedAt: new Date('2026-06-15T00:00:00.000Z'),
    createdBy: { name: 'ผู้ดูแลระบบ' },
    _count: { photos: 1 },
    photos: [
      {
        id: 'photo-1',
        url: '/uploads/activities/act-1/photos/a.jpg',
        sortOrder: 0,
        uploadedAt: new Date('2026-06-15T00:00:00.000Z'),
      },
    ],
    ...overrides,
  };
}

function upload(name: string): Express.Multer.File {
  return { originalname: name, buffer: Buffer.from('x') } as Express.Multer.File;
}

describe('ActivityService', () => {
  let service: ActivityService;
  let repository: jest.Mocked<ActivityRepository>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        {
          provide: ActivityRepository,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
            findById: jest.fn().mockResolvedValue(null),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            addPhotos: jest.fn(),
            findPhoto: jest.fn().mockResolvedValue(null),
            updatePhoto: jest.fn(),
            removePhoto: jest.fn(),
            nextSortOrder: jest.fn().mockResolvedValue(0),
          },
        },
      ],
    }).compile();

    service = module.get<ActivityService>(ActivityService);
    repository = module.get(ActivityRepository);
  });

  describe('findAll', () => {
    it('should flatten the author name and photo count onto each row', async () => {
      repository.findAll.mockResolvedValue([activityRow()]);
      repository.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result.items[0].createdByName).toBe('ผู้ดูแลระบบ');
      expect(result.items[0].photoCount).toBe(1);
      expect(result.meta.total).toBe(1);
    });

    it('should pass the search filter and default paging through', async () => {
      await service.findAll({ search: 'ค่าย' });

      expect(repository.findAll).toHaveBeenCalledWith({ search: 'ค่าย', skip: 0, take: 10 });
    });
  });

  describe('findOne', () => {
    it('should throw when the activity does not exist', async () => {
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    // Reads are open to every signed-in role — the album is the programme's
    // public record, so there is no caller to check here at all.
    it('should return the album without asking who is calling', async () => {
      repository.findById.mockResolvedValue(activityRow());

      const result = await service.findOne('act-1');

      expect(result.photos).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('should record the current admin as the author', async () => {
      repository.create.mockResolvedValue(activityRow());

      await service.create(
        { title: 'ชื่อ', description: 'ราย', activityDate: '2026-06-14T00:00:00.000Z' },
        admin,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activityDate: new Date('2026-06-14T00:00:00.000Z'),
          createdBy: { connect: { id: 'admin-1' } },
        }),
      );
    });

    it('should allow SUPER_ADMIN', async () => {
      repository.create.mockResolvedValue(activityRow());

      await expect(
        service.create(
          { title: 'ชื่อ', description: 'ราย', activityDate: '2026-06-14T00:00:00.000Z' },
          superAdmin,
        ),
      ).resolves.toBeDefined();
    });

    it('should reject a non-admin role', async () => {
      await expect(
        service.create(
          { title: 'ชื่อ', description: 'ราย', activityDate: '2026-06-14T00:00:00.000Z' },
          viewer,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should throw when the activity does not exist', async () => {
      await expect(service.update('missing', { title: 'ใหม่' }, admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject a non-admin role before touching the repository', async () => {
      await expect(service.update('act-1', { title: 'ใหม่' }, viewer)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.findById).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    // The album's own directory, not the photos subdirectory inside it — the
    // subdirectory alone leaves an empty parent behind for every album removed.
    it('should delete the row and the whole album directory behind it', async () => {
      repository.findById.mockResolvedValue(activityRow());

      await service.remove('act-1', admin);

      expect(repository.remove).toHaveBeenCalledWith('act-1');
      expect(deleteLocalDir).toHaveBeenCalledWith('activities/act-1');
      expect(deleteLocalFile).not.toHaveBeenCalled();
    });

    // A photo stored outside this album's directory is not covered by the
    // directory delete, so it has to be unlinked on its own.
    it('should unlink a photo stored outside the album directory', async () => {
      repository.findById.mockResolvedValue(
        activityRow({
          photos: [
            {
              id: 'photo-9',
              url: '/uploads/legacy/a.jpg',
              sortOrder: 0,
              uploadedAt: new Date(),
            },
          ],
        }),
      );

      await service.remove('act-1', admin);

      expect(deleteLocalFile).toHaveBeenCalledWith('/uploads/legacy/a.jpg');
    });

    it('should reject a non-admin role', async () => {
      await expect(service.remove('act-1', viewer)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addPhotos', () => {
    it('should append uploads after the photos already in the album', async () => {
      repository.findById.mockResolvedValue(activityRow());
      repository.nextSortOrder.mockResolvedValue(3);
      repository.addPhotos.mockResolvedValue(activityRow());

      await service.addPhotos('act-1', [upload('one.jpg'), upload('two.png')], admin);

      expect(saveLocalFile).toHaveBeenCalledTimes(2);
      expect(repository.addPhotos).toHaveBeenCalledWith('act-1', [
        { url: '/uploads/activities/act-1/photos/one.jpg', sortOrder: 3 },
        { url: '/uploads/activities/act-1/photos/two.png', sortOrder: 4 },
      ]);
    });

    it('should throw when the activity does not exist', async () => {
      await expect(service.addPhotos('missing', [upload('a.jpg')], admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject a non-admin role', async () => {
      await expect(service.addPhotos('act-1', [upload('a.jpg')], viewer)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('photo writes', () => {
    it('should throw when the photo belongs to another album', async () => {
      repository.findById.mockResolvedValue(activityRow());

      await expect(service.updatePhoto('act-1', 'other', { sortOrder: 1 }, admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete the stored file with the row', async () => {
      repository.findById.mockResolvedValue(activityRow());
      repository.findPhoto.mockResolvedValue({
        id: 'photo-1',
        url: '/uploads/activities/act-1/photos/a.jpg',
        sortOrder: 0,
        uploadedAt: new Date(),
      });

      await service.removePhoto('act-1', 'photo-1', admin);

      expect(repository.removePhoto).toHaveBeenCalledWith('photo-1');
      expect(deleteLocalFile).toHaveBeenCalledWith('/uploads/activities/act-1/photos/a.jpg');
    });

    it('should reject a non-admin role', async () => {
      await expect(service.removePhoto('act-1', 'photo-1', viewer)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
