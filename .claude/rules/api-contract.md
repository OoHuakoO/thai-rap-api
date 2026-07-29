# API Contract — Keep the Web App in Sync

The frontend lives in a sibling repo: `../thai-rap-web` (Next.js). It mirrors
this API's wire format in its own code — mocks, types, and upload `accept`
attributes. Any change to what goes over the wire is a **two-repo change**.

---

## Changes That Require a Web-Side Sweep

| API change | Where to check in `../thai-rap-web` |
|------------|--------------------------------------|
| Error code value or meaning (`ERROR_CODES`) | `mocks/handlers/*.ts` (MSW handlers return hardcoded codes), any UI matching on `error.code` |
| Response shape (fields added/removed/renamed, envelope) | `types/`, `features/*/types/*.types.ts`, `mocks/handlers/` |
| Upload MIME allow-list or size limit (`file-upload.const.ts`) | `accept="..."` attributes in `features/*/components/`, `utils/validate-file-size.ts` |
| Route path, method, or status code | `features/*/services/*.service.ts`, `mocks/handlers/` |
| Enum values (Role, status, Round, zone names) | `types/`, `constants/` |
| Validation limits (`@Max`, `@MaxLength`, ...) | form validation in `features/*/components/` |

Search the web repo before declaring the change done:

```bash
grep -rn "<old-value>" ../thai-rap-web --include="*.ts" --include="*.tsx" --exclude-dir=node_modules
```

---

## Rules

- **Error codes are a public contract.** Never renumber, reuse, or repurpose
  an existing code — clients match on the string. Add a new code instead
  (see `/add-error-code`).
- **Browser `accept` is not validation.** The API-side MIME regex is the real
  gate; the web `accept` attribute is UX. They must still agree — a type the
  web offers but the API rejects is a bug, and vice versa.
- **MSW mocks are the web team's source of truth** for API behavior during
  frontend dev. A wire-format change that skips `mocks/handlers/` ships a lie
  to the frontend.
- If the change is breaking (removed field, changed code, tightened limit),
  say so explicitly in the summary so the user can coordinate deploys.

---

## Known Sync Points (as of 2026-07)

- `GET /dashboard/reports-status` is **derived, not stored** — there is no
  `Report` table. `ReportService.listAvailableReports()` reads the submitted
  rounds the caller may see and emits two report kinds per store (one per round,
  one overview), once per format, so a store's reports appear the moment a round
  is submitted — nothing has to be exported first. `id` is synthetic and stable
  (`store:round:format`, `store:overview:format`), `createdAt` is the round's
  `submittedAt`, `status` is always `DONE`, and `downloadUrl` is the
  `/reports/**/export` route that renders the file. The web must fetch that path
  through the axios client (`dashboardService.downloadReport`,
  `responseType: 'blob'`); an `<a href>` arrives without the in-memory bearer
  token and 401s. Scope follows assessment reads: staff see every store, an
  ENTREPRENEUR only its own, and JUDGE / VIEWER get `[]` rather than a 403 so the
  dashboard card still renders. `ReportStatusItem.format`/`status` on the web
  keep wider unions (`CSV`, `PENDING`, `GENERATING`, `FAILED`) that the API never
  emits.
- There is **no `/access-control` endpoint** and no stored permission matrix —
  the whole module, its `AccessControlConfig` table and the web page that edited
  it were removed on 2026-07-29. The web's `ROLE_PERMISSIONS` /
  `ROLE_DATA_SCOPES` / `PUBLIC_STORE_FIELDS` (`constants/permissions.ts`) are
  fixed in code and drive its nav and route guards only. The API's own role
  checks (service layer, `role.const.ts`) are the real gate, as they always
  were; the two are kept in step by review, not at runtime.
- The web `/users` page neither suspends nor deletes an account, and never
  changes a role — a user keeps the role they registered with. `PATCH
  /users/:id/suspend`, `PATCH /users/:id/role` and `DELETE /users/:id` still
  exist on the API but have no caller in the web and no MSW handler.
- `POST /auth/register` creates a **PENDING** account and returns `{ user }`
  only — no `tokens`, no refresh cookie. Login and refresh both reject PENDING
  with 403 `AUTH_006`, so a sign-up is inert until `PATCH /users/:id/approve`.
  The web register page must not expect a session back.
