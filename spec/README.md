# THAI-RAP API — Backend Spec Index

ระบบ THAI-RAP Restaurant Survival Diagnostic System
เทคโนโลยี: NestJS + Prisma + MySQL | Auth: JWT

---

## Spec Files

| File | Module | Endpoints |
|---|---|---|
| [00-overview.md](00-overview.md) | Conventions, Auth, Pagination, Enums, Error codes | — |
| [01-auth.md](01-auth.md) | Auth | login, register, refresh, logout, me, change password |
| [02-users.md](02-users.md) | Users | CRUD, role management, assign stores, avatar |
| [03-stores.md](03-stores.md) | Stores | CRUD, status update, photo upload |
| [04-assessments.md](04-assessments.md) | Assessments + Scores + Evidence | Create/submit assessment, score 50 questions (individual + bulk), upload evidence, analysis, round comparison |
| [05-red-flags.md](05-red-flags.md) | Red Flags | Auto-generated + manual, filter, resolve |
| [06-pitching.md](06-pitching.md) | Pitching | Judge scores (5 criteria × 20 pts), aggregate per store |
| [07-ranking.md](07-ranking.md) | Ranking / Selection | IRS formula, top 20, recalculate, finalize |
| [08-idp.md](08-idp.md) | IDP + Mentoring | Plans (7/30/90 day), mentoring logs |
| [09-field-audit.md](09-field-audit.md) | Field Audit | On-site checklist, evidence upload, T2 round |
| [10-portfolio.md](10-portfolio.md) | Digital Portfolio | 8-dimension portfolio, file upload, completion tracking |
| [11-dashboard.md](11-dashboard.md) | Dashboard | Overview, province stats, dimension stats, store dashboard, OKR progress |
| [12-reports.md](12-reports.md) | Reports | Async report generation, download (PDF/Excel/CSV/JSON) |

---

## Quick Reference — All Endpoints

### Auth `/api/v1/auth`
```
POST   /auth/login
POST   /auth/register
POST   /auth/refresh
POST   /auth/logout
GET    /auth/me
PATCH  /auth/me/password
```

### Users `/api/v1/users`
```
GET    /users
GET    /users/:id
POST   /users
PATCH  /users/:id
DELETE /users/:id
POST   /users/:id/assign-stores
DELETE /users/:id/assign-stores
PATCH  /users/:id/avatar
```

### Stores `/api/v1/stores`
```
GET    /stores
GET    /stores/:id
POST   /stores
PATCH  /stores/:id
PATCH  /stores/:id/status
DELETE /stores/:id
POST   /stores/:id/photos
DELETE /stores/:id/photos
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
POST   /assessments/:id/submit
DELETE /assessments/:id
PUT    /assessments/:id/scores/:questionId
POST   /assessments/:id/scores/bulk
GET    /assessments/:id/scores/progress
POST   /assessments/:id/scores/:questionId/evidences
DELETE /assessments/:id/scores/:questionId/evidences/:evidenceId
GET    /assessments/:id/analysis
GET    /stores/:storeId/assessments/comparison
```

### Red Flags `/api/v1/red-flags`
```
GET    /red-flags
GET    /red-flags/:id
POST   /red-flags
PATCH  /red-flags/:id
GET    /stores/:storeId/red-flags
```

### Pitching `/api/v1/pitching`
```
GET    /pitching
GET    /pitching/store/:storeId
POST   /pitching
PATCH  /pitching/:id
DELETE /pitching/:id
```

### Ranking `/api/v1/ranking`
```
GET    /ranking
GET    /ranking/:storeId
POST   /ranking/recalculate
POST   /ranking/finalize
```

### IDP `/api/v1/idp`
```
GET    /idp
GET    /idp/:id
POST   /idp
DELETE /idp/:id
POST   /idp/:id/plans
PATCH  /idp/:id/plans/:planId
DELETE /idp/:id/plans/:planId
POST   /idp/:id/logs
PATCH  /idp/:id/logs/:logId
DELETE /idp/:id/logs/:logId
```

### Field Audit `/api/v1/field-audit`
```
GET    /field-audit
GET    /field-audit/:id
POST   /field-audit
PATCH  /field-audit/:id
POST   /field-audit/:id/evidence
```

### Portfolio `/api/v1/portfolio`
```
GET    /portfolio
GET    /portfolio/store/:storeId
GET    /portfolio/:id
PUT    /portfolio/store/:storeId/dimension/:dimensionId
POST   /portfolio/store/:storeId/dimension/:dimensionId/files
DELETE /portfolio/store/:storeId/dimension/:dimensionId/files
GET    /portfolio/summary
```

### Dashboard `/api/v1/dashboard`
```
GET    /dashboard/overview
GET    /dashboard/provinces
GET    /dashboard/dimensions
GET    /dashboard/store/:storeId
GET    /dashboard/okr
```

### Reports `/api/v1/reports`
```
GET    /reports
POST   /reports/generate
GET    /reports/:id
GET    /reports/:id/download
DELETE /reports/:id
```
