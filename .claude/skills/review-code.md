# Skill: review-code

Review code against this project's conventions. Output findings by severity.

## Trigger
`/review-code`

## Checklist

### CRITICAL — Security & Auth

- [ ] No role check bypass — RBAC enforced in service, not controller
- [ ] `@CurrentUser()` used — never trust `userId` from request body
- [ ] `@Public()` on routes that should require it NOT set (confirm intentional)
- [ ] No raw SQL injection vectors (parameterized queries only via Prisma)
- [ ] Sensitive data (password hash, token) not returned in responses
- [ ] File upload validated with `MaxFileSizeValidator` + `FileTypeValidator`
- [ ] No secrets or credentials logged

### CRITICAL — Data Integrity

- [ ] Multi-step writes use `$transaction` (e.g., submit assessment + create red flags)
- [ ] Upserts use compound unique key, not create (to prevent duplicates)
- [ ] Score submission validates all 50 questions scored before accepting

### MAJOR — Architecture

- [ ] Controller contains NO business logic — delegate to service
- [ ] Service contains NO Prisma calls — delegate to repository
- [ ] Repository is the ONLY file importing `PrismaService`
- [ ] Exceptions thrown from `@common/exceptions/app.exception` only — no raw NestJS exceptions
- [ ] Error codes follow prefix catalog (AUTH_, STORE_, ASSESS_, etc.)

### MAJOR — Database Performance

- [ ] No N+1 queries — loops that fire per-item DB calls replaced with `include` or `IN` query
- [ ] `select` specified on all `findMany` / `findUnique` that touch large models (Store, Assessment, Score)
- [ ] Paginated lists use `Promise.all([findMany, count])` not sequential awaits
- [ ] `createMany` / `updateMany` used for bulk ops — not loops of individual queries
- [ ] Frequently filtered fields have `@@index` in schema (storeId, province, status, round)

### MAJOR — DTO & Validation

- [ ] Every DTO field has `class-validator` decorator
- [ ] Every DTO field has `@ApiProperty()` for Swagger
- [ ] Scores: `@IsInt() @Min(0) @Max(4)` on rawScore fields
- [ ] Update DTOs use `PartialType` (not manually duplicated optional fields)
- [ ] Query param DTOs extend `PaginationDto` when page/limit used

### MAJOR — Score Calculation

- [ ] Dimension score formula correct: `(Σ scores / (questionCount × 4)) × 100`
- [ ] Total weighted score: `Σ (dimensionScore × weight / 100)`
- [ ] Red flag detection runs inside submit transaction
- [ ] Zone mapping uses correct thresholds: <40 Red, <60 Survival, <75 Improve, <85 Growth, else Model
- [ ] IRS formula weights match spec: T1×0.40 + improvement×0.25 + pitching×0.20 + mindset×0.10 + evidence×0.05

### MINOR — Code Quality

- [ ] No explanatory comments — only non-obvious WHY comments
- [ ] No JSDoc blocks
- [ ] Relative imports (`../../`) replaced with path aliases (`@modules/`, `@common/`, etc.)
- [ ] `async/await` used consistently — no `.then().catch()` chains
- [ ] Return types explicit on public service methods

### MINOR — API Design

- [ ] HTTP status codes correct: GET=200, POST=201, PATCH=200, DELETE=200
- [ ] List endpoints support pagination (page, limit, search, sortBy, sortOrder)
- [ ] Filter endpoints support relevant fields (province, status, round, etc.)
- [ ] No business data in 500 error responses

---

## Output Format

```
## Critical
<file>:<line> — <issue> — <fix>

## Major
<file>:<line> — <issue> — <fix>

## Minor
<file>:<line> — <issue> — <fix>

## Suggestions
<optional improvement>
```

If no issues in a category, omit that section.