- Password reset is three public calls: `POST /auth/forgot-password` always
  answers 200 for any address (never reveals whether it is registered),
  `POST /auth/verify-otp` trades the 6-digit code for a 10-minute `resetToken`,
  and `POST /auth/reset-password` accepts **only** that token plus the new
  password — the OTP never travels twice. New codes: `AUTH_007` invalid,
  `AUTH_008` expired, `AUTH_009` attempts exhausted (5), `AUTH_010` reset token
  invalid; 007–009 are 400, 010 is 401. `forgot-password` is throttled to 3/min
  (the others 10/min), which the web mirrors as a 60-second resend cooldown in
  `OTP_RESEND_COOLDOWN_SECONDS`. Web mock: `mocks/handlers/auth.handlers.ts`
  accepts one fixed code, `MOCK_OTP` in `mocks/fixtures/password-reset.fixtures.ts`.
- `/users/*` is **SUPER_ADMIN only** (403 `PERM_001` for everyone else,
  ADMIN included), matching `SUPER_ADMIN_ONLY_PERMISSIONS` and the
  `allowedRoles` on `ROUTES.USERS` in the web. `PATCH /users/:id/assigned-stores`
  and `/owned-stores` take the **complete** id list — an omitted store is
  revoked, `[]` clears everything.
- Assessment **writes** are gated on `Store.assignedUsers` for ASSESSOR
  (403 `PERM_001`); admin roles bypass. An ASSESSOR with no assignments can
  score nothing, so the web must surface that 403 rather than auto-creating a
  draft. Reads are unaffected.

- 422 validation errors return `VALID_002` (`VALIDATION_FAILED`); generic 400
  is `VALID_001` (`BAD_REQUEST`). Web mock: `mocks/handlers/user.handlers.ts`.
- Store documents accept pdf / xlsx / docx / csv only (no images) — matches
  `accept` in `features/store/components/store-document-manager.tsx`.
- Upload extension whitelists (`*_ALLOWED_EXTENSIONS` in `file-upload.const.ts`)
  mirror the MIME regexes and the web `accept` attributes — change them together.
- `GET /stores/stats` is staff-only (403 `PERM_001` for ENTREPRENEUR). Web
  `useStoreStats` (`features/store/hooks/use-stores.ts`) calls it for every
  role; entrepreneur degrades to a hidden stats bar and empty filter dropdowns.
- `GET /stores` is narrowed to `Store.assignedUsers` for **ASSESSOR** — it lists
  only the stores a SUPER_ADMIN assigned to that account, so the web's
  `useStores` callers (assessment store picker, `/assessment` entry redirect,
  reports and analytics pickers) show that list and nothing else. An assessor
  with no assignments gets `items: []` and the web falls through to
  `EMPTY_STORE_MESSAGE` — not an error. `GET /stores/:id` 403s `PERM_001` on an
  unassigned store too, and because every assessment, report and analytics read
  runs through `StoreService.findAccessible()`, an assessor gets that same 403
  from `/assessments*`, `/reports/*` (exports included) and `/analytics/*` for a
  store it was not assigned — it works only inside its own list. Every other
  role is unaffected. MSW mocks are not role-aware.
- `GET /stores` is **ownership-scoped for ENTREPRENEUR** — it lists only the
  stores whose `ownerId` is the caller, and `GET /stores/:id` 403s `PERM_001`
  on any other store ("ผู้ประกอบการจะไม่สามารถเห็นข้อมูลของร้านอื่น", แบบ 50 ข้อ §3.2).
  This reverses the earlier shared-directory behaviour: an admin-registered
  store used to carry no `ownerId`, but a SUPER_ADMIN now hands it over with
  `PATCH /users/:id/owned-stores`, so ownership is a usable filter again.
  `findOne()` and `findAccessible()` therefore agree for this role.
  The web still gates the row actions in
  `features/store/components/store-list.tsx` on `store.ownerId` as a second
  check, which is why `ownerId` stays part of the web `Store` type. The MSW
  store handlers are not ownership-aware — in mock mode an entrepreneur still
  sees every store. `GET /stores/stats` stays project-wide for every role that
  may call it: it is an aggregate over the whole programme, not a store list.
