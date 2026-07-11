# Thai RAP API

Backend REST API for the **Thai Restaurant Acceleration Program** platform.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Framework | NestJS 10 |
| Language | TypeScript 5 |
| ORM | Prisma 7 (`@prisma/adapter-mariadb`) |
| Database | MySQL |
| Auth | JWT (Access + Refresh Token rotation) |
| Docs | Swagger / OpenAPI 3.1 (dev only) |
| Validation | class-validator + class-transformer |
| Logging | Winston via nest-winston |
| Rate Limiting | @nestjs/throttler |

---

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0 (or yarn)
- **Docker** (for local MySQL via `docker-compose.yml`) — or a MySQL 8 instance reachable another way

---

## Getting Started

### 1. Clone and install

```bash
cd thai-rap-api
npm install       # postinstall runs `prisma generate` automatically
```

### 2. Start local database

```bash
docker compose up -d      # starts MySQL (port 3306) + phpMyAdmin (port 8080)
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — the minimum required values:

```env
DATABASE_URL="mysql://root:root@localhost:3306/thai_rap?allowPublicKeyRetrieval=true"
JWT_ACCESS_SECRET="<32+ char secret>"
JWT_REFRESH_SECRET="<32+ char secret>"
CORS_ORIGINS="http://localhost:3000"
COOKIE_SAME_SITE="lax"
```

Generate secrets:
```bash
openssl rand -base64 48
```

All config is read from a single `.env` file (git-ignored). On the production server, replace the values above with the real database, secrets, and `CORS_ORIGINS` for that environment before starting the app — see [Deployment](#deployment).

### 4. Setup database

```bash
npm run db:generate      # generate Prisma client
npm run db:migrate       # apply migrations (dev — creates new migration if schema changed)
npm run db:seed          # seed dimensions & questions (required before using assessments)
```

For production (applies existing migrations only, does not create new ones):

```bash
npm run db:migrate:prod  # prisma migrate deploy
npm run db:seed
```

### 5. Start the server

```bash
# Development (watch mode)
npm run start:dev

# Production
npm run build
npm run start:prod
```

The server starts at `http://localhost:3000`.

---

## API

All paths below are relative to `/api/v1`.

### Auth
| Path | Description |
|---|---|
| `POST /auth/register` | Register |
| `POST /auth/login` | Login |
| `POST /auth/refresh` | Rotate tokens |
| `POST /auth/logout` | Revoke refresh token |
| `GET /auth/me` | Current user |

### Stores
| Path | Description |
|---|---|
| `GET /stores` | List stores |
| `GET /stores/stats` | Store status breakdown |
| `GET /stores/:id` | Get store |
| `POST /stores` | Create store |
| `PATCH /stores/:id` | Update store |
| `PATCH /stores/:id/status` | Update store status |
| `DELETE /stores/:id` | Delete store |

### Assessment
| Path | Description |
|---|---|
| `GET /dimensions` | List scoring dimensions |
| `GET /dimensions/:id/questions` | Questions for a dimension |
| `GET /questions` | List all questions |
| `GET /assessments` | List assessments |
| `GET /assessments/:id` | Get assessment (with scores) |
| `POST /assessments` | Create assessment (T0–T4 round) |
| `PUT /assessments/:id/scores/:questionId` | Score a question |
| `POST /assessments/:id/scores/bulk` | Bulk score questions |
| `POST /assessments/:id/scores/:questionId/evidence` | Upload evidence file for a score |
| `DELETE /assessments/:id/evidence/:evidenceId` | Delete evidence file |
| `GET /assessments/:id/scores/progress` | Scoring progress (X of 50 answered) |
| `POST /assessments/:id/submit` | Submit assessment (locks scores, runs red-flag detection) |
| `DELETE /assessments/:id` | Delete assessment |

**Swagger UI** (development only): `http://localhost:3000/api/docs` (or whatever `PORT` is set to)

---

## Project Structure

```
src/
├── common/
│   ├── constants/         # ERROR_CODES (all error code strings)
│   ├── decorators/        # @CurrentUser, @Public
│   ├── dto/               # PaginationDto
│   ├── exceptions/        # AppException hierarchy (Not Found, Conflict, ...)
│   ├── filters/           # GlobalExceptionFilter
│   ├── guards/            # JwtAuthGuard
│   ├── interceptors/      # LoggingInterceptor, TransformInterceptor
│   └── types/             # ApiResponse<T>, PaginatedResult<T>
├── config/                # Typed config factories + Joi env validation
├── database/              # PrismaModule (global), PrismaService
├── modules/
│   ├── auth/              # AuthModule — register, login, refresh, logout, me
│   ├── store/              # StoreModule — restaurant store profiles
│   └── assessment/          # AssessmentModule — dimensions, questions, scores, evidence
│       # each module: *.module.ts, *.controller.ts, *.service.ts, *.repository.ts (Prisma calls only), dto/
└── shared/                # File storage, hash, pagination utils
```

---

## Response Envelope

All endpoints return the same envelope:

**Success**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error**
```json
{
  "success": false,
  "error": {
    "code": "AUTH_001",
    "message": "Invalid credentials"
  }
}
```

