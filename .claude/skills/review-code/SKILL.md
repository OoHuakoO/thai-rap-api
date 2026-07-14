---
name: review-code
description: Review a diff or PR against THAI-RAP project conventions — repository-only Prisma, error codes, RBAC placement, select-only queries, DTO validation, file upload constants. Use when reviewing changes in this repo.
---

# review-code

Review the given diff (or `git diff master...HEAD` if none specified) against this project's conventions. General code-review quality is handled by the built-in `/code-review` — this skill checks only THAI-RAP-specific rules.

## Checklist

### Architecture
- [ ] Prisma calls only in `*.repository.ts` — services never inject `PrismaService`
- [ ] Business logic in service, not controller or repository
- [ ] RBAC checks in service layer using `@CurrentUser()` payload — never role from request body
- [ ] Path aliases (`@common/`, `@modules/`, `@constants/`, ...) — no relative `../../`

### Errors
- [ ] Exceptions from `@common/exceptions/app.exception` only — no NestJS built-ins
- [ ] Error codes from `ERROR_CODES` in `@constants/index` — no inline strings like `'STORE_001'`
- [ ] New domain codes added to `error-codes.const.ts` with correct prefix/range per the catalog

### Prisma
- [ ] `findMany` has explicit `select` on large models
- [ ] No N+1 — no query inside loop over query results
- [ ] Multi-step writes wrapped in `$transaction`
- [ ] Typed inputs (`Prisma.XxxCreateInput`, `Prisma.XxxWhereInput`)
- [ ] Paginated lists use `Promise.all([findMany, count])` + `buildPaginationMeta`

### DTOs
- [ ] Every field has a `class-validator` decorator + `@ApiProperty()`
- [ ] Constrained fields use `@IsEnum` / `@IsUUID` / `@Min` / `@Max`
- [ ] Optional fields have `@IsOptional()` first

### Constants
- [ ] No magic numbers/regexes duplicated across modules — shared values in `src/common/constants/` per `.claude/rules/constants-organization.md`
- [ ] File upload limits/MIME regexes imported from `@constants/index`, never inline

### Scoring (if touched)
- [ ] Formulas match `.claude/rules/project-conventions.md` §Score Calculation / §Red Flag Detection / §Ranking

### Comments & Tests
- [ ] No explanatory comments / JSDoc — comments only for non-obvious WHY
- [ ] Service methods have specs: happy path, not-found, forbidden, conflict

## Output

One line per finding: `file:line — problem — fix`. Group under severity headers, most severe first. Skip empty sections. No praise padding.

### Severity Levels

| Level | Meaning | Examples |
|-------|---------|----------|
| 🔴 **Critical** | Must fix before merge — bug, data loss, security hole | RBAC missing on mutation, role read from request body, multi-step write without `$transaction`, secret/credential in code, wrong scoring formula |
| 🟠 **High** | Fix before merge — breaks a hard project rule | `PrismaService` injected in service, NestJS built-in exception, hardcoded error code string, `findMany` without `select` on large model, N+1 query |
| 🟡 **Medium** | Should fix — convention violation, low blast radius | Missing `@ApiProperty()`, relative import instead of alias, duplicated constant, missing spec case (not-found/forbidden/conflict) |
| ⚪ **Low** | Nit — fix if touching the file anyway | Naming, explanatory comment that should be deleted, minor Swagger polish |

### Format

```
## 🔴 Critical (2)
- src/modules/store/store.service.ts:42 — no RBAC check, ENTREPRENEUR can read any store — add owner check per rule §RBAC
- src/modules/assessment/assessment.service.ts:118 — red flag createMany outside transaction — move into $transaction with the status update

## 🟠 High (1)
- src/modules/store/store.repository.ts:15 — findMany without select — add select with only fields the caller uses

## Verdict
❌ Block — 2 critical, 1 high. Fix critical items before merge.
```

Verdict rules: any Critical or High → `❌ Block`. Medium only → `⚠️ Approve with comments`. Low only or none → `✅ Approve`.
