# THAI-RAP API — Overview & Conventions

## Base URL
```
/api/v1
```
Set by `app.apiPrefix` / `app.apiVersion` (`main.ts` → `setGlobalPrefix`). Swagger UI is served at `/api/docs` outside production. Uploaded files are served as static assets under `/uploads/...`.

## Tech Stack
- Runtime: NestJS 10 (TypeScript)
- ORM: Prisma 7 + MySQL
- Auth: JWT access token + refresh token (httpOnly cookie)
- File upload: Multipart form-data → local disk (`./uploads`)
- Mail: OTP password-reset mail via `MailService`

---

## Authentication

All endpoints require `Authorization: Bearer <access_token>` unless marked `[PUBLIC]`.

| Token | TTL | Notes |
|---|---|---|
| Access Token | 15 min (`auth.jwtAccessExpiresIn`) | Short-lived, stateless JWT |
| Refresh Token | 7 days | httpOnly cookie `refreshToken`; stored as hash in `RefreshToken` |
| Reset Token | 10 min | Issued by `POST /auth/verify-otp`, signed with a secret derived from the access secret |

A new account is created `PENDING` and cannot log in until a SUPER_ADMIN approves it — see [01-auth.md](01-auth.md) and [02-users.md](02-users.md).

---

## Roles

`Role` enum (`prisma/schema.prisma`) — 8 values:

| Role | Enum | Description |
|---|---|---|
| Super Admin | `SUPER_ADMIN` | ADMIN plus user management (`/users/*` is its alone) |
| Admin / PMO | `ADMIN` | Full access to programme data |
| Assessor | `ASSESSOR` | Scores the stores assigned to it |
| Mentor / Coach | `MENTOR` | Reads the stores assigned to it; does not score |
| Entrepreneur | `ENTREPRENEUR` | Its own stores only |
| Judge | `JUDGE` | Fills in the pitching forms for the stores assigned to it; no assessment data, no overview, no announcements |
| ผู้ใช้ทั่วไป | `VIEWER` | Public store fields only; no assessment data |

Self-registerable roles (`SELF_REGISTERABLE_ROLES`): every role except `SUPER_ADMIN` and `ADMIN`.

---

## Data Scope

Three roles are narrowed; every other role reads the whole programme. One resolver decides it for every module — `resolveStoreScope()` (`src/shared/store-scope.util.ts`), mirrored for single-store reads by `StoreService.assertVisible`.

| Role | Stores reached |
|---|---|
| `ENTREPRENEUR` | `Store.ownerId === user.sub` |
| `ASSESSOR` | `Store.assignedUsers` — the SUPER_ADMIN-managed assignment list |
| `MENTOR` | same assignment list |
| `JUDGE` | same assignment list |
| everyone else | all stores |

Consequences:
- A store outside the caller's scope 403s `PERM_001` on `GET /stores/:id` **and** on every `/assessments*`, `/reports/*`, `/analytics/*` read of it — they all enter through `StoreService.findAccessible()`.
- An assignment-scoped role with no assignments gets `items: []`, not an error.
- Dashboard cards are computed over the same narrowed set for the roles that may read them at all; `targetStores` stays the project-wide `STORE_TARGET_TOTAL` (400).

### Who may read assessment data

`ASSESSMENT_READ_ROLES` (`src/common/constants/role.const.ts`): `SUPER_ADMIN`, `ADMIN`, `ASSESSOR`, `MENTOR`, `ENTREPRENEUR`.

`JUDGE` and `VIEWER` get 403 `PERM_001` from every `/assessments*`, `/assessment/:storeId/history`, `/reports/*` and `/analytics/*` endpoint, exports included. It is an allow-list: a role added to the enum later reads nothing until it is named there.

### Who may read the overview and announcements

`OVERVIEW_READ_ROLES` (`src/common/constants/role.const.ts`): every role but `JUDGE`.

`JUDGE` gets 403 `PERM_001` from every `/dashboard/*` endpoint and from `GET /news` / `GET /news/:id` — a judge is a guest on the panel, not a participant in the programme. Same allow-list rule as above.