- **`GET /stores` and `GET /stores/:id` return a narrowed object** —
  `PublicStoreResult` (id, ownerId, name, province, storeType, socialLinks,
  goals, menuPhotos, coverUrl, storePhotos, status) instead of `StoreResult` —
  to a VIEWER on every store. Contact
  details, revenue, `mainProblems`, `documents` and every score key are
  **absent, not blanked** — a client that indexes into them without a guard
  throws (see the `store.documents ?? []` in the web's `store-detail.tsx`).
  The field list mirrors `PUBLIC_STORE_FIELDS` in the web's
  `constants/permissions.ts`; the two must change together. In-process callers
  that need the full record use `StoreService.findAccessible()`, never
  `findOne()`. The MSW store handlers are not role-aware — in mock mode every
  role still sees every field.
- `GET /news` and `GET /news/:id` answer **any signed-in role** — neither takes a
  user to narrow on. `POST`/`PATCH`/`DELETE` stay ADMIN / SUPER_ADMIN
  (403 `PERM_001` otherwise). The web mirrors this: `ROUTES.NEWS` carries no
  `allowedRoles` and every role holds `news:read`, while `/news/new` and
  `/news/:id/edit` have their own `ROUTE_PERMISSIONS` entries requiring
  `news:write`. The dashboard activity feed calls `NewsService.listForFeed()`
  in-process, as before.
- Assessment writes are ADMIN / ASSESSOR only (`AssessmentService.WRITE_ROLES`),
  matching `ASSESSMENT_WRITE` in the web's `ROLE_PERMISSIONS`. "แบบ 50 ข้อ" §3.3
  gives ผู้ติดตาม/Assessor "ประเมินร้าน 50 ข้อ / ให้คะแนน T0–T4"; §3.4 lists
  ที่ปรึกษา/Mentor's eight rights and every one is a read plus its own IDP work.
  A mentor's writing surfaces — ข้อเสนอแนะจาก Mentor on the report, หมายเหตุ
  Mentor on the portfolio, the IDP and Mentoring Log (§8) — are separate pages
  that do not exist yet; don't widen `WRITE_ROLES` to stand in for them. A role
  holding `assessment:read` alone must not trigger the auto-create in
  `useAssessment` — the 403 sends the whole page to `/403`.
- The web scoring page is staff-only: `ROUTE_PERMISSIONS` for `/assessment`
  carries `allowedRoles: [SUPER_ADMIN, ADMIN, ASSESSOR, MENTOR]`, and
  ENTREPRENEUR / ME_TEAM hold no `assessment:read` at all — they read results
  through `/reports` and `/analytics`. The API is deliberately *not* that
  narrow: it still answers `GET /assessments*` for those roles (scoped, see
  below), so the restriction is a UX boundary, not an API one.
- Assessment and report **reads** answer to `ASSESSMENT_READ_ROLES`
  (`common/constants/role.const.ts`): SUPER_ADMIN, ADMIN, ASSESSOR, MENTOR,
  ME_TEAM, ENTREPRENEUR. JUDGE and VIEWER get 403 `PERM_001` from every
  `/assessments*`, `/assessment/:storeId/history` and `/reports/*` endpoint,
  exports included. VIEWER is self-registerable and ACTIVE on signup, so an
  ungated read there published every store's scores to anyone on the internet.
- `GET /assessments` and `GET /assessments/:id` are scoped by store ownership;
  an ENTREPRENEUR only ever sees their own store's rounds.
- Every `/dashboard/*` endpoint is scoped by store ownership too: an
  ENTREPRENEUR gets the same seven cards computed over the stores it owns
  (`DashboardService.ownerScope`), not a 403. The web grants it `dashboard:read`
  and lists ภาพรวมโครงการ in its nav, which also makes `/` its post-login landing
  route instead of `/stores`. `targetStores` stays the project-wide
  `STORE_TARGET_TOTAL` for every role. The MSW dashboard handlers are not
  ownership-aware — in mock mode every role sees the full fixture set.
- A round counts as finished at `SUBMITTED` **or** `APPROVED`
  (`COMPLETED_STATUSES` in `AssessmentService`, `utils/status.ts` on the web).
  It gates editing, ranking, the round pills and the timeline on both sides.
- Assessment evidence accepts jpg / jpeg / png / webp / pdf / xlsx — mirrored
  by `EVIDENCE_ACCEPT` in `features/assessment/constants/assessment-config.constants.ts`.
- Dimension percentages divide by Σ `Question.maxScore`
  (`buildDimensionInfos`), the same denominator the web's `sumQuestionScores`
  uses. `Dimension.questionCount` is no longer part of any score formula.