**Validation Error**
```json
{
  "success": false,
  "error": {
    "code": "VALID_001",
    "message": "Validation failed",
    "details": [
      { "field": "email", "message": "email must be a valid email address" }
    ]
  }
}
```

---

## Error Code Reference

| Code | Meaning | HTTP |
|---|---|---|
| `AUTH_001` | Invalid credentials | 401 |
| `AUTH_002` | Token expired | 401 |
| `AUTH_003` | Unauthorized | 401 |
| `AUTH_004` | Refresh token not found / expired | 401 |
| `AUTH_005` | Account suspended | 403 |
| `AUTH_006` | Account pending activation | 403 |
| `USER_001` | User not found | 404 |
| `USER_002` | Email already exists | 409 |
| `USER_003` | Forbidden — insufficient role | 403 |
| `STORE_001` | Store not found | 404 |
| `STORE_002` | Duplicate store | 409 |
| `ASSESS_001` | Assessment not found | 404 |
| `ASSESS_002` | Assessment already exists for this round | 409 |
| `ASSESS_003` | Invalid assessment state | 400 |
| `ASSESS_004` | Assessment already submitted | 409 |
| `ASSESS_005` | Not all questions scored | 400 |
| `ASSESS_006` | Score out of range | 400 |
| `ASSESS_007` | Question not found | 404 |
| `PERM_001` | Forbidden — insufficient role | 403 |
| `VALID_001` | Validation failed | 422 |
| `FILE_001` | Invalid file type | 400 |
| `FILE_002` | File too large | 400 |
| `FILE_003` | File not found | 404 |
| `DB_001` | Unique constraint violation | 409 |
| `DB_002` | Record not found | 404 |
| `DB_003` | Foreign key constraint violation | 400 |
| `DB_004` | Invalid data | 400 |
| `DB_005` | Null constraint violation | 400 |
| `DB_999` | Unhandled database error | 500 |
| `SYS_001` | Internal server error | 500 |

---

## Authentication Flow

```
POST /auth/login  → { accessToken (15m), refreshToken (7d) }
                           ↓
         Request with Bearer <accessToken>
                           ↓ (token expired)
POST /auth/refresh  with refreshToken in body
          → new { accessToken, refreshToken }   ← token rotation
```

Refresh tokens are stored as **bcrypt hashes** in the database — revocable per user session.

---

## Roles & Access Control

Roles (`Role` enum in `prisma/schema.prisma`): `ADMIN`, `ASSESSOR`, `MENTOR`, `ENTREPRENEUR`, `JUDGE`, `ME_TEAM`.

- Every route requires a valid JWT by default (global `JwtAuthGuard`) — mark a route `@Public()` to opt out.
- Role checks happen in the **service layer**, not the controller, using the JWT payload from `@CurrentUser()` — never a role passed in the request body.
- Example: an `ENTREPRENEUR` can only access their own store; an `ASSESSOR` only stores they're assigned to.

---

## Testing

```bash
# Unit tests
npm run test

# Unit tests with coverage
npm run test:cov

# E2E tests (requires a running test database)
npm run test:e2e
```

---

## Scripts Reference

| Script | Description |
|---|---|
| `start` | Start without watch mode |
| `start:dev` | Watch mode (development) |
| `start:debug` | Watch mode with Node debugger attached |
| `start:prod` | Run compiled `dist/` |
| `build` | Compile TypeScript → `dist/` |
| `lint` | ESLint (auto-fix) on `src/` and `test/` |
| `format` | Prettier write on `src/` and `test/` |
| `test` | Run unit tests |
| `test:watch` | Unit tests in watch mode |
| `test:e2e` | Run end-to-end tests |
| `test:cov` | Unit tests + coverage report |
| `db:generate` | Regenerate Prisma client after schema change (also runs automatically on `npm install` via `postinstall`) |
| `db:migrate` | Apply migrations (development) |
| `db:migrate:prod` | Apply migrations (production, CI-safe — `prisma migrate deploy`) |
| `db:studio` | Open Prisma Studio GUI |
| `db:seed` | Seed dimensions & questions (`prisma/seed.ts`) |

---

## Deployment

Runs behind an Apache reverse proxy, managed by PM2.

```bash
npm ci
npm run db:migrate:prod
npm run build
pm2 start ecosystem.config.js --env production   # first time
pm2 reload ecosystem.config.js --env production   # subsequent deploys
```

`deploy.sh` wraps the steps above (pull → install → migrate → build → PM2 reload).

`ecosystem.config.js` sets `NODE_ENV=production` for the process — make sure `.env` on the server has production values (real `DATABASE_URL`, JWT secrets, `CORS_ORIGINS`) before starting.

Apache must proxy `/api` to this app and leave other paths (e.g. the frontend, or any static admin tools like phpMyAdmin) alone:

```apache
ProxyPass /api http://127.0.0.1:4000/api
ProxyPassReverse /api http://127.0.0.1:4000/api
```

A catch-all `ProxyPass /` for the frontend must come **after** this and after any other path-specific rules (e.g. `ProxyPass /data !` to exclude a path from proxying entirely).
