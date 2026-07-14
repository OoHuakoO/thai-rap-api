---
name: prisma-migrate
description: Guide safe Prisma schema changes — editing schema.prisma, generating migrations, seeding, and production deploy rules. Use when adding/changing models, fields, or indexes in the database schema.
---

# prisma-migrate

Guide through safe Prisma schema changes for this project.

## Instructions

When invoked, ask the user:
1. What model / field is changing? (add field, add model, add index, rename, delete)
2. Is this a breaking change? (field deletion, type change, NOT NULL on existing table)

Then produce:

---

### Step 1 — Edit `prisma/schema.prisma`

Make the schema change. Follow these rules:

**Adding a new model:**
- Add the model with correct field types and relations
- Add `@@index([fieldName])` for any field used in `WHERE` clauses that isn't `@id` or `@unique`
- If the new model has a foreign key to `Store`, `Assessment`, or `User`, add `onDelete: Cascade` or `onDelete: Restrict` explicitly

**Adding a new field:**
- New required fields on existing tables MUST have a `@default(...)` value, or migration will fail on non-empty tables
- Nullable fields: use `String?` / `Int?` etc.

**Adding an index:**
```prisma
@@index([storeId, round])   // composite index for common filter
@@index([province])         // single field index
```

**Never:**
- Rename a field directly (Prisma treats it as drop+add — data lost). Use `@map("old_name")` to alias instead.
- Remove a field that has existing data without a migration plan.

---

### Step 2 — Generate Migration

```bash
npx prisma migrate dev --name <descriptive-name>
# example: npx prisma migrate dev --name add-export-readiness-score
```

- Migration file is created in `prisma/migrations/`
- Prisma client is auto-regenerated

---

### Step 3 — Verify

```bash
npx prisma studio          # visual check
npx prisma migrate status  # confirm no pending migrations
```

---

### Step 4 — Update TypeScript Types

After schema change, regenerate client:
```bash
npx prisma generate
```

Then update affected repository input types:
```ts
// If new field added to Store:
async create(data: Prisma.StoreCreateInput) { ... }
// Prisma.StoreCreateInput now includes the new field automatically
```

---

### Seed Data (Dimensions + Questions)

Seed file: `prisma/seed.ts`

Run seed:
```bash
npx prisma db seed
```

Seed script must use `upsert` (not `create`) so it's idempotent:
```ts
for (const dim of dimensionsData) {
  await prisma.dimension.upsert({
    where: { id: dim.id },
    update: { name: dim.name, weight: dim.weight },
    create: dim,
  });
}
```

---

### Production Migration

For production (non-dev):
```bash
npx prisma migrate deploy   # runs pending migrations without generating new ones
```

Never run `migrate dev` in production.

---

### Common Index Recommendations for This Project

```prisma
// Assessment — often filtered by store + round
@@index([storeId, round])

// Score — often fetched by assessmentId
@@index([assessmentId])

// RedFlag — filtered by storeId + resolved
@@index([assessmentId, resolved])

// Store — filtered by province + status
@@index([province, status])

// Portfolio — fetched by storeId
@@index([storeId])
```