### Who may write assessment data

ADMIN roles and `ASSESSOR` only (`AssessmentService.WRITE_ROLES`). An ASSESSOR additionally has to be assigned to the store (`assertAssignedToStore`); admin roles bypass that.

### Who may read / write pitching data

Two separate lists in the same file, and neither matches the assessment ones:

| | Roles |
|---|---|
| `PITCHING_READ_ROLES` | `SUPER_ADMIN`, `ADMIN`, `JUDGE` |
| `PITCHING_WRITE_ROLES` | `SUPER_ADMIN`, `ADMIN`, `JUDGE` |

Every other role — `ASSESSOR`, `MENTOR`, `ENTREPRENEUR`, `VIEWER` — gets 403 `PERM_001` from every `/pitching*` endpoint, exports included. It is the narrowest read list in the project: what a judge writes is committee material about a store that has not been told the outcome, so only the panel and the people running it see it. Roles that read the 50-question assessment are deliberately *not* on this list.

A JUDGE writes only its own form; an admin may correct anyone's draft (`PitchingService.getWritableOrThrow`). Store scope applies on top of both: every `/pitching*` read and write enters through `StoreService.findAccessible()`, so a JUDGE reaches only the stores a SUPER_ADMIN assigned to it.

One deliberate exception to the read list: `PitchingService.getStoreAverageScore()` takes no user and skips the check. It answers a single averaged number and is called in-process by `AnalyticsService` for the IRS — never wired to a controller.

---

## Response Envelope

All JSON responses are wrapped by `TransformInterceptor`:

```json
{
  "success": true,
  "data": { ... }
}
```

Error responses (from `GlobalExceptionFilter`):

```json
{
  "success": false,
  "error": {
    "code": "STORE_001",
    "message": "ไม่พบร้านค้า",
    "details": [ { "field": "...", "message": "..." } ]
  }
}
```

`details` is only present for validation errors. No `statusCode` inside `error` and no top-level `timestamp` — the HTTP status code is the response's actual status.

**Export routes are not wrapped.** Every `*/export` route uses `@Res()` and streams a binary body (`xlsx`/`pdf`) with `Content-Disposition: attachment`.

---

## Validation

Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. An unknown body field is rejected, not ignored. Failures return **422 `VALID_002`** with a `details` array.

---

## Pagination

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number (1-indexed) |
| `limit` | number | 10 | Items per page (max 100) |

`sortBy`/`sortOrder` are not implemented — every list query is hardcoded to `orderBy: { createdAt: 'desc' }` (news orders by `urgent desc, publishedAt desc`).

```json
{
  "items": [...],
  "meta": { "total": 50, "page": 1, "limit": 10, "totalPages": 5 }
}
```

`GET /news`, `GET /dimensions`, `GET /provinces`, `GET /store-types`, `GET /assessment/:storeId/history` and the analytics/dashboard endpoints return **bare arrays**, not this envelope.

---

## Rate Limiting

Global `ThrottlerGuard`: `THROTTLE_LIMIT` requests per `THROTTLE_TTL` (default **100 / 60 s**). Overrides:

| Route | Limit |
|---|---|
| `POST /auth/forgot-password` | 3 / min |
| `POST /auth/verify-otp` | 10 / min |
| `POST /auth/reset-password` | 10 / min |

Exceeding it returns 429 `RATE_001`.

---

## Assessment Rounds

| Round | Purpose | Requires |
|---|---|---|
| T0 | Baseline — before camp | — |
| T1 | Post camp | T0 completed |
| T2 | Field audit | T1 completed |
| T3 | Follow-up | T1 completed |

`REQUIRED_PRIOR_ROUND` (`assessment.service.ts`) is enforced on **every** write — create, score, evidence, notes, draft, submit — not only on create. A round counts as completed at `SUBMITTED` **or** `APPROVED` (`COMPLETED_STATUSES`).

---

## Scoring

