import { Role } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { JwtPayload } from '@common/decorators/current-user.decorator';
import { isAssignmentScopedRole } from '@constants/index';

// Who a query is being answered *for*. `ownerId` is the ENTREPRENEUR's own
// store; `assignedToId` is the assignment list an assessor or a mentor holds
// (Store.assignedUsers).
export interface StoreListScope {
  ownerId?: string;
  assignedToId?: string;
}

// The one place that decides which stores a caller reaches. Three roles are
// narrowed instead of seeing the whole programme:
//   ENTREPRENEUR — only the stores it owns ("ผู้ประกอบการจะไม่สามารถเห็นข้อมูล
//     ของร้านอื่น", แบบ 50 ข้อ §3.2). A SUPER_ADMIN hands an admin-registered
//     store over with PATCH /users/:id/owned-stores.
//   ASSESSOR — only its assignment list, since that is all it may score.
//   MENTOR — the same assignment list: it reads a store's assessment to build
//     the IDP (§3.4), for the stores it was given and not for all of them.
// Either assignment-scoped role with no assignments gets an empty result, which
// is the intended state, not a bug.
//
// `undefined` means "not narrowed" — every staff role keeps the project-wide
// numbers. Callers that need an id list must keep that distinction: an empty
// array reaches no store, `undefined` reaches all of them.
export function resolveStoreScope(user: JwtPayload): StoreListScope | undefined {
  if (user.role === Role.ENTREPRENEUR) return { ownerId: user.sub };
  if (isAssignmentScopedRole(user.role)) return { assignedToId: user.sub };
  return undefined;
}

// The scope as a Store filter. Every repository that narrows on a caller builds
// its where clause from here, so the store directory, the overview cards and the
// report list can never disagree about which stores that caller reaches.
export function storeScopeWhere(scope?: StoreListScope): Prisma.StoreWhereInput {
  const where: Prisma.StoreWhereInput = {};
  if (scope?.ownerId) where.ownerId = scope.ownerId;
  if (scope?.assignedToId) where.assignedUsers = { some: { id: scope.assignedToId } };
  return where;
}

// The same filter reached through Assessment.store. Returns `{}` rather than an
// empty relation filter when unscoped — `store: {}` still forces a join that
// changes nothing.
export function assessmentStoreScopeWhere(scope?: StoreListScope): Prisma.AssessmentWhereInput {
  return scope ? { store: storeScopeWhere(scope) } : {};
}
