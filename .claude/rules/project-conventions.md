# Thai RAP API — Project Conventions

## Stack
NestJS 10 + TypeScript, Prisma 5 (PostgreSQL/Supabase), JWT (access + refresh), class-validator, Swagger, Winston.

## Module Structure
Every feature lives under `src/modules/<name>/`:
```
<name>.module.ts
<name>.controller.ts
<name>.service.ts
<name>.repository.ts   ← all Prisma calls here only
dto/
  create-<name>.dto.ts
  update-<name>.dto.ts
```
Register in `src/app.module.ts`.

## Path Aliases
Always use `@common/`, `@modules/`, `@shared/`, `@database/`, `@config/`. Never relative `../../`.

## API Response Envelope
```ts
// success — TransformInterceptor wraps automatically, return raw data from controllers
{ success: true, data: T }

// error — GlobalExceptionFilter handles automatically
{ success: false, error: { code: string, message: string, details?: [] } }
```

## Exceptions
Never throw NestJS built-ins. Always use subclasses from `@common/exceptions/app.exception`:
```ts
import { NotFoundException, ConflictException, UnauthorizedException, ForbiddenException, BadRequestException } from '@common/exceptions/app.exception';

throw new NotFoundException('USER_001', 'User not found');
```

Error code prefixes:
| Prefix | Domain |
|--------|--------|
| `AUTH_` | Authentication / tokens |
| `USER_` | User entity |
| `STORE_` | Store entity |
| `ASSESS_` | Assessment |
| `VALID_` | Validation |
| `PERM_` | Permission / RBAC |
| `DB_` | Database / Prisma |
| `SYS_` | Unexpected / internal |

## Auth & Guards
- All routes are JWT-protected by default (global `JwtAuthGuard`).
- Public routes: `@Public()` from `@common/decorators/public.decorator`.
- Current user: `@CurrentUser()` from `@common/decorators/current-user.decorator`.
- RBAC checks go in the service layer using `user.role` from JWT payload.

## Prisma
- Only `*.repository.ts` files import `PrismaService`.
- Services inject the repository, never `PrismaService` directly.
- Use typed Prisma input types (e.g. `Prisma.UserCreateInput`).

## DTOs
- Every field needs `class-validator` decorator + `@ApiProperty()` for Swagger.
- `whitelist: true` and `forbidNonWhitelisted: true` are global — extra fields are rejected.

## Pagination
Use `buildPaginationMeta` from `@shared/pagination.util`.

## Comments
No explanatory comments. Add a comment only when the WHY is non-obvious. No JSDoc blocks.
