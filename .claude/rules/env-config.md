# Environment & Config

All runtime configuration flows through `src/config/`. `process.env` is never
read directly inside `src/` — the only exceptions are the `src/config/*.config.ts`
files themselves and standalone Prisma scripts (`prisma/seed.ts`,
`prisma/reset-test-data.ts`).

---

## Adding a New Env Var — All 4 Steps, Same Commit

Skipping any step either crashes boot (missing validation) or leaves the next
developer without documentation.

### 1. Validate in `src/config/env.validation.ts`

Every var appears in the Joi schema. Required vars use `.required()`; optional
vars ALWAYS get a `.default(...)` — no silently-undefined config.

```ts
UPLOAD_BUCKET: Joi.string().required(),
UPLOAD_URL_TTL: Joi.number().default(3600),
```

### 2. Expose via a namespace config

Add to the matching `registerAs` file — `app.config.ts`, `auth.config.ts`,
`database.config.ts`, `throttle.config.ts` — or create
`<concern>.config.ts` for a new concern and register it in both
`src/config/index.ts` and the `load: [...]` array in `app.module.ts`.

```ts
// src/config/upload.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('upload', () => ({
  bucket: process.env.UPLOAD_BUCKET,
  urlTtl: parseInt(process.env.UPLOAD_URL_TTL ?? '3600', 10),
}));
```

### 3. Document in `.env.example`

Add the var under the matching `# ─── Section ───` header with a comment when
the value isn't self-explanatory (format, how to generate, valid options).
Never commit real secrets — `.env.example` holds placeholders only.

### 4. Read via `ConfigService` with the namespaced key

```ts
// ✓
constructor(private readonly config: ConfigService) {}
const bucket = this.config.get<string>('upload.bucket');

// ✗ never in services/controllers/repositories
const bucket = process.env.UPLOAD_BUCKET;
```

---

## Rules

- Validation failure must abort boot — `abortEarly: true` is set in
  `app.module.ts`; don't work around a failing var by reading `process.env`
  directly.
- Secrets (`JWT_*_SECRET`, DB passwords) enforce `.min(32)` or equivalent in
  Joi — copy that pattern for any new secret.
- Parse numbers in the config file (`parseInt`), not at every call site.
- `.env` is gitignored; `.env.example` is the contract. If a teammate's boot
  fails after your change, you skipped step 3.
