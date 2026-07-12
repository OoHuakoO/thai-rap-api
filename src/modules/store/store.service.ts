import { Injectable } from '@nestjs/common';
import { Role, Round, StoreStatus, type Store, type StoreDocument } from '@prisma/client';
import type { PaginatedResult } from '@common/types/api-response.type';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@common/exceptions/app.exception';
import { ERROR_CODES, STORE_TARGET_TOTAL } from '@constants/index';
import { normalizePagination, buildPaginatedResult } from '@shared/pagination.util';
import { saveLocalFile, deleteLocalFile } from '@shared/file-storage.util';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { ProvinceService } from '@modules/province/province.service';
import { StoreRepository } from './store.repository';
import type { CreateStoreDto } from './dto/create-store.dto';
import type { UpdateStoreDto, UpdateStoreStatusDto } from './dto/update-store.dto';
import type { QueryStoreDto } from './dto/query-store.dto';
import type { StoreStats } from './types/store-stats.type';
import type { LatestAssessmentInfo, StoreResult } from './types/store-result.type';

const PASSED_STATUSES: StoreStatus[] = [StoreStatus.SELECTED, StoreStatus.CONDITIONAL_SELECTED];

@Injectable()
export class StoreService {
  constructor(
    private readonly storeRepo: StoreRepository,
    private readonly provinceService: ProvinceService,
  ) {}