- Each question scored **0–4** (`Question.maxScore`; the per-question value is the real ceiling, `ASSESS_006` if exceeded)
- 8 dimensions with weights summing to 100
- `dimensionScore(%) = Σ raw scores in dimension / Σ Question.maxScore in dimension × 100`
- `totalScore = Σ (dimensionScore × weight / 100)`

`Dimension.questionCount` is **not** part of any formula — the denominator is Σ `maxScore`.

### Dimension Weights

| ID | Dimension | Weight | Questions |
|---|---|---|---|
| 1 | คุณภาพอาหารและนวัตกรรมเมนู | 12% | 1–7 |
| 2 | ความปลอดภัยอาหารและมาตรฐาน | 15% | 8–14 |
| 3 | แบรนด์และโมเดลธุรกิจ | 10% | 15–20 |
| 4 | การตลาดและฐานลูกค้า | 13% | 21–27 |
| 5 | การเงิน ต้นทุน และกำไร | 20% | 28–34 |
| 6 | ระบบปฏิบัติการร้านและการบริการ | 18% | 35–41 |
| 7 | เครือข่าย วัตถุดิบ และห่วงโซ่อุปทาน | 5% | 42–46 |
| 8 | ความพร้อมเติบโตและเข้าร่วมโครงการ | 7% | 47–50 |

### Score Zones (`getZone`)

| Score | Zone |
|---|---|
| 0–39 | Red Zone |
| 40–59 | Survival Zone |
| 60–74 | Improve Zone |
| 75–84 | Growth Zone |
| 85–100 | Model Zone |

### Overall Level (`getOverallLevel`) — a different scale

Used by the cross-store report only (`overallLevel`), never mixed with Zone:

| Score | ระดับรวม |
|---|---|
| < 50 | เร่งแก้ไข |
| 50–64 | ต้องพัฒนา |
| 65–79 | ดี |
| ≥ 80 | ดีมาก |

---

## Red Flags

Generated inside the submit transaction, and re-reconciled by type whenever an admin corrects a finished round.

| Flag | Severity | Trigger |
|---|---|---|
| FOOD_SAFETY | WARNING | Q8–14 average < 2 |
| FINANCIAL | CRITICAL | Q28, 29, 30 or 31 ≤ 1 |
| OPERATION | WARNING | Q35, 36, 39 or 41 ≤ 1 |
| MARKET | WARNING | Q21 or 22 ≤ 1 |
| LEGAL | CRITICAL | Q13 = 0 |
| OWNER_READINESS | WARNING | Q47 or 48 < 2 |
| EVIDENCE | WARNING | Q49 < 2 |
| GROWTH | WARNING | Q50 < 2 |

`RedFlag.recommendation` is always `null` — nothing populates the column.

---

## Error Codes

From `ERROR_CODES` in `src/common/constants/error-codes.const.ts`.

