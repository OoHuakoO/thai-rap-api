# Pitching — `/api/v1/pitching`

The judges' scoring forms. Two rounds, one form per judge per store per round,
transcribed from the programme's paper forms in `../../docs/`:

| `PitchingRound` | Paper form | Shape |
|---|---|---|
| `PITCH_DECK` | แบบประเมิน Pitch Deck เพื่อคัดเลือกเข้า Incubation | 10 criteria, no sections |
| `ACCELERATION` | แบบประเมินคัดเลือกผู้ประกอบการ Incubation สู่ Acceleration | 16 criteria in หมวด A (40) + หมวด B (60), plus two minimum conditions |

Both are marked out of 100. `prisma/seed.ts` throws if a round's criteria stop
summing to 100.

**Submitting a form writes nothing outside the pitching tables.** `Store.status`
is never touched — selection is a committee decision taken later on the averaged
scores, and `StoreStatus.PITCHING_COMPLETED` is not set from here.

---

## Endpoints

```
GET    /pitching/criteria                  ?round=              master criteria
GET    /pitching                           ?storeId= &round= &judgeId= &status= &page= &limit=
GET    /pitching/summary                   ?round= &province= &page= &limit=   ranking across stores
GET    /pitching/summary/export            ?round= &province= &format=
GET    /pitching/stores/:storeId           ?round=              one store's report
GET    /pitching/stores/:storeId/export    ?round= &format=
GET    /pitching/:id
POST   /pitching                           { storeId, round }
PATCH  /pitching/:id                       header / conditions / comments / verdict
PUT    /pitching/:id/scores/:criterionId
POST   /pitching/:id/submit
```

There is no `DELETE`. A judge revises its own draft; a submitted form is frozen
for everyone, admins included.

## Access

`PITCHING_READ_ROLES` and `PITCHING_WRITE_ROLES` both hold **SUPER_ADMIN, ADMIN,
JUDGE** and nobody else — the narrowest lists in the project, see
[00-overview.md](00-overview.md). JUDGE is additionally assignment-scoped
(`ASSIGNMENT_SCOPED_ROLES`), so a judge reaches only the stores a SUPER_ADMIN
gave it through `PATCH /users/:id/assigned-stores`, on `/pitching*` and on
`/stores*` and `/dashboard/*` alike.

---

## Data model

`PitchingCriterion` is seeded master data with pinned ids — `101–110` for
`PITCH_DECK`, `201–216` for `ACCELERATION`. Each row carries `code` (as printed
on the form: `"1"`, `"5.4"`), `section` (`"A"` / `"B"`, null on the pitch deck
form), `guideline` (the rubric text) and its own `maxScore` (2–15).

`Pitching` is one judge's form: `@@unique([storeId, round, judgeId])`.
`PitchingScore` is one criterion within it: `@@unique([pitchingId, criterionId])`.

### Fields that only apply to `ACCELERATION`

| Field | Form section |
|---|---|
| `prototypeProduct` | ผลิตภัณฑ์/เมนูต้นแบบ (header) |
| `scoreCardTotal` (0–40) | เงื่อนไขขั้นต่ำ 1 — Score Card 8 มิติ |
| `participationPct` (0–100) | เงื่อนไขขั้นต่ำ 2 — เข้าร่วมกิจกรรมและส่งงาน |
| `evidenceChecked` | หลักฐานที่ตรวจสอบ — 9 keys |
| `noConflictOfInterest` | ☐ ข้าพเจ้าไม่มีส่วนได้เสียกับกิจการที่ประเมิน |

`scoreCardTotal` is the judge's own reading off the evidence file, **not**
derived from the store's `Assessment` rows — the paper form is filled in the
room and has to reproduce what was decided there.

### Keyed JSON columns

`comments` and `evidenceChecked` are validated against per-round key lists in
`src/modules/pitching/pitching.const.ts`; an unknown key is `PITCH_003`.

| Round | `comments` keys |
|---|---|
| `PITCH_DECK` | `strengths`, `urgentImprovements`, `salesCostFeasibility`, `productMarketPotential`, `suggestions` |
| `ACCELERATION` | `strengths`, `risks`, `conditions`, `fundingSuggestions` |

`evidenceChecked` keys (`ACCELERATION` only): `SCORE_CARD`, `SOP`, `COSTING`,
`ACCOUNTING`, `PARTICIPATION_REPORT`, `MARKET_VALIDATION`,
`PRODUCTION_CAPACITY`, `STANDARDS`, `FINANCIAL_PLAN`. The `PITCH_DECK` list is
empty — that form has no checklist, so any key sent with it is rejected.

### Verdict (`PitchingRecommendation`)

`SELECTED`, `WAITING_LIST`, `NOT_SELECTED` on both forms;
`MINIMUM_NOT_MET` on `ACCELERATION` only (`PITCH_009` otherwise).

