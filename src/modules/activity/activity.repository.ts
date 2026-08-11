import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';

const PHOTO_SELECT = {
  id: true,
  url: true,
  sortOrder: true,
  uploadedAt: true,
} satisfies Prisma.ActivityPhotoSelect;

const PHOTO_ORDER: Prisma.ActivityPhotoOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { uploadedAt: 'asc' },
];

// A list row carries a thumbnail strip, not the whole album — `_count` is what
// tells the caller how many photos are really behind it.
export const ACTIVITY_LIST_PHOTO_PREVIEW = 4;

const ACTIVITY_SELECT = {
  id: true,
  title: true,
  description: true,
  note: true,
  activityDate: true,
  location: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { name: true } },
  _count: { select: { photos: true } },
} satisfies Prisma.ActivitySelect;

const LIST_SELECT = {
  ...ACTIVITY_SELECT,
  photos: { select: PHOTO_SELECT, orderBy: PHOTO_ORDER, take: ACTIVITY_LIST_PHOTO_PREVIEW },
} satisfies Prisma.ActivitySelect;

const DETAIL_SELECT = {
  ...ACTIVITY_SELECT,
  photos: { select: PHOTO_SELECT, orderBy: PHOTO_ORDER },
} satisfies Prisma.ActivitySelect;

export type ActivityRow = Prisma.ActivityGetPayload<{ select: typeof DETAIL_SELECT }>;
export type ActivityPhotoRow = Prisma.ActivityPhotoGetPayload<{ select: typeof PHOTO_SELECT }>;

export interface ActivityFilters {
  search?: string;
  skip: number;
  take: number;
}

function buildWhere(filters: Pick<ActivityFilters, 'search'>): Prisma.ActivityWhereInput {
  if (!filters.search) return {};
  return {
    OR: [{ title: { contains: filters.search } }, { location: { contains: filters.search } }],
  };
}

@Injectable()
export class ActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: ActivityFilters): Promise<ActivityRow[]> {
    return this.prisma.activity.findMany({
      where: buildWhere(filters),
      orderBy: [{ activityDate: 'desc' }, { createdAt: 'desc' }],
      skip: filters.skip,
      take: filters.take,
      select: LIST_SELECT,
    });
  }

  count(filters: Pick<ActivityFilters, 'search'>): Promise<number> {
    return this.prisma.activity.count({ where: buildWhere(filters) });
  }

  findById(id: string): Promise<ActivityRow | null> {
    return this.prisma.activity.findUnique({ where: { id }, select: DETAIL_SELECT });
  }

  create(data: Prisma.ActivityCreateInput): Promise<ActivityRow> {
    return this.prisma.activity.create({ data, select: DETAIL_SELECT });
  }

  update(id: string, data: Prisma.ActivityUpdateInput): Promise<ActivityRow> {
    return this.prisma.activity.update({ where: { id }, data, select: DETAIL_SELECT });
  }

  // The photo rows go with it through the schema's onDelete: Cascade; the files
  // they point at are removed by the service, which read them first.
  async remove(id: string): Promise<void> {
    await this.prisma.activity.delete({ where: { id } });
  }

  async addPhotos(
    activityId: string,
    photos: { url: string; sortOrder: number }[],
  ): Promise<ActivityRow> {
    await this.prisma.activityPhoto.createMany({
      data: photos.map((photo) => ({ ...photo, activityId })),
    });
    return this.prisma.activity.findUniqueOrThrow({
      where: { id: activityId },
      select: DETAIL_SELECT,
    });
  }

  findPhoto(activityId: string, photoId: string): Promise<ActivityPhotoRow | null> {
    return this.prisma.activityPhoto.findFirst({
      where: { id: photoId, activityId },
      select: PHOTO_SELECT,
    });
  }

  updatePhoto(photoId: string, data: Prisma.ActivityPhotoUpdateInput): Promise<ActivityPhotoRow> {
    return this.prisma.activityPhoto.update({
      where: { id: photoId },
      data,
      select: PHOTO_SELECT,
    });
  }

  async removePhoto(photoId: string): Promise<void> {
    await this.prisma.activityPhoto.delete({ where: { id: photoId } });
  }

  async nextSortOrder(activityId: string): Promise<number> {
    const last = await this.prisma.activityPhoto.findFirst({
      where: { activityId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return last ? last.sortOrder + 1 : 0;
  }
}
