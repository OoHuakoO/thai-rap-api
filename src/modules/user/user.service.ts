import { Injectable } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@common/exceptions/app.exception';
import { ASSIGNMENT_SCOPED_ROLES, ERROR_CODES } from '@constants/index';
import { normalizePagination, buildPaginatedResult } from '@shared/pagination.util';
import type { PaginatedResult } from '@common/types/api-response.type';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { UserRepository, type UserRow } from './user.repository';
import type { QueryUserDto } from './dto/query-user.dto';
import type { AssignStoresDto } from './dto/assign-stores.dto';
import type { UpdateUserRoleDto } from './dto/update-user-role.dto';

export interface AssignedStoreResult {
  id: string;
  code: string;
  name: string;
}

export interface UserResult {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  assignedStores: AssignedStoreResult[];
  ownedStores: AssignedStoreResult[];
  assignedStoreIds: string[];
  ownedStoreIds: string[];
  lastLogin: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserStats {
  total: number;
  pending: number;
  active: number;
  suspended: number;
}

// Store ownership is what ENTREPRENEUR's OWN data scope resolves against —
// StoreService.findAccessible and the dashboard/assessment owner scoping all
// key off Store.ownerId. Handing a store to any other role would hide it from
// its real owner without granting anything.
const STORE_OWNER_ROLES: Role[] = [Role.ENTREPRENEUR];

@Injectable()
export class UserService {
  constructor(private readonly userRepo: UserRepository) {}

  async findAll(query: QueryUserDto, user: JwtPayload): Promise<PaginatedResult<UserResult>> {
    this.assertCanManage(user);
    const { skip, take, page, limit } = normalizePagination(query);
    const [items, total] = await Promise.all([
      this.userRepo.findAll(query, skip, take),
      this.userRepo.count(query),
    ]);
    return buildPaginatedResult(items.map(toResult), total, page, limit);
  }

  async getStats(user: JwtPayload): Promise<UserStats> {
    this.assertCanManage(user);
    const [total, pending, active, suspended] = await Promise.all([
      this.userRepo.count({}),
      this.userRepo.countByStatus(UserStatus.PENDING),
      this.userRepo.countByStatus(UserStatus.ACTIVE),
      this.userRepo.countByStatus(UserStatus.SUSPENDED),
    ]);
    return { total, pending, active, suspended };
  }

  async findOne(id: string, user: JwtPayload): Promise<UserResult> {
    this.assertCanManage(user);
    return toResult(await this.getUserOrThrow(id));
  }

  // Approval is the gate register() leaves every account behind: until this
  // runs, login and refresh both throw AUTH_006 for the account.
  async approve(id: string, user: JwtPayload): Promise<UserResult> {
    this.assertCanManage(user);
    const target = await this.getUserOrThrow(id);
    if (target.status === UserStatus.ACTIVE) {
      throw new ConflictException(ERROR_CODES.USER.INVALID_STATE, 'บัญชีนี้เปิดใช้งานอยู่แล้ว');
    }
    return toResult(await this.userRepo.updateStatus(id, UserStatus.ACTIVE));
  }

  // Rejecting a sign-up and suspending a working account are the same end state
  // — the account exists and cannot log in — so they share one transition. Any
  // live session is cut here too; leaving a refresh token alive would let a
  // just-suspended account keep minting access tokens for another seven days.
  async suspend(id: string, user: JwtPayload): Promise<UserResult> {
    this.assertCanManage(user);
    this.assertNotSelf(id, user);
    const target = await this.getUserOrThrow(id);
    this.assertNotSuperAdmin(target, 'ระงับบัญชี super admin ไม่ได้');
    if (target.status === UserStatus.SUSPENDED) {
      throw new ConflictException(ERROR_CODES.USER.INVALID_STATE, 'บัญชีนี้ถูกระงับอยู่แล้ว');
    }
    const updated = await this.userRepo.updateStatus(id, UserStatus.SUSPENDED);
    await this.userRepo.revokeRefreshToken(id);
    return toResult(updated);
  }

  async updateRole(id: string, dto: UpdateUserRoleDto, user: JwtPayload): Promise<UserResult> {
    this.assertCanManage(user);
    this.assertNotSelf(id, user);
    const target = await this.getUserOrThrow(id);
    this.assertNotSuperAdmin(target, 'เปลี่ยนบทบาทของ super admin ไม่ได้');

    // Store links are role-scoped (ASSIGNMENT_SCOPED_ROLES, STORE_OWNER_ROLES);
    // a role change that leaves them behind creates exactly the inconsistent
    // rows those lists exist to prevent — an ex-assessor holding assignments
    // nothing reads.
    if (target.assignedStores.length > 0 && !ASSIGNMENT_SCOPED_ROLES.includes(dto.role)) {
      throw new BadRequestException(
        ERROR_CODES.USER.INVALID_STATE,
        'ต้องยกเลิกร้านที่มอบหมายให้ผู้ใช้คนนี้ก่อนเปลี่ยนบทบาท',
      );
    }
    if (target.ownedStores.length > 0 && !STORE_OWNER_ROLES.includes(dto.role)) {
      throw new BadRequestException(
        ERROR_CODES.USER.INVALID_STATE,
        'ต้องย้ายร้านที่ผู้ใช้นี้เป็นเจ้าของออกก่อนเปลี่ยนบทบาท',
      );
    }

    return toResult(await this.userRepo.updateRole(id, dto.role));
  }

