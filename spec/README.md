# THAI-RAP API — Backend Spec Index

ระบบ THAI-RAP Restaurant Survival Diagnostic System
NestJS 10 + Prisma 5 + MySQL | Auth: JWT (access token + refresh cookie)

> This spec describes **implemented endpoints only** — it is kept in sync with the controllers under `src/modules/`. Modules that are planned but not built (ranking, IDP / mentoring log, field audit, portfolio) have no spec file here.

---

## Spec Files

| File | Module | Endpoints |
|---|---|---|
| [00-overview.md](00-overview.md) | Conventions, auth, data scope, pagination, scoring, error codes | — |
| [01-auth.md](01-auth.md) | Auth | register, login, refresh, logout, password reset (3 calls) |
| [02-users.md](02-users.md) | Users (SUPER_ADMIN only) | list, stats, detail, approve, suspend, role, store links, delete |
| [03-stores.md](03-stores.md) | Stores + Provinces + Store types | CRUD, status, stats, documents, photos, cover |
| [04-assessments.md](04-assessments.md) | Assessments + Scores + Evidence | dimensions, list, rank, detail, create, score, evidence, notes, draft, submit, history |
| [05-reports.md](05-reports.md) | Reports | per-round, overview, cross-store matrix, exports |
| [06-analytics.md](06-analytics.md) | Analytics | KPIs, radar, trend, action plans, export |
| [07-dashboard.md](07-dashboard.md) | Dashboard | KPIs, province charts, top 20, funnel, store scores, activities, reports status |
| [08-news.md](08-news.md) | News | list, detail, create, edit, delete |
| [09-pitching.md](09-pitching.md) | Pitching (judge scoring forms) | criteria, list, ranking, store report, create, patch, score, submit |

---

## Quick Reference — All Implemented Endpoints

### Auth `/api/v1/auth`
```
POST   /auth/register           [PUBLIC]
POST   /auth/login              [PUBLIC]
POST   /auth/refresh            [PUBLIC]
POST   /auth/logout
POST   /auth/forgot-password    [PUBLIC]
POST   /auth/verify-otp         [PUBLIC]
POST   /auth/reset-password     [PUBLIC]
```
There is no `GET /auth/me` and no change-password route.

### Users `/api/v1/users` — SUPER_ADMIN only
```
GET    /users
GET    /users/stats
GET    /users/:id
PATCH  /users/:id/approve
PATCH  /users/:id/suspend
PATCH  /users/:id/role
PATCH  /users/:id/assigned-stores
PATCH  /users/:id/owned-stores
DELETE /users/:id
```
No `POST /users` — accounts come from `POST /auth/register`.

### Lookups
```
GET    /provinces
GET    /store-types
GET    /dimensions
```
No `GET /questions` and no `GET /dimensions/:id/questions` — question text ships with the assessment.

### Stores `/api/v1/stores`
```
GET    /stores
GET    /stores/stats
GET    /stores/:id
POST   /stores
PATCH  /stores/:id
PATCH  /stores/:id/status
DELETE /stores/:id
POST   /stores/:id/documents
DELETE /stores/:id/documents/:documentId
POST   /stores/:id/menu-photos
DELETE /stores/:id/menu-photos
POST   /stores/:id/cover
DELETE /stores/:id/cover
POST   /stores/:id/store-photos
DELETE /stores/:id/store-photos
```

### Assessments `/api/v1`
```
GET    /assessments
GET    /assessments/rank
GET    /assessments/:id
POST   /assessments
PUT    /assessments/:id/scores/:questionId
POST   /assessments/:id/scores/:questionId/evidence
DELETE /assessments/:id/evidence/:evidenceId
PATCH  /assessments/:id/notes
PATCH  /assessments/:id/draft
POST   /assessments/:id/submit
GET    /assessment/:storeId/history
```
No bulk score, no progress endpoint, no `DELETE /assessments/:id`.

### Reports `/api/v1/reports`
```
GET    /reports/stores/:storeId/rounds/:round
GET    /reports/stores/:storeId/rounds/:round/export
GET    /reports/rounds/:round/stores            [ADMIN only]
GET    /reports/rounds/:round/stores/export     [ADMIN only]
GET    /reports/stores/:storeId/overview
GET    /reports/stores/:storeId/overview/export
```

### Analytics `/api/v1/analytics`
```
GET    /analytics/:storeId
GET    /analytics/:storeId/radar
GET    /analytics/:storeId/trend
GET    /analytics/:storeId/export
```

### Dashboard `/api/v1/dashboard`
```
GET    /dashboard/kpis
GET    /dashboard/province-distribution
GET    /dashboard/top20
GET    /dashboard/incubation-progress
GET    /dashboard/province-comparison
GET    /dashboard/store-scores
GET    /dashboard/store-scores/export
GET    /dashboard/activities
GET    /dashboard/reports-status
```

### News `/api/v1/news`
```
GET    /news
GET    /news/:id
POST   /news        [ADMIN]
PATCH  /news/:id    [ADMIN]
DELETE /news/:id    [ADMIN]
```

### Pitching `/api/v1/pitching`
```
GET    /pitching/criteria
GET    /pitching
GET    /pitching/summary
GET    /pitching/stores/:storeId
GET    /pitching/:id
POST   /pitching                            [JUDGE / ADMIN]
PATCH  /pitching/:id                        [JUDGE / ADMIN]
PUT    /pitching/:id/scores/:criterionId    [JUDGE / ADMIN]
POST   /pitching/:id/submit                 [JUDGE / ADMIN]
```
No `DELETE`. Submitting never writes `Store.status`.

---

## Related

- Machine-readable contract: `../../openapi.yaml` — **generated**, run `npm run openapi` after changing a controller or DTO; never hand-edit it.
- Cross-repo wire-format rules: `../.claude/rules/api-contract.md`.
