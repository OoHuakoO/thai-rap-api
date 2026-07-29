import { Test, type TestingModule } from '@nestjs/testing';
import { Role, UserStatus } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@common/exceptions/app.exception';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { UserService } from './user.service';
import { UserRepository, type UserRow } from './user.repository';

const superAdmin: JwtPayload = { sub: 'su-1', email: 'su@example.com', role: Role.SUPER_ADMIN };
const admin: JwtPayload = { sub: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };

const mockUser: UserRow = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  role: Role.ASSESSOR,
  status: UserStatus.PENDING,
  lastLogin: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  assignedStores: [],
  ownedStores: [],
};

describe('UserService', () => {
  let service: UserService;
  let repository: jest.Mocked<UserRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: UserRepository,
          useValue: {
            findAll: jest.fn(),
            count: jest.fn(),
            countByStatus: jest.fn(),
            findById: jest.fn(),
            updateStatus: jest.fn(),
            updateRole: jest.fn(),
            setAssignedStores: jest.fn(),
            setOwnedStores: jest.fn(),
            countStoresByIds: jest.fn(),
            countAssessmentsByAssessor: jest.fn(),
            remove: jest.fn(),
            revokeRefreshToken: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repository = module.get(UserRepository);
  });

  describe('findAll', () => {
    it('should return a paginated list for a super admin', async () => {
      repository.findAll.mockResolvedValue([mockUser]);
      repository.count.mockResolvedValue(1);

      const result = await service.findAll({}, superAdmin);

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should throw ForbiddenException for an admin', async () => {
      await expect(service.findAll({}, admin)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('approve', () => {
    it('should move a pending account to ACTIVE', async () => {
      repository.findById.mockResolvedValue(mockUser);
      repository.updateStatus.mockResolvedValue({ ...mockUser, status: UserStatus.ACTIVE });

      const result = await service.approve('user-1', superAdmin);

      expect(repository.updateStatus).toHaveBeenCalledWith('user-1', UserStatus.ACTIVE);
      expect(result.status).toBe(UserStatus.ACTIVE);
    });

    it('should throw NotFoundException when the user does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.approve('nope', superAdmin)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should throw ConflictException when the account is already active', async () => {
      repository.findById.mockResolvedValue({ ...mockUser, status: UserStatus.ACTIVE });

      await expect(service.approve('user-1', superAdmin)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('suspend', () => {
    it('should suspend the account and revoke its refresh token', async () => {
      repository.findById.mockResolvedValue({ ...mockUser, status: UserStatus.ACTIVE });
      repository.updateStatus.mockResolvedValue({ ...mockUser, status: UserStatus.SUSPENDED });
      repository.revokeRefreshToken.mockResolvedValue({ count: 1 });

      const result = await service.suspend('user-1', superAdmin);

      expect(result.status).toBe(UserStatus.SUSPENDED);
      expect(repository.revokeRefreshToken).toHaveBeenCalledWith('user-1');
    });

    it('should throw BadRequestException when suspending yourself', async () => {
      await expect(service.suspend('su-1', superAdmin)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should throw ForbiddenException when the target is a super admin', async () => {
      repository.findById.mockResolvedValue({ ...mockUser, role: Role.SUPER_ADMIN });

      await expect(service.suspend('user-1', superAdmin)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('assignStores', () => {
    it('should replace the assessor assignment list', async () => {
      repository.findById.mockResolvedValue(mockUser);
      repository.countStoresByIds.mockResolvedValue(2);
      repository.setAssignedStores.mockResolvedValue({
        ...mockUser,
        assignedStores: [
          { id: 's1', code: 'RAP69-001', name: 'ร้าน ก' },
          { id: 's2', code: 'RAP69-002', name: 'ร้าน ข' },
        ],
      });

      const result = await service.assignStores('user-1', { storeIds: ['s1', 's2'] }, superAdmin);

      expect(repository.setAssignedStores).toHaveBeenCalledWith('user-1', ['s1', 's2']);
      expect(result.assignedStoreIds).toEqual(['s1', 's2']);
    });

    it('should throw BadRequestException when the user is not an assessor', async () => {
      repository.findById.mockResolvedValue({ ...mockUser, role: Role.MENTOR });

      await expect(
        service.assignStores('user-1', { storeIds: ['s1'] }, superAdmin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should throw NotFoundException when a store id does not exist', async () => {
      repository.findById.mockResolvedValue(mockUser);
      repository.countStoresByIds.mockResolvedValue(1);

      await expect(
        service.assignStores('user-1', { storeIds: ['s1', 'ghost'] }, superAdmin),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('assignOwnedStores', () => {
    it('should replace the owned store list for an entrepreneur', async () => {
      repository.findById.mockResolvedValue({ ...mockUser, role: Role.ENTREPRENEUR });
      repository.countStoresByIds.mockResolvedValue(1);
      repository.setOwnedStores.mockResolvedValue({
        ...mockUser,
        role: Role.ENTREPRENEUR,
        ownedStores: [{ id: 's1', code: 'RAP69-001', name: 'ร้าน ก' }],
      });

      const result = await service.assignOwnedStores('user-1', { storeIds: ['s1'] }, superAdmin);

      expect(result.ownedStoreIds).toEqual(['s1']);
    });

    it('should throw BadRequestException when the user is not an entrepreneur', async () => {
      repository.findById.mockResolvedValue(mockUser);

      await expect(
        service.assignOwnedStores('user-1', { storeIds: ['s1'] }, superAdmin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateRole', () => {
    it('should change the role when no store links stand in the way', async () => {
      repository.findById.mockResolvedValue(mockUser);
      repository.updateRole.mockResolvedValue({ ...mockUser, role: Role.MENTOR });

      const result = await service.updateRole('user-1', { role: Role.MENTOR }, superAdmin);

      expect(result.role).toBe(Role.MENTOR);
    });

    it('should throw BadRequestException when the assessor still holds assignments', async () => {
      repository.findById.mockResolvedValue({
        ...mockUser,
        assignedStores: [{ id: 's1', code: 'RAP69-001', name: 'ร้าน ก' }],
      });

      await expect(
        service.updateRole('user-1', { role: Role.MENTOR }, superAdmin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should delete a user with no assessments and no owned stores', async () => {
      repository.findById.mockResolvedValue(mockUser);
      repository.countAssessmentsByAssessor.mockResolvedValue(0);
      repository.remove.mockResolvedValue(mockUser);

      await service.remove('user-1', superAdmin);

      expect(repository.remove).toHaveBeenCalledWith('user-1');
    });

    it('should throw ConflictException when the user has scored assessments', async () => {
      repository.findById.mockResolvedValue(mockUser);
      repository.countAssessmentsByAssessor.mockResolvedValue(3);

      await expect(service.remove('user-1', superAdmin)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