  // "กำหนดสิทธิ์การประเมินร้านให้กับผู้ประเมิน" — the assignment list an ASSESSOR
  // scores against and a MENTOR reads against.
  async assignStores(id: string, dto: AssignStoresDto, user: JwtPayload): Promise<UserResult> {
    this.assertCanManage(user);
    const target = await this.getUserOrThrow(id);
    if (!ASSIGNMENT_SCOPED_ROLES.includes(target.role)) {
      throw new BadRequestException(
        ERROR_CODES.USER.INVALID_ROLE,
        'มอบหมายร้านได้เฉพาะผู้ประเมินและที่ปรึกษาเท่านั้น',
      );
    }
    await this.assertStoresExist(dto.storeIds);
    return toResult(await this.userRepo.setAssignedStores(id, dto.storeIds));
  }

  // "assign ร้านค้าให้กับผู้ประกอบการ" — sets Store.ownerId for the whole list.
  // A store already owned by someone else moves; ownership is single-holder by
  // the schema, so this is a transfer, not a conflict.
  async assignOwnedStores(id: string, dto: AssignStoresDto, user: JwtPayload): Promise<UserResult> {
    this.assertCanManage(user);
    const target = await this.getUserOrThrow(id);
    if (!STORE_OWNER_ROLES.includes(target.role)) {
      throw new BadRequestException(
        ERROR_CODES.USER.INVALID_ROLE,
        'กำหนดเจ้าของร้านได้เฉพาะผู้ประกอบการเท่านั้น',
      );
    }
    await this.assertStoresExist(dto.storeIds);
    return toResult(await this.userRepo.setOwnedStores(id, dto.storeIds));
  }

  async remove(id: string, user: JwtPayload): Promise<void> {
    this.assertCanManage(user);
    this.assertNotSelf(id, user);
    const target = await this.getUserOrThrow(id);
    this.assertNotSuperAdmin(target, 'ลบบัญชี super admin ไม่ได้');

    // Assessment.assessorId is a required relation, so deleting an assessor who
    // has scored anything fails at the database. Suspending is the intended
    // move for someone who has left — it keeps their scores attributable.
    const assessmentCount = await this.userRepo.countAssessmentsByAssessor(id);
    if (assessmentCount > 0) {
      throw new ConflictException(
        ERROR_CODES.USER.INVALID_STATE,
        'ผู้ใช้นี้มีผลการประเมินอยู่ในระบบ ให้ระงับบัญชีแทนการลบ',
      );
    }
    if (target.ownedStores.length > 0) {
      throw new ConflictException(
        ERROR_CODES.USER.INVALID_STATE,
        'ต้องย้ายร้านที่ผู้ใช้นี้เป็นเจ้าของออกก่อนลบบัญชี',
      );
    }

    await this.userRepo.remove(id);
  }

  private async getUserOrThrow(id: string): Promise<UserRow> {
    const target = await this.userRepo.findById(id);
    if (!target) throw new NotFoundException(ERROR_CODES.USER.NOT_FOUND, 'ไม่พบผู้ใช้งาน');
    return target;
  }

  private async assertStoresExist(storeIds: string[]): Promise<void> {
    if (storeIds.length === 0) return;
    const found = await this.userRepo.countStoresByIds(storeIds);
    if (found !== storeIds.length) {
      throw new NotFoundException(ERROR_CODES.STORE.NOT_FOUND, 'มีร้านค้าที่ไม่พบในระบบ');
    }
  }

  // Not ADMIN_ROLES: user management is SUPER_ADMIN's alone. ADMIN runs the
  // programme, but only SUPER_ADMIN decides who gets in — the web mirrors this
  // with SUPER_ADMIN_ONLY_PERMISSIONS and the allowedRoles on ROUTES.USERS.
  private assertCanManage(user: JwtPayload): void {
    if (user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        ERROR_CODES.PERM.FORBIDDEN,
        'เฉพาะผู้ดูแลระบบสูงสุดเท่านั้นที่จัดการผู้ใช้งานได้',
      );
    }
  }

  // The only SUPER_ADMIN locking itself out is the failure mode with no way
  // back — there is no other account that can undo it.
  private assertNotSelf(id: string, user: JwtPayload): void {
    if (id === user.sub) {
      throw new BadRequestException(ERROR_CODES.USER.SELF_MODIFY, 'ไม่สามารถแก้ไขบัญชีของตนเองได้');
    }
  }

  private assertNotSuperAdmin(target: UserRow, message: string): void {
    if (target.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException(ERROR_CODES.USER.FORBIDDEN, message);
    }
  }
}

function toResult(row: UserRow): UserResult {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    assignedStores: row.assignedStores,
    ownedStores: row.ownedStores,
    assignedStoreIds: row.assignedStores.map((store) => store.id),
    ownedStoreIds: row.ownedStores.map((store) => store.id),
    lastLogin: row.lastLogin,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
