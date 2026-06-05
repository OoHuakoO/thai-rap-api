# THAI-RAP API — Overview & Conventions

## Base URL
```
/api/v1
```

## Tech Stack
- Runtime: NestJS (TypeScript)
- ORM: Prisma + MySQL
- Auth: JWT (access + refresh token)
- File upload: Multipart form-data → cloud storage (S3/GCS)

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
  "data": { ... },
  "message": "OK",
  "timestamp": "2026-06-05T10:00:00.000Z"
}
```

Error responses (from `GlobalExceptionFilter`):

```json
{
  "success": false,
  "error": {
    "code": "STORE_NOT_FOUND",
    "message": "Store not found",
    "statusCode": 404
  },
  "timestamp": "2026-06-05T10:00:00.000Z"
}
```

---

## Pagination

Query parameters for list endpoints:

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number (1-indexed) |
| `limit` | number | 20 | Items per page (max 100) |
| `search` | string | — | Full-text search |
| `sortBy` | string | `createdAt` | Sort field |
| `sortOrder` | `asc` \| `desc` | `desc` | Sort direction |

Paginated response shape:

```json
{
  "items": [...],
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
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

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Role not permitted |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate resource |
| `VALIDATION_ERROR` | 422 | Invalid request body |
| `STORE_NOT_FOUND` | 404 | Store does not exist |
| `ASSESSMENT_NOT_FOUND` | 404 | Assessment does not exist |
| `ASSESSMENT_ALREADY_EXISTS` | 409 | Duplicate (storeId, round) |
| `ASSESSMENT_SUBMITTED` | 400 | Cannot modify submitted assessment |
| `QUESTION_NOT_FOUND` | 404 | Question ID invalid |
| `SCORE_OUT_OF_RANGE` | 422 | Score must be 0–4 |
| `FILE_TOO_LARGE` | 413 | Max 10 MB per file |
| `INVALID_FILE_TYPE` | 422 | Only image/pdf/xlsx allowed |
