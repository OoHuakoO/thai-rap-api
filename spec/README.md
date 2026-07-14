# THAI-RAP API — Backend Spec Index

ระบบ THAI-RAP Restaurant Survival Diagnostic System
เทคโนโลยี: NestJS + Prisma + MySQL | Auth: JWT

> This spec describes **implemented endpoints only** — it is kept in sync with the actual code. Features that are planned but not built (users CRUD, red-flag endpoints, pitching, ranking, IDP, field audit, portfolio, dashboard, reports) have no spec file here; their specs will be added when the modules are implemented. Progress tracking lives in `../plan/progress.md`.

---

## Spec Files

| File | Module | Endpoints |
|---|---|---|
| [00-overview.md](00-overview.md) | Conventions, Auth, Pagination, Enums, Error codes | — |
| [01-auth.md](01-auth.md) | Auth | register, login, refresh, logout, me |
| [03-stores.md](03-stores.md) | Stores + Provinces | CRUD, status, stats, documents, menu photos, cover, store photos |
| [04-assessments.md](04-assessments.md) | Assessments + Scores + Evidence | Dimensions/questions lookup, create/submit assessment, score 50 questions (individual + bulk), progress, evidence upload |

---

## Quick Reference — All Implemented Endpoints

### Auth `/api/v1/auth`
```
POST   /auth/register        [PUBLIC]
POST   /auth/login           [PUBLIC]
POST   /auth/refresh         [PUBLIC]
POST   /auth/logout
GET    /auth/me
```

### Provinces `/api/v1/provinces`
```
GET    /provinces
```

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

### Dimensions & Questions
```
GET    /dimensions
GET    /dimensions/:id/questions
GET    /questions
```

### Assessments `/api/v1/assessments`
```
GET    /assessments
GET    /assessments/:id
POST   /assessments
PUT    /assessments/:id/scores/:questionId
POST   /assessments/:id/scores/bulk
POST   /assessments/:id/scores/:questionId/evidence
DELETE /assessments/:id/evidence/:evidenceId
GET    /assessments/:id/scores/progress
POST   /assessments/:id/submit
DELETE /assessments/:id
```
