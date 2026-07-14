---
name: new-module
description: Scaffold a complete NestJS feature module (repository, service, controller, DTOs, module registration) following THAI-RAP project conventions. Use when adding a new feature domain under src/modules/.
---

# new-module

Scaffold a complete NestJS feature module for this project following all project conventions.

## Instructions

When invoked with a module name (e.g. `/new-module users`), create all of the following files. Use the module name in singular snake_case for file names and PascalCase for class names.

### 1. `src/modules/<name>/<name>.repository.ts`
- Inject `PrismaService` from `@database/prisma.service`
- Contains all Prisma operations (findById, findAll, create, update, delete, etc.)
- Use typed Prisma input types from `@prisma/client`

### 2. `src/modules/<name>/<name>.service.ts`
- Inject the repository (never PrismaService directly)
- Business logic and validation here
- Throw exceptions from `@common/exceptions/app.exception` only
- Use appropriate error codes per the project conventions (e.g. `STORE_001`, `USER_001`)

### 3. `src/modules/<name>/<name>.controller.ts`
- `@ApiTags('<Name>')` and full Swagger decorators on every route
- `@ApiBearerAuth()` on protected routes
- `@Public()` on any public route
- `@CurrentUser()` to get JWT payload
- Return raw data — `TransformInterceptor` wraps automatically
- Standard HTTP codes: GET=200, POST=201, PATCH=200, DELETE=200

### 4. `src/modules/<name>/dto/create-<name>.dto.ts`
- Full `class-validator` decorators on every field
- `@ApiProperty()` on every field with description and example

### 5. `src/modules/<name>/dto/update-<name>.dto.ts`
- Extend create DTO with `PartialType` from `@nestjs/swagger`

### 6. `src/modules/<name>/<name>.module.ts`
- Import `PrismaModule` from `@database/prisma.module`
- Provide service and repository
- Export service if other modules might need it

### 7. Register module
Add the new module to the `imports` array in `src/app.module.ts`.

## Output
After creating all files, show the user:
- List of created files
- The import line to add to `app.module.ts` (if not done automatically)
- Any Prisma schema models that might need to be created
