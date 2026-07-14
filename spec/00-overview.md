# THAI-RAP API — Overview & Conventions

## Base URL
```
/api/v1
```

## Tech Stack
- Runtime: NestJS (TypeScript)
- ORM: Prisma + MySQL
- Auth: JWT (access + refresh token)
- File upload: Multipart form-data → local disk (`./uploads`), served as static assets under `/uploads/...`

---

## Authentication

All endpoints require `Authorization: Bearer <access_token>` unless marked `[PUBLIC]`.

| Token | TTL | Notes |
|---|---|---|
| Access Token | 15 min | Short-lived, stateless JWT |
| Refresh Token | 7 days | Stored as hash in DB (`RefreshToken` table) |

---

## Roles & Access

| Role | Enum | Description |
|---|---|---|
| Admin / PMO | `ADMIN` | Full access to all resources |
| Assessor | `ASSESSOR` | Score assigned stores only |
| Mentor / Coach | `MENTOR` | View results, create IDP, mentoring logs |
| Entrepreneur | `ENTREPRENEUR` | View own store only |
| Judge | `JUDGE` | Submit pitching scores |
| M&E Team | `ME_TEAM` | Read-only dashboard + export |

---

## Response Envelope

All responses are wrapped by `TransformInterceptor`:

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
    "message": "Store not found",
    "details": [ { "field": "...", "message": "..." } ]
  }
}
```

`details` is only present for validation errors (array of field-level messages). No `statusCode` field inside `error` and no top-level `timestamp` — the HTTP status code is the response's actual status code.

---

## Pagination

Query parameters for list endpoints:

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number (1-indexed) |
| `limit` | number | 10 | Items per page (max 100) |
| `search` | string | — | Full-text search (module-specific) |

`sortBy`/`sortOrder` are not implemented — every list query is hardcoded to `orderBy: { createdAt: 'desc' }`.

Paginated response shape:

```json
{
  "items": [...],
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

---

## Assessment Rounds

| Round | Code | Purpose |
|---|---|---|
| T0 | Baseline | Before camp — measure starting state |
| T1 | Post Camp | After camp — measure learning + plan |
| T2 | Field Audit | On-site verification of 20 selected stores |
| T3 | Follow-up 1M | 1-month follow-up |
| T4 | Follow-up 3M | 3-month follow-up |

---

## Scoring

- Each question scored **0–4**
- 8 dimensions with individual weights (total = 100%)
- Dimension score = (sum of dimension scores / max dimension score) × 100
- Total weighted score = Σ (dimension score × weight)

### Dimension Weights

| ID | Dimension | Weight |
|---|---|---|
| 1 | Food Quality & Menu Innovation | 12% |
| 2 | Food Safety & Standards | 15% |
| 3 | Brand & Business Model | 10% |
| 4 | Marketing & Customer Base | 13% |
| 5 | Finance, Cost & Profit | 20% |
| 6 | Operations & Service | 18% |
| 7 | Network, Ingredients & Supply Chain | 5% |
| 8 | Growth Readiness & Program Participation | 7% |

### Score Zones

| Score | Zone | Meaning |
|---|---|---|
| 0–39 | Red Zone | High risk, urgent fix needed |
| 40–59 | Survival Zone | Can continue, system weak |
| 60–74 | Improve Zone | Potential, suitable for Incubation |
| 75–84 | Growth Zone | Ready for fast development |
| 85–100 | Model Zone | Potential role model |

---

## Red Flags

Auto-generated when assessment is submitted.

| Flag | Trigger Condition |
|---|---|
| FOOD_SAFETY | Questions 8–14 average < 2 |
| FINANCIAL | Q28, 29, 30, or 31 score 0–1 |
| OPERATION | Q35, 36, 39, or 41 score 0–1 |
| MARKET | Q21 or 22 score 0–1 |
| LEGAL | Q13 = 0 |
| OWNER_READINESS | Q47 or 48 < 2 |
| EVIDENCE | Q49 < 2 |
| GROWTH | Q50 < 2 |

---

## Common Error Codes

Codes come from `ERROR_CODES` in `src/common/constants/error-codes.const.ts`. Codes actually thrown today:

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_001` | 401 | Invalid login credentials |
| `AUTH_005` | 403 | Account suspended |
| `AUTH_006` | 403 | Account pending approval |
| `AUTH_004` | 401 | Refresh token invalid/expired/revoked |
| `USER_001` | 404 | User not found |
| `USER_002` | 409 | Email already exists |
| `STORE_001` | 404 | Store does not exist |
| `STORE_003` | 400 | `province` not in the `GET /provinces` lookup table |
| `STORE_004` | 404 | Store document does not exist (or belongs to another store) |
| `ASSESS_001` | 404 | Assessment does not exist |
| `ASSESS_002` | 409 | Duplicate (storeId, round) |
| `ASSESS_003` | 400 | Assessment not in a state that allows this action |
| `ASSESS_004` | 400 | Cannot modify a submitted assessment |
| `ASSESS_005` | 400 | Not all 50 questions scored before submit |
| `ASSESS_007` | 404 | Question ID invalid |
| `PERM_001` | 403 | Role/ownership not permitted |
| `FILE_001` | 400 | Invalid file type (thrown as `BadRequestException` from the upload `ParseFilePipe`) |
| `FILE_002` | 400 | File exceeds 10 MB (also `BadRequestException`, not 413) |
| `FILE_003` | 404 | Evidence file not found |
| `VALID_001` | 400 | Generic bad request (default `BadRequestException` code) |
| `VALID_002` | 422 | class-validator DTO validation failed (`ValidationAppException`, includes `details` array) |
| `DB_001`/`DB_002`/`DB_003`/`DB_004`/`DB_005`/`DB_999` | 409/404/400/400/400/500 | Raw Prisma error passthrough (`P2002`/`P2025`/`P2003`/`P2000`/`P2014`/other) |
| `SYS_001` | 500 | Unhandled/unexpected error |

`ASSESS_006` (`SCORE_OUT_OF_RANGE`) is defined in the catalog but never thrown — out-of-range scores are rejected by class-validator (`@Min(0)`/`@Max(4)`) and surface as `VALID_002` instead. `AUTH_002`/`AUTH_003` are defined but unused (no code path currently throws them).
