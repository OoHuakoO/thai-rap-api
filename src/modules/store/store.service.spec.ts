import { Test, type TestingModule } from '@nestjs/testing';
import { Role, StoreStatus, type Store, type StoreDocument } from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@common/exceptions/app.exception';
import { ERROR_CODES } from '@constants/index';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { saveLocalFile, deleteLocalFile, deleteLocalDir } from '@shared/file-storage.util';
import { ProvinceService } from '@modules/province/province.service';
import { StoreService } from './store.service';
import { StoreRepository } from './store.repository';

jest.mock('@shared/file-storage.util', () => ({
  saveLocalFile: jest.fn(),
  deleteLocalFile: jest.fn(),
  deleteLocalDir: jest.fn(),
}));

const mockedSaveLocalFile = saveLocalFile as jest.MockedFunction<typeof saveLocalFile>;
const mockedDeleteLocalFile = deleteLocalFile as jest.MockedFunction<typeof deleteLocalFile>;
const mockedDeleteLocalDir = deleteLocalDir as jest.MockedFunction<typeof deleteLocalDir>;

const admin: JwtPayload = { sub: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
const assessor: JwtPayload = { sub: 'assessor-1', email: 'a@example.com', role: Role.ASSESSOR };
const owner: JwtPayload = { sub: 'owner-1', email: 'o@example.com', role: Role.ENTREPRENEUR };
const otherOwner: JwtPayload = { sub: 'owner-2', email: 'o2@example.com', role: Role.ENTREPRENEUR };

const mockStore: Store & { documents: StoreDocument[] } = {
  id: 'store-1',
  name: 'ร้านทดสอบ',
  province: 'ชลบุรี',
  storeType: 'อาหารตามสั่ง',
  ownerName: 'สมศรี ใจดี',
  phone: '0812345678',
  email: null,
  address: '123 หมู่ 4',
  socialLinks: {},
  avgRevenueMin: 10000,
  avgRevenueMax: 20000,
  mainProblems: [],
  goals: [],
  menuPhotos: ['/uploads/stores/store-1/menu-photos/a.jpg'],
  coverUrl: '/uploads/stores/store-1/cover/old.jpg',
  storePhotos: ['/uploads/stores/store-1/store-photos/b.jpg'],
  status: StoreStatus.REGISTERED,
  ownerId: 'owner-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  documents: [],
};

const mockDocument: StoreDocument = {
  id: 'doc-1',
  storeId: 'store-1',
  filename: 'plan.pdf',
  fileType: 'application/pdf',
  fileSize: 1234,
  url: '/uploads/stores/store-1/documents/plan.pdf',
  uploadedAt: new Date(),
};

const mockFile = {
  originalname: 'photo.jpg',
  mimetype: 'image/jpeg',
  size: 1024,
  buffer: Buffer.from('data'),
} as Express.Multer.File;

describe('StoreService', () => {
  let service: StoreService;
  let repository: jest.Mocked<StoreRepository>;
  let provinceService: jest.Mocked<ProvinceService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreService,
        {
          provide: StoreRepository,
          useValue: {
            findAll: jest.fn(),
            count: jest.fn(),
            findById: jest.fn(),
            findUserRole: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            countAll: jest.fn(),
            countByStatus: jest.fn(),
            countDistinctStoresByRound: jest.fn(),
            findLatestAssessments: jest.fn().mockResolvedValue(new Map()),
            createDocument: jest.fn(),
            findDocumentById: jest.fn(),
            removeDocument: jest.fn(),
            appendPhoto: jest.fn(),
            removePhoto: jest.fn(),
            findDistinctStoreTypes: jest.fn(),
            countByProvince: jest.fn(),
          },
        },
        {
          provide: ProvinceService,
          useValue: { isValid: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    service = module.get<StoreService>(StoreService);
    repository = module.get(StoreRepository);
    provinceService = module.get(ProvinceService);
  });

  describe('findAll', () => {
    it('should return paginated stores', async () => {
      repository.findAll.mockResolvedValue([mockStore]);
      repository.count.mockResolvedValue(1);

      const result = await service.findAll({}, admin);

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(repository.findAll).toHaveBeenCalledWith({}, 0, 10, undefined);
    });

    it('should scope to owned stores for ENTREPRENEUR', async () => {
      repository.findAll.mockResolvedValue([]);
      repository.count.mockResolvedValue(0);

      await service.findAll({}, owner);

      expect(repository.findAll).toHaveBeenCalledWith({}, 0, 10, owner.sub);
    });
  });

  describe('getStats', () => {
    it('should return stats for ADMIN', async () => {
      repository.countAll.mockResolvedValue(10);
      repository.countDistinctStoresByRound.mockResolvedValue(5);
      repository.countByStatus.mockResolvedValue(2);
      repository.countByProvince.mockResolvedValue([]);
      repository.findDistinctStoreTypes.mockResolvedValue([]);

      const result = await service.getStats(admin);

      expect(result.total).toBe(10);
    });

    it('should return stats for ENTREPRENEUR', async () => {
      repository.countAll.mockResolvedValue(10);
      repository.countDistinctStoresByRound.mockResolvedValue(5);
      repository.countByStatus.mockResolvedValue(2);
      repository.countByProvince.mockResolvedValue([]);
      repository.findDistinctStoreTypes.mockResolvedValue([]);

      const result = await service.getStats(owner);

      expect(result.total).toBe(10);
    });

    it('should throw ForbiddenException for ASSESSOR', async () => {
      await expect(service.getStats(assessor)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.countAll).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return the store', async () => {
      repository.findById.mockResolvedValue(mockStore);

      const result = await service.findOne('store-1', admin);

      expect(result.id).toBe('store-1');
    });

    it('should throw NotFoundException when store does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findOne('missing', admin)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should throw ForbiddenException for ENTREPRENEUR who does not own the store', async () => {
      repository.findById.mockResolvedValue(mockStore);

      await expect(service.findOne('store-1', otherOwner)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('should allow ASSESSOR to read any store', async () => {
      repository.findById.mockResolvedValue(mockStore);

      const result = await service.findOne('store-1', assessor);

      expect(result.id).toBe('store-1');
    });
  });

  describe('create', () => {
    const dto = {
      name: 'ร้านใหม่',
      province: 'ชลบุรี',
      storeType: 'อาหารตามสั่ง',
      ownerName: 'สมชาย',
      phone: '0899999999',
      address: 'addr',
    };

    it('should force ownership to the caller for ENTREPRENEUR', async () => {
      repository.create.mockResolvedValue({ ...mockStore, ownerId: owner.sub });

      await service.create({ ...dto, ownerId: 'someone-else' }, owner);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: owner.sub }),
      );
      expect(repository.findUserRole).not.toHaveBeenCalled();
    });

    it('should validate ownerId for ADMIN', async () => {
      repository.findUserRole.mockResolvedValue({ id: 'owner-1', role: Role.ENTREPRENEUR });
      repository.create.mockResolvedValue(mockStore);

      await service.create({ ...dto, ownerId: 'owner-1' }, admin);

      expect(repository.findUserRole).toHaveBeenCalledWith('owner-1');
    });

    it('should throw BadRequestException when ownerId is not an entrepreneur', async () => {
      repository.findUserRole.mockResolvedValue({ id: 'assessor-1', role: Role.ASSESSOR });

      await expect(service.create({ ...dto, ownerId: 'assessor-1' }, admin)).rejects.toMatchObject({
        code: ERROR_CODES.STORE.INVALID_OWNER,
      });
    });

    it('should throw BadRequestException when ownerId does not exist', async () => {
      repository.findUserRole.mockResolvedValue(null);

      await expect(service.create({ ...dto, ownerId: 'ghost' }, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('should throw ForbiddenException for roles that cannot create stores', async () => {
      await expect(service.create(dto, assessor)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should throw BadRequestException for an invalid province', async () => {
      provinceService.isValid.mockResolvedValue(false);

      await expect(service.create(dto, admin)).rejects.toMatchObject({
        code: ERROR_CODES.STORE.INVALID_PROVINCE,
      });
    });

    it('should throw BadRequestException when avgRevenueMax < avgRevenueMin', async () => {
      await expect(
        service.create({ ...dto, avgRevenueMin: 5000, avgRevenueMax: 1000 }, admin),
      ).rejects.toMatchObject({ code: ERROR_CODES.STORE.INVALID_REVENUE_RANGE });
    });
  });

  describe('update', () => {
    it('should update the store', async () => {
      repository.findById.mockResolvedValue(mockStore);
      repository.update.mockResolvedValue({ ...mockStore, name: 'ชื่อใหม่' });

      const result = await service.update('store-1', { name: 'ชื่อใหม่' }, owner);

      expect(result.name).toBe('ชื่อใหม่');
    });

    it('should throw NotFoundException when store does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.update('missing', {}, admin)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should throw ForbiddenException for a non-owner', async () => {
      repository.findById.mockResolvedValue(mockStore);

      await expect(service.update('store-1', {}, otherOwner)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('should validate the revenue range against stored values', async () => {
      repository.findById.mockResolvedValue(mockStore);

      // stored avgRevenueMin is 10000; new max below it must fail
      await expect(service.update('store-1', { avgRevenueMax: 5000 }, admin)).rejects.toMatchObject(
        { code: ERROR_CODES.STORE.INVALID_REVENUE_RANGE },
      );
    });
  });

  describe('updateStatus', () => {
    it('should update status for ADMIN', async () => {
      repository.findById.mockResolvedValue(mockStore);
      repository.update.mockResolvedValue({ ...mockStore, status: StoreStatus.SELECTED });

      const result = await service.updateStatus('store-1', { status: StoreStatus.SELECTED }, admin);

      expect(result.status).toBe(StoreStatus.SELECTED);
    });

    it('should throw ForbiddenException for non-admin roles', async () => {
      await expect(
        service.updateStatus('store-1', { status: StoreStatus.SELECTED }, owner),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete the store and its uploaded files', async () => {
      repository.findById.mockResolvedValue(mockStore);
      repository.remove.mockResolvedValue(mockStore);

      await service.remove('store-1', admin);

      expect(repository.remove).toHaveBeenCalledWith('store-1');
      expect(mockedDeleteLocalDir).toHaveBeenCalledWith('stores/store-1');
    });

    it('should throw ForbiddenException for a non-owner', async () => {
      repository.findById.mockResolvedValue(mockStore);

      await expect(service.remove('store-1', otherOwner)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });

  describe('uploadDocument', () => {
    it('should save the file and create a document row', async () => {
      repository.findById.mockResolvedValue(mockStore);
      mockedSaveLocalFile.mockResolvedValue({
        storedName: 'x.pdf',
        relativeUrl: '/uploads/stores/store-1/documents/x.pdf',
      });
      repository.createDocument.mockResolvedValue(mockDocument);

      const result = await service.uploadDocument(
        'store-1',
        { ...mockFile, originalname: 'plan.pdf' } as Express.Multer.File,
        owner,
      );

      expect(result.id).toBe('doc-1');
      expect(mockedSaveLocalFile).toHaveBeenCalled();
    });

    it('should throw ForbiddenException for a non-owner', async () => {
      repository.findById.mockResolvedValue(mockStore);

      await expect(service.uploadDocument('store-1', mockFile, otherOwner)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('removeDocument', () => {
    it('should remove the document row and its file', async () => {
      repository.findById.mockResolvedValue(mockStore);
      repository.findDocumentById.mockResolvedValue(mockDocument);
      repository.removeDocument.mockResolvedValue(mockDocument);

      await service.removeDocument('store-1', 'doc-1', owner);

      expect(repository.removeDocument).toHaveBeenCalledWith('doc-1');
      expect(mockedDeleteLocalFile).toHaveBeenCalledWith(mockDocument.url);
    });

    it('should throw NotFoundException when the document belongs to another store', async () => {
      repository.findById.mockResolvedValue(mockStore);
      repository.findDocumentById.mockResolvedValue({ ...mockDocument, storeId: 'other-store' });

      await expect(service.removeDocument('store-1', 'doc-1', owner)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockedDeleteLocalFile).not.toHaveBeenCalled();
    });
  });

  describe('menu photos', () => {
    it('should append the uploaded photo', async () => {
      repository.findById.mockResolvedValue(mockStore);
      mockedSaveLocalFile.mockResolvedValue({
        storedName: 'new.jpg',
        relativeUrl: '/uploads/stores/store-1/menu-photos/new.jpg',
      });
      repository.appendPhoto.mockResolvedValue(['/uploads/stores/store-1/menu-photos/new.jpg']);

      const result = await service.uploadMenuPhoto('store-1', mockFile, owner);

      expect(repository.appendPhoto).toHaveBeenCalledWith(
        'store-1',
        'menuPhotos',
        '/uploads/stores/store-1/menu-photos/new.jpg',
      );
      expect(result).toContain('/uploads/stores/store-1/menu-photos/new.jpg');
    });

    it('should remove the photo and delete its file', async () => {
      repository.findById.mockResolvedValue(mockStore);
      repository.removePhoto.mockResolvedValue({ photos: [], removed: true });

      const url = '/uploads/stores/store-1/menu-photos/a.jpg';
      await service.removeMenuPhoto('store-1', url, owner);

      expect(mockedDeleteLocalFile).toHaveBeenCalledWith(url);
    });

    it('should throw NotFoundException and not touch the disk when the url is not in the store', async () => {
      repository.findById.mockResolvedValue(mockStore);
      repository.removePhoto.mockResolvedValue({ photos: [], removed: false });

      await expect(
        service.removeMenuPhoto('store-1', '/uploads/stores/OTHER/menu-photos/x.jpg', owner),
      ).rejects.toMatchObject({ code: ERROR_CODES.STORE.PHOTO_NOT_FOUND });
      expect(mockedDeleteLocalFile).not.toHaveBeenCalled();
    });
  });

  describe('store photos', () => {
    it('should append the uploaded photo to storePhotos', async () => {
      repository.findById.mockResolvedValue(mockStore);
      mockedSaveLocalFile.mockResolvedValue({
        storedName: 'new.jpg',
        relativeUrl: '/uploads/stores/store-1/store-photos/new.jpg',
      });
      repository.appendPhoto.mockResolvedValue(['/uploads/stores/store-1/store-photos/new.jpg']);

      await service.uploadStorePhoto('store-1', mockFile, owner);

      expect(repository.appendPhoto).toHaveBeenCalledWith(
        'store-1',
        'storePhotos',
        '/uploads/stores/store-1/store-photos/new.jpg',
      );
    });

    it('should throw NotFoundException when the url is not in storePhotos', async () => {
      repository.findById.mockResolvedValue(mockStore);
      repository.removePhoto.mockResolvedValue({ photos: [], removed: false });

      await expect(
        service.removeStorePhoto('store-1', '/uploads/elsewhere.jpg', owner),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockedDeleteLocalFile).not.toHaveBeenCalled();
    });
  });

  describe('cover', () => {
    it('should save the new cover before deleting the old one', async () => {
      const order: string[] = [];
      repository.findById.mockResolvedValue(mockStore);
      mockedSaveLocalFile.mockImplementation(async () => {
        order.push('save');
        return { storedName: 'new.jpg', relativeUrl: '/uploads/stores/store-1/cover/new.jpg' };
      });
      repository.update.mockImplementation(async () => {
        order.push('db');
        return { ...mockStore, coverUrl: '/uploads/stores/store-1/cover/new.jpg' };
      });
      mockedDeleteLocalFile.mockImplementation(async () => {
        order.push('delete-old');
      });

      const result = await service.uploadCover('store-1', mockFile, owner);

      expect(result).toBe('/uploads/stores/store-1/cover/new.jpg');
      expect(order).toEqual(['save', 'db', 'delete-old']);
      expect(mockedDeleteLocalFile).toHaveBeenCalledWith(mockStore.coverUrl);
    });

    it('should clear the cover and delete the file', async () => {
      repository.findById.mockResolvedValue(mockStore);
      repository.update.mockResolvedValue({ ...mockStore, coverUrl: null });

      await service.removeCover('store-1', owner);

      expect(repository.update).toHaveBeenCalledWith('store-1', { coverUrl: null });
      expect(mockedDeleteLocalFile).toHaveBeenCalledWith(mockStore.coverUrl);
    });

    it('should throw ForbiddenException for a non-owner', async () => {
      repository.findById.mockResolvedValue(mockStore);

      await expect(service.uploadCover('store-1', mockFile, otherOwner)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
