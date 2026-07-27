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

// An allow-list, not a deny-list — a role added to the enum later must be opted
// in here deliberately, never inherit self-registration by default.
// POST /auth/register creates an ACTIVE account with no approval step, so a
// self-registered ASSESSOR can score assessments immediately. That is accepted
// for now; ADMIN_ROLES stay out because they can manage users and rewrite every
// other role's permissions.
export const SELF_REGISTERABLE_ROLES: Role[] = [
  Role.VIEWER,
  Role.ENTREPRENEUR,
  Role.MENTOR,
  Role.ASSESSOR,
  Role.JUDGE,
  Role.ME_TEAM,
];