### Auth
| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_001` | 401 | Invalid login credentials |
| `AUTH_002` | — | `TOKEN_EXPIRED` — defined, never thrown |
| `AUTH_003` | — | `UNAUTHORIZED` — defined, never thrown |
| `AUTH_004` | 401 | Refresh token missing/invalid/expired/revoked |
| `AUTH_005` | 403 | Account suspended |
| `AUTH_006` | 403 | Account pending approval |
| `AUTH_007` | 400 | OTP invalid |
| `AUTH_008` | 400 | OTP expired |
| `AUTH_009` | 400 | OTP attempts exhausted (5) |
| `AUTH_010` | 401 | Reset token invalid or expired |

### User
| Code | HTTP | Meaning |
|---|---|---|
| `USER_001` | 404 | User not found |
| `USER_002` | 409 | Email already exists |
| `USER_003` | 403 | Target is a SUPER_ADMIN — cannot suspend, re-role or delete |
| `USER_004` | 400/409 | Invalid state (already ACTIVE/SUSPENDED, still holds stores or assessments) |
| `USER_005` | 400 | Cannot act on your own account |
| `USER_006` | 400 | Role cannot hold this kind of store link |

### Store
| Code | HTTP | Meaning |
|---|---|---|
| `STORE_001` | 404 | Store not found |
| `STORE_002` | — | `DUPLICATE` — defined, never thrown |
| `STORE_003` | 400 | `province` not in the `GET /provinces` table |
| `STORE_004` | 404 | Store document not found (or belongs to another store) |
| `STORE_005` | 400 | `ownerId` is not an existing ENTREPRENEUR |
| `STORE_006` | 404 | Photo url not in this store's list |
| `STORE_007` | 400 | `avgRevenueMax` < `avgRevenueMin` |
| `STORE_008` | 409 | `code` already used |
| `STORE_009` | 400 | `storeType` not in the `GET /store-types` table |
| `STORE_010` | 409 | Store still has assessments or documents — cannot delete |

### Assessment
| Code | HTTP | Meaning |
|---|---|---|
| `ASSESS_001` | 404 | Assessment not found |
| `ASSESS_002` | 409 | Duplicate (storeId, round) |
| `ASSESS_003` | 400 | Invalid state — prior round unfinished, or evidence before a score exists |
| `ASSESS_004` | 400 | Cannot modify a finished assessment |
| `ASSESS_005` | 400 | Not every question scored before submit |
| `ASSESS_006` | 400 | `rawScore` above that question's `maxScore` |
| `ASSESS_007` | 404 | Question id invalid |

### Pitching
| Code | HTTP | Meaning |
|---|---|---|
| `PITCH_001` | 404 | Pitching form not found |
| `PITCH_002` | 409 | This judge already has a form for (storeId, round) |
| `PITCH_003` | 400 | Unknown comment key or evidence key for that round's form |
| `PITCH_004` | — | Retired. A submitted form is editable; nothing throws this. The code stays reserved |
| `PITCH_005` | 400 | Not every criterion scored before submit |
| `PITCH_006` | 400 | `score` above that criterion's `maxScore` |
| `PITCH_007` | 404 | Criterion id invalid, or belongs to the other round |
| `PITCH_008` | 400 | ACCELERATION submit without `scoreCardTotal` / `participationPct` |
| `PITCH_009` | 400 | Verdict missing at submit, or not offered on that round's form |

### Other
| Code | HTTP | Meaning |
|---|---|---|
| `NEWS_001` | 404 | Announcement not found |
| `ACT_001` | 404 | Activity album not found |
| `ACT_002` | 404 | Activity photo not found, or it belongs to another album |
| `RPT_001` | 404 | No submitted assessment for this store/round |
| `RPT_002` | 404 | `NO_ASSESSMENT` — defined, never thrown |
| `PERM_001` | 403 | Role / ownership / assignment not permitted |
| `FILE_001` | 400 | Invalid file type (`BadRequestException` from `ParseFilePipe`) |
| `FILE_002` | 400 | File exceeds 10 MB (400, not 413) |
| `FILE_003` | 404 | Evidence file not found |
| `VALID_001` | 400 | Generic bad request |
| `VALID_002` | 422 | DTO validation failed — carries `details` |
| `DB_001`/`DB_002`/`DB_003`/`DB_004`/`DB_005`/`DB_999` | 409/404/400/400/400/500 | Prisma passthrough (`P2002`/`P2025`/`P2003`/`P2000`/`P2014`/other) |
| `SYS_001` | 500 | Unhandled error |

`ASSESS_006` is thrown by `assertScoreWithinMax` only. A score outside the DTO's `0–4` bound never reaches it — class-validator rejects that as `VALID_002` first.

---

## File Upload

Shared limits (`src/common/constants/file-upload.const.ts`), 10 MB for every endpoint:

| Set | Types |
|---|---|
| `PHOTO_MIME_REGEX` | jpeg, png, webp |
| `STORE_DOCUMENT_MIME_REGEX` | pdf, xlsx, docx, csv (**no images**) |
| `ASSESSMENT_EVIDENCE_MIME_REGEX` | jpeg, png, webp, pdf, xlsx |

Files land on local disk and are returned as relative urls (`/uploads/...`). Original Thai filenames are preserved in metadata.