  async findAll(query: QueryStoreDto, user: JwtPayload): Promise<PaginatedResult<StoreResult>> {
    const { skip, take, page, limit } = normalizePagination(query);
    const ownerId = user.role === Role.ENTREPRENEUR ? user.sub : undefined;
    const [items, total] = await Promise.all([
      this.storeRepo.findAll(query, skip, take, ownerId),
      this.storeRepo.count(query, ownerId),
    ]);
    const latestMap = await this.storeRepo.findLatestAssessments(items.map((s) => s.id));
    const results = items.map((s) => this.toResult(s, [], latestMap.get(s.id)));
    return buildPaginatedResult(results, total, page, limit);
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

  async findOne(id: string, user: JwtPayload): Promise<StoreResult> {
    const store = await this.getStoreOrThrow(id);
    if (user.role === Role.ENTREPRENEUR && store.ownerId !== user.sub) {
      throw new ForbiddenException(ERROR_CODES.PERM.FORBIDDEN, 'Access denied');
    }
    const latestMap = await this.storeRepo.findLatestAssessments([id]);
    return this.toResult(store, store.documents, latestMap.get(id));
  }

  async create(dto: CreateStoreDto, user: JwtPayload): Promise<StoreResult> {
    if (user.role !== Role.ADMIN && user.role !== Role.ENTREPRENEUR) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'Only admins or entrepreneurs can create a store',
      );
    }
    await this.assertValidProvince(dto.province);
    const { ownerId: requestedOwnerId, ...rest } = dto;
    const ownerId = user.role === Role.ENTREPRENEUR ? user.sub : (requestedOwnerId ?? null);
    const created = await this.storeRepo.create({
      ...rest,
      socialLinks: dto.socialLinks ?? {},
      ownerId,
    });
    return this.toResult(created, []);
  }

  async update(id: string, dto: UpdateStoreDto, user: JwtPayload): Promise<StoreResult> {
    const store = await this.getStoreOrThrow(id);
    this.assertCanManage(user, store);
    if (dto.province) await this.assertValidProvince(dto.province);
    const updated = await this.storeRepo.update(id, dto);
    return this.toResult(updated, store.documents);
  }

  async updateStatus(
    id: string,
    dto: UpdateStoreStatusDto,
    user: JwtPayload,
  ): Promise<StoreResult> {
    this.assertIsAdmin(user);
    const store = await this.getStoreOrThrow(id);
    const updated = await this.storeRepo.update(id, { status: dto.status });
    return this.toResult(updated, store.documents);
  }

  async remove(id: string, user: JwtPayload): Promise<void> {
    const store = await this.getStoreOrThrow(id);
    this.assertCanManage(user, store);
    await this.storeRepo.remove(id);
  }

  async uploadDocument(
    id: string,
    file: Express.Multer.File,
    user: JwtPayload,
  ): Promise<StoreResult['documents'][number]> {
    const store = await this.getStoreOrThrow(id);
    this.assertCanManage(user, store);

    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const saved = await saveLocalFile(`stores/${id}/documents`, originalName, file.buffer);
    const doc = await this.storeRepo.createDocument(id, {
      filename: originalName,
      fileType: file.mimetype,
      fileSize: file.size,
      url: saved.relativeUrl,
    });
    return this.toDocumentResult(doc);
  }

  async removeDocument(id: string, documentId: string, user: JwtPayload): Promise<void> {
    const store = await this.getStoreOrThrow(id);
    this.assertCanManage(user, store);

    const doc = await this.storeRepo.findDocumentById(documentId);
    if (!doc || doc.storeId !== id) {
      throw new NotFoundException(ERROR_CODES.STORE.DOCUMENT_NOT_FOUND, 'Document not found');
    }
    await this.storeRepo.removeDocument(documentId);
    await deleteLocalFile(doc.url);
  }

  async uploadPhoto(id: string, file: Express.Multer.File, user: JwtPayload): Promise<string[]> {
    const store = await this.getStoreOrThrow(id);
    this.assertCanManage(user, store);

    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const saved = await saveLocalFile(`stores/${id}/photos`, originalName, file.buffer);
    const photos = [...(store.photos as string[]), saved.relativeUrl];
    const updated = await this.storeRepo.updatePhotos(id, photos);
    return updated.photos as string[];
  }

  async removePhoto(id: string, url: string, user: JwtPayload): Promise<string[]> {
    const store = await this.getStoreOrThrow(id);
    this.assertCanManage(user, store);

    const photos = (store.photos as string[]).filter((p) => p !== url);
    const updated = await this.storeRepo.updatePhotos(id, photos);
    await deleteLocalFile(url);
    return updated.photos as string[];
  }

  async uploadLogo(id: string, file: Express.Multer.File, user: JwtPayload): Promise<string> {
    const store = await this.getStoreOrThrow(id);
    this.assertCanManage(user, store);

    if (store.logoUrl) await deleteLocalFile(store.logoUrl);

    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const saved = await saveLocalFile(`stores/${id}/logo`, originalName, file.buffer);
    const updated = await this.storeRepo.update(id, { logoUrl: saved.relativeUrl });
    return updated.logoUrl as string;
  }

  async removeLogo(id: string, user: JwtPayload): Promise<null> {
    const store = await this.getStoreOrThrow(id);
    this.assertCanManage(user, store);

    if (store.logoUrl) await deleteLocalFile(store.logoUrl);
    await this.storeRepo.update(id, { logoUrl: null });
    return null;
  }

  async uploadStorefrontPhoto(
    id: string,
    file: Express.Multer.File,
    user: JwtPayload,
  ): Promise<string[]> {
    const store = await this.getStoreOrThrow(id);
    this.assertCanManage(user, store);

    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const saved = await saveLocalFile(`stores/${id}/storefront-photos`, originalName, file.buffer);
    const photos = [...(store.storefrontPhotos as string[]), saved.relativeUrl];
    const updated = await this.storeRepo.update(id, { storefrontPhotos: photos });
    return updated.storefrontPhotos as string[];
  }

  async removeStorefrontPhoto(id: string, url: string, user: JwtPayload): Promise<string[]> {
    const store = await this.getStoreOrThrow(id);
    this.assertCanManage(user, store);

    const photos = (store.storefrontPhotos as string[]).filter((p) => p !== url);
    const updated = await this.storeRepo.update(id, { storefrontPhotos: photos });
    await deleteLocalFile(url);
    return updated.storefrontPhotos as string[];
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

  private async getStoreOrThrow(id: string): Promise<Store & { documents: StoreDocument[] }> {
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

  private toDocumentResult(doc: StoreDocument): StoreResult['documents'][number] {
    return {
      id: doc.id,
      filename: doc.filename,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      url: doc.url,
      uploadedAt: doc.uploadedAt,
    };
  }

  private toResult(
    store: Store,
    documents: StoreDocument[],
    latest?: LatestAssessmentInfo,
  ): StoreResult {
    return {
      id: store.id,
      name: store.name,
      province: store.province,
      storeType: store.storeType,
      ownerName: store.ownerName,
      phone: store.phone,
      email: store.email,
      address: store.address,
      socialLinks: store.socialLinks as Record<string, string>,
      avgRevenue: store.avgRevenue,
      mainProblems: store.mainProblems as string[],
      goals: store.goals as string[],
      photos: store.photos as string[],
      logoUrl: store.logoUrl,
      storefrontPhotos: store.storefrontPhotos as string[],
      documents: documents.map((d) => this.toDocumentResult(d)),
      status: store.status,
      ownerId: store.ownerId,
      latestScore: latest?.totalScore ?? null,
      latestAssessorName: latest?.assessorName ?? null,
      latestAssessedAt: latest?.submittedAt ?? null,
      createdAt: store.createdAt,
      updatedAt: store.updatedAt,
    };
  }
}
