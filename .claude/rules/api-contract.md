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

- 422 validation errors return `VALID_002` (`VALIDATION_FAILED`); generic 400
  is `VALID_001` (`BAD_REQUEST`). Web mock: `mocks/handlers/user.handlers.ts`.
- Store documents accept pdf / xlsx / docx / csv only (no images) — matches
  `accept` in `features/store/components/store-document-manager.tsx`.
- Upload extension whitelists (`*_ALLOWED_EXTENSIONS` in `file-upload.const.ts`)
  mirror the MIME regexes and the web `accept` attributes — change them together.
- `GET /stores/stats` is staff-only (403 `PERM_001` for ENTREPRENEUR). Web
  `useStoreStats` (`features/store/hooks/use-stores.ts`) calls it for every
  role; entrepreneur degrades to a hidden stats bar and empty filter dropdowns.
- `GET /stores` and `GET /stores/:id` are **not** ownership-scoped: every signed-in
  role browses the whole directory, ENTREPRENEUR included. A store an admin
  registers carries no `ownerId`, so scoping the list to the caller left a
  freshly-onboarded entrepreneur with nothing. Managing is still owner-only
  (`assertCanManage`), and so is assessment/report access — those go through
  `StoreService.findAccessible()`, which keeps the ownership throw that
  `findOne()` no longer has. The web mirrors this by gating the row actions in
  `features/store/components/store-list.tsx` on `store.ownerId`, which is why
  `ownerId` is part of the web `Store` type.
- **`GET /stores` and `GET /stores/:id` return a narrowed object** —
  `PublicStoreResult` (id, ownerId, name, province, storeType, socialLinks,
  goals, menuPhotos, coverUrl, storePhotos, status) instead of `StoreResult` —
  to a VIEWER on every store, and to an ENTREPRENEUR on a store it does not
  own ("ผู้ประกอบการจะไม่สามารถเห็นข้อมูลของร้านอื่น", แบบ 50 ข้อ §3.2). Contact
  details, revenue, `mainProblems`, `documents` and every score key are
  **absent, not blanked** — a client that indexes into them without a guard
  throws (see the `store.documents ?? []` in the web's `store-detail.tsx`).
  The field list mirrors `PUBLIC_STORE_FIELDS` in the web's
  `constants/permissions.ts`; the two must change together. In-process callers
  that need the full record use `StoreService.findAccessible()`, never
  `findOne()`. The MSW store handlers are not role-aware — in mock mode every
  role still sees every field.
- Every `/news` endpoint — reads included — is ADMIN / SUPER_ADMIN only
  (403 `PERM_001` otherwise), matching the `allowedRoles` on `ROUTES.NEWS` in
  the web's `ROUTE_PERMISSIONS`. The dashboard activity feed still shows
  announcements to every role: it calls `NewsService.listForFeed()` in-process,
  which deliberately takes no user.
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
