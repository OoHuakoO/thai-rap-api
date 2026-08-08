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
// list because StoreService.findAccessible narrows it to the stores it owns; every other
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
  Role.ENTREPRENEUR,
];

export function canReadAssessment(role: string): boolean {
  return ASSESSMENT_READ_ROLES.some((allowed) => allowed === role);
}

// Who may read pitching forms and the reports built on them. Everything a judge
// writes — scores, comments, a selection verdict — is committee material about a
// store that has not been told the outcome yet, so this is the narrowest read
// list in the project: the judging panel and the people running it, nobody else.
// ASSESSOR and MENTOR read the 50-question assessment but not this.
//
// An allow-list, not a deny-list — same rule as ASSESSMENT_READ_ROLES.
export const PITCHING_READ_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.JUDGE];

export function canReadPitching(role: string): boolean {
  return PITCHING_READ_ROLES.some((allowed) => allowed === role);
}

// Who may fill a pitching form in. JUDGE is the role the form exists for; the
// admin pair is here for the same reason it can correct a submitted assessment
// — someone has to key in a paper form a judge handed over. A judge still only
// ever writes its *own* row (PitchingService.getWritableOrThrow).
//
// This currently holds the same three roles as PITCHING_READ_ROLES, and the two
// stay separate anyway: they answer different questions, and a read-only seat on
// the panel is the obvious next role to add. What actually differs between a
// JUDGE and an admin today is scope, not capability — see ASSIGNMENT_SCOPED_ROLES.
export const PITCHING_WRITE_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.JUDGE];

export function canWritePitching(role: string): boolean {
  return PITCHING_WRITE_ROLES.some((allowed) => allowed === role);
}

// The roles whose access resolves against Store.assignedUsers — the ASSIGNED
// data scope. One list, two readers that must never drift: UserService.assignStores
// decides who may be given an assignment, resolveStoreScope / StoreService.assertVisible
// decides what an assignment is worth. A role in one and not the other is either
// an assignment nothing reads or a scope nobody can fill.
//
// ASSESSOR — the stores it may score (AssessmentService.assertAssignedToStore).
// MENTOR — the stores it may open at all, which is how it reaches an assessment
// to build the IDP from ("แบบ 50 ข้อ" §3.4).
// JUDGE — the stores it may judge. A judging panel is assembled per store, and a
// judge who has not been given a store has no business reading its pitch, so the
// assignment list is the whole of what it reaches — the same list, and the same
// SUPER_ADMIN screen, as the other two.
export const ASSIGNMENT_SCOPED_ROLES: Role[] = [Role.ASSESSOR, Role.MENTOR, Role.JUDGE];

// Same string-at-the-token-boundary rule as isAdminRole: an unknown role in a
// token must fail the check rather than the type-check.
export function isAssignmentScopedRole(role: string): boolean {
  return ASSIGNMENT_SCOPED_ROLES.some((scoped) => scoped === role);
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
];
