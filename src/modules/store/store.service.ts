import { Injectable } from '@nestjs/common';
import { Role, Round, StoreStatus, type Store } from '@prisma/client';
import type { PaginatedResult } from '@common/types/api-response.type';
import { NotFoundException, ForbiddenException } from '@common/exceptions/app.exception';
import { ERROR_CODES, STORE_TARGET_TOTAL } from '@constants/index';
import { normalizePagination, buildPaginatedResult } from '@shared/pagination.util';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { StoreRepository } from './store.repository';
import type { CreateStoreDto } from './dto/create-store.dto';
import type { UpdateStoreDto, UpdateStoreStatusDto } from './dto/update-store.dto';
import type { QueryStoreDto } from './dto/query-store.dto';
import type { StoreStats } from './types/store-stats.type';

const PASSED_STATUSES: StoreStatus[] = [StoreStatus.SELECTED, StoreStatus.CONDITIONAL_SELECTED];

@Injectable()
export class StoreService {
  constructor(private readonly storeRepo: StoreRepository) {}

  async findAll(query: QueryStoreDto): Promise<PaginatedResult<Store>> {
    const { skip, take, page, limit } = normalizePagination(query);
    const [items, total] = await Promise.all([
      this.storeRepo.findAll(query, skip, take),
      this.storeRepo.count(query),
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

  async findOne(id: string): Promise<Store> {
    const store = await this.storeRepo.findById(id);
    if (!store) throw new NotFoundException(ERROR_CODES.STORE.NOT_FOUND, 'Store not found');
    return store;
  }

  async create(dto: CreateStoreDto, user: JwtPayload): Promise<Store> {
    this.assertCanWrite(user);
    return this.storeRepo.create({
      ...dto,
      socialLinks: dto.socialLinks ?? {},
    });
  }

  async update(id: string, dto: UpdateStoreDto, user: JwtPayload): Promise<Store> {
    this.assertCanWrite(user);
    await this.findOne(id);
    return this.storeRepo.update(id, dto);
  }

  async updateStatus(id: string, dto: UpdateStoreStatusDto, user: JwtPayload): Promise<Store> {
    this.assertCanWrite(user);
    await this.findOne(id);
    return this.storeRepo.update(id, { status: dto.status });
  }

  async remove(id: string, user: JwtPayload): Promise<void> {
    this.assertCanWrite(user);
    await this.findOne(id);
    await this.storeRepo.remove(id);
  }

  // Store CRUD writes are ADMIN-only for this phase — assessor/mentor/entrepreneur
  // read-only access and assignment/ownership-scoped filtering are tracked as a
  // later epic once Store gains an `ownerId` and assignment-role distinction.
  private assertCanWrite(user: JwtPayload): void {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException(ERROR_CODES.PERM.FORBIDDEN, 'Only admins can manage stores');
    }
  }
}
