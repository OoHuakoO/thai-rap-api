# Thai RAP API

Backend REST API for the **Thai Restaurant Acceleration Program** platform.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Framework | NestJS 10 |
| Language | TypeScript 5 |
| ORM | Prisma 5 |
| Database | PostgreSQL (hosted on Supabase) |
| Auth | JWT (Access + Refresh Token rotation) |
| Docs | Swagger / OpenAPI 3.1 |
| Validation | class-validator + class-transformer |
| Logging | Winston via nest-winston |
| Rate Limiting | @nestjs/throttler |

---

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0 (or pnpm / yarn)
- A **PostgreSQL** database (Supabase free tier works)

---

## Getting Started

### 1. Clone and install

```bash
cd thai-rap-api
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — the minimum required values:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."          # same host, no pgbouncer
JWT_ACCESS_SECRET="<32+ char secret>"
JWT_REFRESH_SECRET="<32+ char secret>"
```

Generate secrets:
```bash
openssl rand -base64 48
```

### 3. Setup database

```bash
npm run db:generate      # generate Prisma client
npm run db:migrate       # apply migrations (dev)
```

### 4. Start the server

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

| Path | Description |
|---|---|
| `GET /api/v1/auth/me` | Current user |
| `POST /api/v1/auth/login` | Login |
| `POST /api/v1/auth/register` | Register |
| `POST /api/v1/auth/refresh` | Rotate tokens |
| `POST /api/v1/auth/logout` | Revoke refresh token |

**Swagger UI** (development only): `http://localhost:3000/api/docs`

---

## Project Structure

```
src/
├── common/
│   ├── decorators/        # @CurrentUser, @Public
│   ├── exceptions/        # AppException hierarchy
│   ├── filters/           # GlobalExceptionFilter
│   ├── guards/            # JwtAuthGuard
│   ├── interceptors/      # LoggingInterceptor, TransformInterceptor
│   └── types/             # ApiResponse<T>, PaginatedResult<T>
├── config/                # Typed config factories + Joi env validation
├── database/              # PrismaModule (global), PrismaService
├── modules/
│   └── auth/              # AuthModule — register, login, refresh, logout, me
└── shared/                # Hash utils, pagination utils
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
| `AUTH_003` | Token invalid | 401 |
| `AUTH_004` | Refresh token not found / expired | 401 |
| `AUTH_005` | Account suspended | 403 |
| `AUTH_006` | Account pending activation | 403 |
| `USER_001` | User not found | 404 |
| `USER_002` | Email already exists | 409 |
| `PERM_001` | Forbidden — insufficient role | 403 |
| `VALID_001` | Validation failed | 422 |
| `DB_001` | Unique constraint violation | 409 |
| `DB_002` | Record not found | 404 |
| `DB_003` | Foreign key constraint violation | 400 |
| `RATE_001` | Rate limit exceeded | 429 |
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
| `start:dev` | Watch mode (development) |
| `start:prod` | Run compiled dist/ |
| `build` | Compile TypeScript → dist/ |
| `test` | Run unit tests |
| `test:e2e` | Run end-to-end tests |
| `test:cov` | Unit tests + coverage report |
| `db:generate` | Regenerate Prisma client after schema change |
| `db:migrate` | Apply migrations (development) |
| `db:migrate:prod` | Apply migrations (production, CI-safe) |
| `db:studio` | Open Prisma Studio GUI |
