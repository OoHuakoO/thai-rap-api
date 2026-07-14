# Seed Data

`prisma/seed.ts` is not sample data — it is business logic. Dimension weights
and question numbering feed directly into score calculation and red flag
detection. Treat every seed change as a logic change, not a data tweak.

---

## What the Seed Owns

| Data | Key | Rule |
|------|-----|------|
| Province | `nameTh` | `update: {}` — never overwrite existing rows, only insert missing |
| Dimension | `id` (1–8) | Fixed ids. `weight` values must sum to exactly 100 |
| Question | `id` = `questionNo` (1–50) | Global numbering across dimensions, in `DIMENSIONS` array order. `maxScore` is always 4 |

`seed.ts` already throws if weights ≠ 100 or question count ≠ 50 — never
remove or weaken those guards.

---

## Question Numbering Is Load-Bearing

`questionNo` runs 1–50 continuously across dimensions. Red flag detection in
`project-conventions.md` §Red Flag Detection matches on **absolute question
numbers**:

- Q8–14 → FOOD_SAFETY
- Q13 → LEGAL
- Q21–22 → MARKET
- Q28–31 → FINANCIAL
- Q35, 36, 39, 41 → OPERATION
- Q47–48 → OWNER_READINESS / mindset score in IRS
- Q49 → EVIDENCE / evidence score in IRS
- Q50 → GROWTH

Therefore:

- **Never reorder** dimensions in the `DIMENSIONS` array or questions within a
  dimension — numbering shifts and every red flag rule silently points at the
  wrong question.
- **Never insert or delete** a question in the middle. A new question policy
  means re-mapping the red flag ranges in `project-conventions.md` AND
  `AssessmentService.detectRedFlags` in the same change.
- Rewording question text is safe (upsert updates `questionText` in place).

---

## Changing Weights

`Dimension.weight` feeds `totalScore = Σ (dimensionScore × weight / 100)`.
Changing any weight:

1. Adjust other weights so the sum stays 100 (seed throws otherwise).
2. Understand that already-submitted assessments keep their stored
   `totalScore` — historical scores are NOT recalculated. Mixing old and new
   weights across rounds skews improvement delta and IRS ranking. Flag this
   to the user before changing weights on a DB with submitted assessments.

---

## Mechanics

- Every seed operation is an `upsert` — the seed must be idempotent; running
  it twice must be a no-op.
- Run with `npm run db:seed` (uses `.env`'s `DATABASE_URL`).
- `prisma/reset-test-data.ts` wipes transactional data (Evidence, Score,
  RedFlag, Assessment, StoreDocument, Store — children before parents) and
  **keeps** seed data, User, RefreshToken. Manual/dev use only — never CI or
  production.
