# thai-rap-api

NestJS 10 backend for THAI-RAP. Prisma 7 + MySQL, JWT auth, local disk uploads.
Source of truth for the programme's data, permissions, and scoring — the web app
mirrors this, never the reverse.

Served under `/api/v1` (`setGlobalPrefix` in `main.ts`). Swagger at `/api/docs`
outside production. Uploaded files are static assets under `/uploads/`.

## Read these before writing code

**Open the relevant file — this page is an index, not a summary.**

| Need | Open |
|---|---|
| How to write it here — module layout, Prisma rules, DTOs, exceptions, scoring | `.claude/rules/project-conventions.md` |
| What endpoints exist and what they return | `spec/README.md` (9 files; `spec/00-overview.md` covers auth, scope, pagination, error codes) |
| Changing anything that goes over the wire | `.claude/rules/api-contract.md` — **this is a two-repo change** |
| Env vars, constants, seed data | `.claude/rules/env-config.md`, `constants-organization.md`, `seed-data.md` |

`.claude/rules/` is **normative** (holds whether or not the code obeys it);
`spec/` is **descriptive** (a snapshot the next commit can invalidate).
Inventories, counts, and known gaps belong in `spec/`, never in a rule — and
never in this file, which is a router. Same contract as `../thai-rap-web/`; the
reasoning is written out in `../thai-rap-web/.claude/rules/README.md`.

## Shape of a module

```
src/modules/<name>/
  <name>.module.ts
  <name>.controller.ts       thin — returns raw data, the interceptor wraps it
  <name>.service.ts          business logic, scope checks
  <name>.repository.ts       every Prisma call lives here, and only here
  dto/                       create- / update- / query-<name>.dto.ts
```

Register in `src/app.module.ts`. Import via `@common/` `@constants/` `@config/`
`@database/` `@modules/` `@shared/` — never a relative `../../`.

Cross-cutting pieces: `TransformInterceptor` wraps success as
`{ success, data }`; `GlobalExceptionFilter` renders
`{ success: false, error: { code, message, details? } }`; `JwtAuthGuard` is
global (opt out with `@Public()`); data scope is resolved in one place,
`src/shared/store-scope.util.ts`.

## Skills

`.claude/skills/` covers the routine work — invoke rather than improvising:
`new-module`, `new-endpoint`, `add-error-code`, `prisma-migrate`,
`prisma-query`, `write-tests`, `review-code`, `score-analysis`.

## Commands

```bash
npm run start:dev    # watch mode
npm run lint         # eslint --fix
npm run test         # jest
npm run openapi      # regenerates ../openapi.yaml — never hand-edit that file
npm run db:migrate   # prisma migrate dev
npm run db:seed
npm run db:studio
```

## Non-negotiables

- Prisma calls live in a repository. A service or controller touching Prisma
  directly is a bug.
- **Error codes are a public contract.** Never renumber, reuse, or repurpose
  one — clients match on the string. Add a new code instead.
- Question numbering and dimension weights in the seed are load-bearing for
  every score already stored. Read `seed-data.md` before touching either.
- A wire-format change is not done until `../thai-rap-web` is swept — its MSW
  handlers, types, and `accept` attributes mirror this API by hand.
- When a change makes a sentence in `spec/` or a rule false, fix it in the same
  PR.
