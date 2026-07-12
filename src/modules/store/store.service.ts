import { Injectable } from '@nestjs/common';
import { Role, Round, StoreStatus, type Store } from '@prisma/client';
import type { PaginatedResult } from '@common/types/api-response.type';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@common/exceptions/app.exception';
import { ERROR_CODES, STORE_TARGET_TOTAL } from '@constants/index';
import { normalizePagination, buildPaginatedResult } from '@shared/pagination.util';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { ProvinceService } from '@modules/province/province.service';
import { StoreRepository } from './store.repository';
import type { CreateStoreDto } from './dto/create-store.dto';
import type { UpdateStoreDto, UpdateStoreStatusDto } from './dto/update-store.dto';
import type { QueryStoreDto } from './dto/query-store.dto';
import type { StoreStats } from './types/store-stats.type';

const PASSED_STATUSES: StoreStatus[] = [StoreStatus.SELECTED, StoreStatus.CONDITIONAL_SELECTED];

@Injectable()
export class StoreService {
  constructor(
    private readonly storeRepo: StoreRepository,
    private readonly provinceService: ProvinceService,
  ) {}

  async findAll(query: QueryStoreDto, user: JwtPayload): Promise<PaginatedResult<Store>> {
    const { skip, take, page, limit } = normalizePagination(query);
    const ownerId = user.role === Role.ENTREPRENEUR ? user.sub : undefined;
    const [items, total] = await Promise.all([
      this.storeRepo.findAll(query, skip, take, ownerId),
      this.storeRepo.count(query, ownerId),
    ]);
    return buildPaginatedResult(items, total, page, limit);
  }

  async getStats(): Promise<StoreStats> {
    const [total, t0CompletedCount, t1CompletedCount, passedCount, byProvince] = await Promise.all([
      this.storeRepo.countAll(),
      this.storeRepo.countDistinctStoresByRound(Round.T0),
      this.storeRepo.countDistinctStoresByRound(Round.T1),
      this.storeRepo.countByStatus(PASSED_STATUSES),
      this.storeRepo.countByProvince(),
    ]);

    return {
      total,
      targetTotal: STORE_TARGET_TOTAL,
      t0CompletedCount,
      t1CompletedCount,
      passedCount,
      byProvince,
    };
  }

  async findOne(id: string, user: JwtPayload): Promise<Store> {
    const store = await this.getStoreOrThrow(id);
    if (user.role === Role.ENTREPRENEUR && store.ownerId !== user.sub) {
      throw new ForbiddenException(ERROR_CODES.PERM.FORBIDDEN, 'Access denied');
    }
    return store;
  }

  async create(dto: CreateStoreDto, user: JwtPayload): Promise<Store> {
    if (user.role !== Role.ADMIN && user.role !== Role.ENTREPRENEUR) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'Only admins or entrepreneurs can create a store',
      );
    }
    await this.assertValidProvince(dto.province);
    const { ownerId: requestedOwnerId, ...rest } = dto;
    const ownerId = user.role === Role.ENTREPRENEUR ? user.sub : (requestedOwnerId ?? null);
    return this.storeRepo.create({
      ...rest,
      socialLinks: dto.socialLinks ?? {},
      ownerId,
    });
  }

  async update(id: string, dto: UpdateStoreDto, user: JwtPayload): Promise<Store> {
    const store = await this.getStoreOrThrow(id);
    this.assertCanManage(user, store);
    if (dto.province) await this.assertValidProvince(dto.province);
    return this.storeRepo.update(id, dto);
  }

  async updateStatus(id: string, dto: UpdateStoreStatusDto, user: JwtPayload): Promise<Store> {
    this.assertIsAdmin(user);
    await this.getStoreOrThrow(id);
    return this.storeRepo.update(id, { status: dto.status });
  }

  async remove(id: string, user: JwtPayload): Promise<void> {
    const store = await this.getStoreOrThrow(id);
    this.assertCanManage(user, store);
    await this.storeRepo.remove(id);
  }

  private async assertValidProvince(province: string): Promise<void> {
    const isValid = await this.provinceService.isValid(province);
    if (!isValid) {
      throw new BadRequestException(
        ERROR_CODES.STORE.INVALID_PROVINCE,
        `"${province}" is not a valid province`,
      );
    }
  }

  private async getStoreOrThrow(id: string): Promise<Store> {
    const store = await this.storeRepo.findById(id);
    if (!store) throw new NotFoundException(ERROR_CODES.STORE.NOT_FOUND, 'Store not found');
    return store;
  }

  // ADMIN manages every store. ENTREPRENEUR manages only the store they own —
  // ownership is set at creation time via Store.ownerId and never reassigned here.
  private assertCanManage(user: JwtPayload, store: Store): void {
    if (user.role === Role.ADMIN) return;
    if (user.role === Role.ENTREPRENEUR && store.ownerId === user.sub) return;
    throw new ForbiddenException(ERROR_CODES.PERM.FORBIDDEN, 'Access denied');
  }

  private assertIsAdmin(user: JwtPayload): void {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'Only admins can perform this action',
      );
    }
  }
}
