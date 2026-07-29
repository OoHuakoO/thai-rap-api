import { Injectable } from '@nestjs/common';
import { Prisma, type Role, type UserStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import type { QueryUserDto } from './dto/query-user.dto';

// `password` is absent by construction, not stripped afterwards — every read in
// this module goes through here, so the hash cannot leak into a response by
// someone forgetting to omit it.
const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
  assignedStores: { select: { id: true, code: true, name: true } },
  ownedStores: { select: { id: true, code: true, name: true } },
} satisfies Prisma.UserSelect;

export type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(query: QueryUserDto): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    if (query.search) {
      where.OR = [{ name: { contains: query.search } }, { email: { contains: query.search } }];
    }
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    return where;
  }

  findAll(query: QueryUserDto, skip: number, take: number): Promise<UserRow[]> {
    return this.prisma.user.findMany({
      where: this.buildWhere(query),
      select: USER_SELECT,
      skip,
      take,
      // Newest first, not "pending first": MySQL orders an enum by declaration
      // order (ACTIVE, PENDING, SUSPENDED), so sorting on `status` would bury
      // pending sign-ups behind every active account. The web surfaces them
      // through the pending count and the status filter instead.
      orderBy: { createdAt: 'desc' },
    });
  }

  count(query: QueryUserDto): Promise<number> {
    return this.prisma.user.count({ where: this.buildWhere(query) });
  }

  countByStatus(status: UserStatus): Promise<number> {
    return this.prisma.user.count({ where: { status } });
  }

  findById(id: string): Promise<UserRow | null> {
    return this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  }

  updateStatus(id: string, status: UserStatus): Promise<UserRow> {
    return this.prisma.user.update({ where: { id }, data: { status }, select: USER_SELECT });
  }

  updateRole(id: string, role: Role): Promise<UserRow> {
    return this.prisma.user.update({ where: { id }, data: { role }, select: USER_SELECT });
  }

  // `set` is the whole point: the payload is the complete assignment list, so a
  // store dropped from it must lose the link rather than accumulate forever.
  setAssignedStores(id: string, storeIds: string[]): Promise<UserRow> {
    return this.prisma.user.update({
      where: { id },
      data: { assignedStores: { set: storeIds.map((storeId) => ({ id: storeId })) } },
      select: USER_SELECT,
    });
  }

  // Store.ownerId is nullable, so `set` disconnects the stores this user no
  // longer owns (ownerId → null) instead of failing on a required relation.
  setOwnedStores(id: string, storeIds: string[]): Promise<UserRow> {
    return this.prisma.user.update({
      where: { id },
      data: { ownedStores: { set: storeIds.map((storeId) => ({ id: storeId })) } },
      select: USER_SELECT,
    });
  }

  // Store ids arrive from the client, and Prisma's `set` silently ignores ids
  // that do not exist — counting them here is what turns a typo into a 404
  // instead of a half-applied assignment.
  countStoresByIds(storeIds: string[]): Promise<number> {
    return this.prisma.store.count({ where: { id: { in: storeIds } } });
  }

  countAssessmentsByAssessor(id: string): Promise<number> {
    return this.prisma.assessment.count({ where: { assessorId: id } });
  }

  remove(id: string): Promise<UserRow> {
    return this.prisma.user.delete({ where: { id }, select: USER_SELECT });
  }

  revokeRefreshToken(id: string): Promise<Prisma.BatchPayload> {
    return this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
