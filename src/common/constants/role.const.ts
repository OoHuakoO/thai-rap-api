import { Role } from '@prisma/client';

// SUPER_ADMIN is ADMIN plus the right to manage other admins — every check that
// grants ADMIN must grant SUPER_ADMIN too. Comparing against this list keeps a
// new privileged role from silently failing a `role === Role.ADMIN` check.
export const ADMIN_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN];

// Takes a plain string because JwtPayload.role is untyped at the token boundary
// — a token carrying an unknown role must fail the check, not the type-check.
export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.some((adminRole) => adminRole === role);
}

// Who may read assessment results at all — scores, per-question notes, evidence,
// round history, ranking and the reports built on them. ENTREPRENEUR is in the
// list because StoreService.findOne narrows it to the store it owns; every other
// entry reads every store.
//
// JUDGE and VIEWER are deliberately absent. A JUDGE scores pitching, not the
// 50-question assessment, and VIEWER is ผู้ใช้ทั่วไป — anyone on the internet can
// self-register as one (SELF_REGISTERABLE_ROLES below), so leaving them in here
// published every store's scores to whoever a SUPER_ADMIN waves through.
//
// An allow-list, not a deny-list: a role added to the enum later reads nothing
// until it is named here.
export const ASSESSMENT_READ_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.ASSESSOR,
  Role.MENTOR,
  Role.ME_TEAM,
  Role.ENTREPRENEUR,
];

export function canReadAssessment(role: string): boolean {
  return ASSESSMENT_READ_ROLES.some((allowed) => allowed === role);
}

// An allow-list, not a deny-list — a role added to the enum later must be opted
// in here deliberately, never inherit self-registration by default.
// POST /auth/register creates a PENDING account and issues no tokens, so what
// this list really grants is the right to *ask* for a role; a SUPER_ADMIN
// approving through PATCH /users/:id/approve is what turns it into access.
// ADMIN_ROLES stay out anyway — nobody self-nominates for the role that manages
// users and rewrites every other role's permissions.
//
// What an approved account reaches is bounded elsewhere: VIEWER and JUDGE read
// nothing through ASSESSMENT_READ_ROLES above, and a VIEWER's store rows come
// back as PublicStoreResult.
export const SELF_REGISTERABLE_ROLES: Role[] = [
  Role.VIEWER,
  Role.ENTREPRENEUR,
  Role.MENTOR,
  Role.ASSESSOR,
  Role.JUDGE,
  Role.ME_TEAM,
];