---

## Scoring

`totalScore` is a plain Σ of the criterion scores — no weighting, because each
criterion already carries its own `maxScore`. It is frozen at submit; a draft
reports `totalScore: null` and a live `currentScore`.

`level` comes from `getPitchingLevel()`, the same cut points on both forms:

| Score | `level` | Form wording |
|---|---|---|
| ≥ 80 | `HIGHLY_SUITABLE` | เหมาะสมมาก |
| 70–79 | `SUITABLE` | เหมาะสม |
| 60–69 | `FAIR` | พอใช้ / สำรอง |
| < 60 | `NOT_READY` | ยังไม่พร้อม |

### Minimum conditions (`ACCELERATION`)

`evaluateMinimumConditions()` returns `{ scoreCardPassed, participationPassed,
passed }` — `scoreCardTotal ≥ 30` and `participationPct ≥ 90`. **An unrecorded
reading counts as failed.** Failing does not block submit: the form allows a
recorded special-case decision, so the flag is reported and the judge chooses
`MINIMUM_NOT_MET` (or does not). What submit *does* require for this round is
that both readings are present at all (`PITCH_008`).

### Submit preconditions

1. Every criterion of that round has a score (`PITCH_005` lists the missing codes).
2. `recommendation` is set (`PITCH_009`).
3. `ACCELERATION` only: `scoreCardTotal` and `participationPct` are both present (`PITCH_008`).

---

## Ranking — `GET /pitching/summary`

One row per store with **at least one submitted form**, ordered by the judges'
average (`คะแนนเฉลี่ยกรรมการเรียงลำดับ`). A store nobody has submitted for is
absent, not zero-ranked. Each row carries `judgeCount`, `avgScore` (2 dp),
`level`, `recommendationCounts` and `minimumPassedCount`.

Stores on the same average **share a rank**. The acceleration form breaks ties
by หมวด B, then Market Feasibility, then a committee vote — none of which this
endpoint can decide, so it does not invent an order.

`province` filters the **rows**, never the ranking: `rank` stays each store's
position in the whole round. Renumbering 1..n inside a province would print
"อันดับ 1" next to a store that is not the programme's first.

`GET /pitching/stores/:storeId` is the same cohort read for one store: its
`rank` out of `rankedStoreCount`, the per-criterion average across judges
(`avgScore` + `avgPct`), and every judge's full form under `judges`. A store
with no submitted form answers `avgScore: null`, `rank: null`, `judgeCount: 0`
— not a 404.

---

## Exports

Both reads have an `/export` twin taking `format=xlsx|pdf` (default `xlsx`) and
otherwise the same query. Headers come from `sendFile()`
(`shared/file-response.util.ts`), the writers from `pitching-excel.util.ts` /
`pitching-pdf.util.ts`, both built on the shared primitives in
`shared/excel-sheet.util.ts` and `shared/pdf-doc.util.ts`.

| Route | xlsx | pdf |
|---|---|---|
| `/pitching/stores/:storeId/export` | two sheets: the store's averages + one block per judge with every criterion score, note and comment | portrait; same sections |
| `/pitching/summary/export` | one ranking sheet | landscape |

**The ranking export ignores `page` and `limit`** and always carries the whole
round (`province` still applies) — same rule as the cross-store assessment
report: a file cut to the rows on screen would have to be stitched back together
by hand. Unlike that report it is not streamed; a pitching cohort is one row per
store, not one per store per question.

---

## What reads a pitching score elsewhere

`AnalyticsService` fills `kpis.incubationReadiness` (the IRS) from
`PitchingService.getStoreAverageScore(storeId, PITCH_DECK)` — see
[06-analytics.md](06-analytics.md). That method takes **no user**: it answers one
averaged number, never a judge's comments, which is what lets the analytics
roles (a wider list) benefit from the score without widening
`PITCHING_READ_ROLES`. Do not wire it to a controller.

---

## Gaps

- No `/dashboard` card, and no `RankingService`: the IRS is computed per store
  on the analytics endpoint, but nothing finalises a cohort ranking or writes
  `Store.status` from it.
- Both rounds are averaged, ranked and exported identically — the only
  round-specific logic in the service is ACCELERATION's minimum conditions. What
  `ACCELERATION` has no equivalent of is the IRS: `incubationReadiness` reads
  `PITCH_DECK` because it measures readiness *for* incubation, and the paper form
  gives no comparable formula for readiness for acceleration, only the 80/70/60
  bands and the tie-break. Not a defect — there is nothing to compute.
- `scoreCardTotal` is keyed in by hand even though criterion 1.1's rubric maps
  the same 0–40 reading onto a 0–10 score. Nothing cross-checks the two, and
  nothing cross-checks it against the store's actual T1 assessment either.
- The ranking filters by province only — not by level, verdict, or whether the
  minimum conditions were met.
