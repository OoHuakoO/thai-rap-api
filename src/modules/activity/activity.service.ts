import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { ForbiddenException, NotFoundException } from '@common/exceptions/app.exception';
import type { PaginatedResult } from '@common/types/api-response.type';
import { ERROR_CODES, PHOTO_ALLOWED_EXTENSIONS, isAdminRole } from '@constants/index';
import { deleteLocalDir, deleteLocalFile, saveLocalFile } from '@shared/file-storage.util';
import { buildPaginatedResult, normalizePagination } from '@shared/pagination.util';
import { ActivityRepository, type ActivityRow } from './activity.repository';
import type { CreateActivityDto } from './dto/create-activity.dto';
import type { QueryActivityDto } from './dto/query-activity.dto';
import type { UpdateActivityDto, UpdateActivityPhotoDto } from './dto/update-activity.dto';
import type { ActivityItem, ActivityPhotoItem } from './types/activity.type';

@Injectable()
export class ActivityService {
  constructor(private readonly activityRepo: ActivityRepository) {}

  // ประมวลภาพกิจกรรม is the programme's public record of what it ran, so every
  // signed-in role reads it — including JUDGE and VIEWER, which are shut out of
  // the announcement feed. Managing one is admin-only, which is the whole of
  // the access rule here: there is no per-record scope to narrow by.
  async findAll(query: QueryActivityDto): Promise<PaginatedResult<ActivityItem>> {
    const { skip, take, page, limit } = normalizePagination(query);
    const filters = { search: query.search, skip, take };

    const [rows, total] = await Promise.all([
      this.activityRepo.findAll(filters),
      this.activityRepo.count(filters),
    ]);
    return buildPaginatedResult(rows.map(toActivityItem), total, page, limit);
  }

  async findOne(id: string): Promise<ActivityItem> {
    return toActivityItem(await this.getActivityOrThrow(id));
  }

  async create(dto: CreateActivityDto, user: JwtPayload): Promise<ActivityItem> {
    this.assertCanWrite(user);

    const row = await this.activityRepo.create({
      title: dto.title,
      description: dto.description,
      activityDate: new Date(dto.activityDate),
      location: dto.location,
      note: dto.note,
      createdBy: { connect: { id: user.sub } },
    });
    return toActivityItem(row);
  }

  async update(id: string, dto: UpdateActivityDto, user: JwtPayload): Promise<ActivityItem> {
    this.assertCanWrite(user);
    await this.getActivityOrThrow(id);

    const row = await this.activityRepo.update(id, {
      title: dto.title,
      description: dto.description,
      activityDate: dto.activityDate ? new Date(dto.activityDate) : undefined,
      location: dto.location,
      note: dto.note,
    });
    return toActivityItem(row);
  }

  async remove(id: string, user: JwtPayload): Promise<void> {
    this.assertCanWrite(user);
    const activity = await this.getActivityOrThrow(id);

    await this.activityRepo.remove(id);
    // The album's whole directory, not just `photos/` — deleting the subdirectory
    // alone leaves an empty `activities/<id>/` behind for every album ever removed.
    await deleteLocalDir(activityDir(id));
    // The directory covers every file this module wrote, but a photo row whose
    // url points elsewhere would survive it — remove those one by one too.
    await Promise.all(
      activity.photos
        .filter((photo) => !photo.url.startsWith(`/uploads/${activityDir(id)}/`))
        .map((photo) => deleteLocalFile(photo.url)),
    );
  }

  async addPhotos(
    id: string,
    files: Express.Multer.File[],
    user: JwtPayload,
  ): Promise<ActivityItem> {
    this.assertCanWrite(user);
    await this.getActivityOrThrow(id);

    let sortOrder = await this.activityRepo.nextSortOrder(id);
    const saved: { url: string; sortOrder: number }[] = [];
    for (const file of files) {
      const stored = await saveLocalFile(
        photoSubdir(id),
        decodeOriginalName(file.originalname),
        file.buffer,
        PHOTO_ALLOWED_EXTENSIONS,
      );
      saved.push({ url: stored.relativeUrl, sortOrder });
      sortOrder += 1;
    }

    const row = await this.activityRepo.addPhotos(id, saved);
    return toActivityItem(row);
  }

  async updatePhoto(
    id: string,
    photoId: string,
    dto: UpdateActivityPhotoDto,
    user: JwtPayload,
  ): Promise<ActivityPhotoItem> {
    this.assertCanWrite(user);
    await this.getPhotoOrThrow(id, photoId);

    const row = await this.activityRepo.updatePhoto(photoId, { sortOrder: dto.sortOrder });
    return toPhotoItem(row);
  }

  async removePhoto(id: string, photoId: string, user: JwtPayload): Promise<void> {
    this.assertCanWrite(user);
    const photo = await this.getPhotoOrThrow(id, photoId);

    await this.activityRepo.removePhoto(photoId);
    await deleteLocalFile(photo.url);
  }

  private async getActivityOrThrow(id: string): Promise<ActivityRow> {
    const row = await this.activityRepo.findById(id);
    if (!row) throw new NotFoundException(ERROR_CODES.ACT.NOT_FOUND, 'ไม่พบกิจกรรม');
    return row;
  }

  private async getPhotoOrThrow(id: string, photoId: string) {
    await this.getActivityOrThrow(id);
    const photo = await this.activityRepo.findPhoto(id, photoId);
    if (!photo) throw new NotFoundException(ERROR_CODES.ACT.PHOTO_NOT_FOUND, 'ไม่พบภาพกิจกรรม');
    return photo;
  }

  private assertCanWrite(user: JwtPayload): void {
    if (!isAdminRole(user.role)) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'เฉพาะ admin หรือ super admin เท่านั้นที่จัดการประมวลภาพกิจกรรมได้',
      );
    }
  }
}

function activityDir(activityId: string): string {
  return `activities/${activityId}`;
}

function photoSubdir(activityId: string): string {
  return `${activityDir(activityId)}/photos`;
}

// Multer decodes a multipart filename as latin1, so a Thai filename arrives
// mojibake — only the extension is read downstream, but it must survive intact.
function decodeOriginalName(originalName: string): string {
  return Buffer.from(originalName, 'latin1').toString('utf8');
}

function toPhotoItem(row: {
  id: string;
  url: string;
  sortOrder: number;
  uploadedAt: Date;
}): ActivityPhotoItem {
  return {
    id: row.id,
    url: row.url,
    sortOrder: row.sortOrder,
    uploadedAt: row.uploadedAt,
  };
}

function toActivityItem(row: ActivityRow): ActivityItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    note: row.note,
    activityDate: row.activityDate,
    location: row.location,
    photoCount: row._count.photos,
    photos: row.photos.map(toPhotoItem),
    createdById: row.createdById,
    createdByName: row.createdBy.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
