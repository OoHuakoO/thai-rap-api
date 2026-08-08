# Assessments Module — `/api/v1`

Covers: Dimensions, Assessments, Scores, Evidence, Round history, Rank.

```
GET    /dimensions
GET    /assessments
GET    /assessments/rank
GET    /assessments/:id
POST   /assessments
PUT    /assessments/:id/scores/:questionId
POST   /assessments/:id/scores/:questionId/evidence
DELETE /assessments/:id/evidence/:evidenceId
PATCH  /assessments/:id/notes
PATCH  /assessments/:id/draft
POST   /assessments/:id/submit
GET    /assessment/:storeId/history
```

**Not implemented** (and never were): `GET /questions`, `GET /dimensions/:id/questions`, `POST /assessments/:id/scores/bulk`, `GET /assessments/:id/scores/progress`, `DELETE /assessments/:id`, `GET /assessments/:id/analysis`. Question text arrives with the assessment itself — `GET /assessments/:id` carries all 50 questions, so no separate question lookup is needed. Progress is `questions.filter(q => q.rawScore !== null).length` on the client.

---

## Access

**Reads** — `ASSESSMENT_READ_ROLES`: SUPER_ADMIN, ADMIN, ASSESSOR, MENTOR, ENTREPRENEUR. JUDGE and VIEWER get `403 PERM_001` from every endpoint here. On top of the role gate, each read resolves the store through `StoreService.findAccessible()`, so an ENTREPRENEUR only reaches its own store's rounds and an ASSESSOR/MENTOR only its assignment list's.

**Writes** — admin roles and ASSESSOR only (`WRITE_ROLES`). An ASSESSOR must additionally be assigned to the store (`assertAssignedToStore`); an assessor with no assignments can score nothing, which is the intended state. Admin roles bypass that check.

**Prior round** — every write (create, score, evidence, notes, draft, submit) calls `assertPriorRoundCompleted`: T1 needs T0 finished, T2 needs T1, T3 needs T1. `400 ASSESS_003` otherwise.

**Editing a finished round** — a `SUBMITTED`/`APPROVED` assessment reopens for **content** writes (score, evidence, notes) to ADMIN / SUPER_ADMIN only; an ASSESSOR gets `400 ASSESS_004`. The round itself never reopens: `PATCH /:id/draft` and `POST /:id/submit` keep the strict gate for every role. Each admin content write re-runs the submit formula, rewrites the frozen `totalScore` and reconciles red flags by type — a flag that still triggers keeps its `resolved`, one that no longer triggers is deleted. `status`, `submittedAt`, `assessorId` and `Store.status` are left alone, so a correction never re-credits the round to the admin.

---

## GET /dimensions
The 8 dimensions. Raw `Dimension` rows — no `questions` relation.

**Access:** Any valid access token (no assessment-read gate on this lookup)

**Response 200**
```json
[
  {
    "id": 1,
    "name": "คุณภาพอาหารและนวัตกรรมเมนู",
    "nameEn": "Food Quality & Menu Innovation",
    "weight": 12,
    "questionCount": 7
  }
]
```
`questionCount` is metadata only — score percentages divide by Σ `Question.maxScore`, never by this.

---

## GET /assessments
Paginated list, `createdAt desc`. Raw `Assessment` columns — no `store`/`assessor` join, no computed `zone`.

**Query Params**
| Param | Type | Description |
|---|---|---|
| `page` / `limit` | number | Default 1 / 10, max 100 |
| `storeId` | string | Filter by store |
| `round` | Round enum | T0–T3 |
| `status` | AssessmentStatus enum | DRAFT, IN_PROGRESS, SUBMITTED, APPROVED |

`assessorId` is not a filter.

**Response 200**
```json
{
  "items": [
    {
      "id": "classess1",
      "storeId": "clstore1",
      "round": "T0",
      "assessorId": "cluser1",
      "status": "SUBMITTED",
      "totalScore": 48.2,
      "createdAt": "2026-01-20T00:00:00.000Z",
      "updatedAt": "2026-02-01T00:00:00.000Z",
      "submittedAt": "2026-02-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 5, "page": 1, "limit": 10, "totalPages": 1 }
}
```
An ENTREPRENEUR's list is filtered to assessments of the stores it owns. `storeName`, `assessorName` and `zone` are not present.

**Errors** — `403 PERM_001` (JUDGE / VIEWER)

---

## GET /assessments/:id
Full detail: every question merged with any existing score, plus red flags. The same shape is returned by `POST /assessments`, `PATCH /:id/notes`, `PATCH /:id/draft` and `POST /:id/submit`.

**Response 200**
```json
{
  "id": "classess1",
  "storeId": "clstore1",
  "round": "T0",
  "assessorId": "cluser1",
  "status": "SUBMITTED",
  "totalScore": 48.2,
  "currentScore": 48.2,
  "zone": "Survival Zone",
  "notes": "ร้านมีศักยภาพด้านการตลาดสูง",
  "createdAt": "2026-01-20T00:00:00.000Z",
  "updatedAt": "2026-02-01T00:00:00.000Z",
  "submittedAt": "2026-02-01T00:00:00.000Z",
  "questions": [
    {
      "questionId": 1,
      "questionNo": 1,
      "dimensionId": 1,
      "questionText": "ร้านมีเมนูหลักที่ขายดี...",
      "maxScore": 4,
      "rawScore": 3,
      "note": "มีเมนูปลาสดขาดไม่ได้",
      "suggestion": "แนะนำทำเมนูดิจิทัล",
      "evidence": [
        {
          "id": "clevid1",
          "filename": "menu_photo.jpg",
          "fileType": "image/jpeg",
          "fileSize": 204800,
          "url": "/uploads/evidence/classess1/a1b2c3d4.jpg",
          "uploadedAt": "2026-02-01T09:00:00.000Z"
        }
      ]
    }
  ],
  "redFlags": [
    {
      "id": "clredflag1",
      "assessmentId": "classess1",
      "type": "FINANCIAL",
      "severity": "CRITICAL",
      "triggerQuestions": [28, 29, 30],
      "recommendation": null,
      "resolved": false
    }
  ]
}
```

- The per-question array is **`questions`**, not `scores`, and always holds all 50 — an unscored one comes back with `rawScore: null`, `note: null`, `suggestion: null`, `evidence: []`. There is no score-row `id` or per-question `status`.
- Evidence is keyed **`evidence`** (singular).
- No nested `store`/`assessor` object, and no top-level `dimensionScores` array.
- `recommendation` on a red flag is **always `null`** — nothing populates the column.
- `zone` is computed from `totalScore` via `getZone()`; `null` until the round is submitted.
- `totalScore` is the frozen result, `null` until submit writes it. `currentScore` is the same weighted formula applied to whatever is scored right now (unscored counts as 0), so it converges on `totalScore` rather than jumping at submit. **It is never persisted** — ranking, reports and dashboards read `Assessment.totalScore`, so they still see finished rounds only.

**Errors** — `403 PERM_001`, `404 ASSESS_001`

---

## GET /assessments/rank
Where one store's round stands, plus the cohort's per-dimension averages. Both query params are **required**.

**Query Params**
| Param | Type | Required |
|---|---|---|
| `storeId` | string | Yes |
| `round` | Round enum | Yes |

**Response 200**
```json
{
  "overallRank": 7,
  "overallTotal": 118,
  "provinceRank": 2,
  "provinceTotal": 19,
  "dimensionAverages": [{ "dimensionId": 1, "avgPct": 61.4 }]
}
```
Ranking runs over every `SUBMITTED`/`APPROVED` assessment of that round across the whole programme — it is not narrowed to the caller's scope, only the *subject* store is access-checked. `overallRank`/`provinceRank` are `null` when this store has no finished assessment in the round. `dimensionAverages` are the **province** cohort's averages, one entry per dimension, rounded to 1 decimal.

**Errors** — `403 PERM_001`, `404 STORE_001`, `422 VALID_002` (missing/invalid param)

---

## GET /assessment/:storeId/history
Every round of one store, for the timeline. Note the **singular `assessment`** prefix — this route is not under `/assessments`.

**Response 200**
```json
[
  {
    "round": "T0",
    "status": "SUBMITTED",
    "totalScore": 48.2,
    "assessorName": "สมหญิง ประเมินดี",
    "updatedAt": "2026-02-01T00:00:00.000Z",
    "submittedAt": "2026-02-01T00:00:00.000Z"
  }
]
```
A bare array. Rounds with no assessment row are absent.

**Errors** — `403 PERM_001`, `404 STORE_001`

---

## POST /assessments
Create a draft — one per (store, round).

**Access:** admin roles, ASSESSOR (assigned to the store)

**Body**
```json
{ "storeId": "clstore1", "round": "T0" }
```

**Response 201** — full detail, same shape as `GET /assessments/:id`: `status: "DRAFT"`, `totalScore: null`, `zone: null`, all 50 questions unscored, `redFlags: []`. `assessorId` is the caller.

**Errors**
- `403 PERM_001` — Not an admin/ASSESSOR, or the ASSESSOR isn't assigned to this store
- `404 STORE_001` — `storeId` doesn't exist (or isn't visible to the caller)
- `409 ASSESS_002` — (storeId, round) already exists
- `400 ASSESS_003` — Prior round not submitted yet

---

## PUT /assessments/:id/scores/:questionId
Upsert one question's score.

**Body**
```json
{
  "rawScore": 3,
  "note": "มีระบบบ้าง แต่ไม่ครบ",
  "suggestion": "แนะนำทำ Costing Sheet"
}
```
`rawScore` is an integer 0–4; `note`/`suggestion` ≤1000 chars. There is no `status` field — sending one is rejected by the global `forbidNonWhitelisted`. Score status is force-set to `SCORED` server-side on every upsert.

On a draft/in-progress round the upsert also **reassigns `assessorId` to the caller** — whoever last touched the scores owns the round. On a finished round (admin correction) it does not; it re-freezes `totalScore` and the red flags instead.

**Response 200** — one question object, the same shape as an entry of `questions`:
```json
{
  "questionId": 1,
  "questionNo": 1,
  "dimensionId": 1,
  "questionText": "ร้านมีเมนูหลักที่ขายดีและลูกค้าจดจำได้ชัดเจน",
  "maxScore": 4,
  "rawScore": 3,
  "note": "มีระบบบ้าง แต่ไม่ครบ",
  "suggestion": "แนะนำทำ Costing Sheet",
  "evidence": []
}
```
It carries **no roll-up** — after correcting a finished round, refetch the assessment for the re-frozen `totalScore` and flags.

**Errors**
- `422 VALID_002` — `rawScore` outside 0–4 (class-validator, before the service)
- `400 ASSESS_006` — `rawScore` above that question's own `maxScore`
- `400 ASSESS_004` — Round already finished (non-admin roles)
- `400 ASSESS_003` — Prior round not submitted
- `403 PERM_001` — Not a write role, or not assigned to the store
- `404 ASSESS_007` — Question not found
- `404 ASSESS_001` — Assessment not found

---

## PATCH /assessments/:id/notes
Round-level assessor notes.

**Body** `{ "notes": "ร้านมีศักยภาพด้านการตลาดสูง" }` — optional, ≤1000 chars; omitting it or sending `null` clears the field.

**Response 200** — full assessment detail

**Errors** — same set as the score upsert (`ASSESS_004`, `ASSESS_003`, `PERM_001`, `ASSESS_001`)

---

## PATCH /assessments/:id/draft
Marks the round as worked-on but unfinished: `status` → `IN_PROGRESS`, `assessorId` → caller. **No body** — scores are already persisted by the score upsert as they are entered; without this an assessment sitting at 12/50 would be indistinguishable from one nobody has opened.

**Response 200** — full assessment detail

**Errors**
- `400 ASSESS_004` — Round already finished (**every role**, admins included)
- `400 ASSESS_003` — Prior round not submitted
- `403 PERM_001` — Not a write role / not assigned
- `404 ASSESS_001` — Assessment not found

---

## POST /assessments/:id/submit
Locks the round: computes dimension scores and the weighted total, writes red flags, and advances `Store.status` — all in one transaction.

`Store.status` moves to `T0_COMPLETED` / `T1_COMPLETED` / `FIELD_AUDITED` / `COMPLETED` for T0 / T1 / T2 / T3, but **only from an earlier status** — a store an admin already advanced past that point (e.g. `SELECTED`), or one sitting at `WAITING_LIST` / `NOT_SELECTED`, is left where it is.

Validation: **every** question must have a non-null `rawScore`. The bar is read from the question table, not a hardcoded 50 — the seed owns how many there are.

**Response 200** — full detail: `status: "SUBMITTED"`, `totalScore`/`zone` populated, `redFlags` from the rows just created. There is no `redFlagsGenerated` count and no `dimensionScores` array — dimension scores are computed during submit but only the weighted total persists.

**Errors**
- `400 ASSESS_005` — Not every question scored (the message carries `scored/total`)
- `400 ASSESS_004` — Already submitted or approved
- `400 ASSESS_003` — Prior round not submitted
- `403 PERM_001` — Not a write role / not assigned
- `404 ASSESS_001` — Assessment not found

---

## Evidence

### POST /assessments/:id/scores/:questionId/evidence
Upload one file for a question that **already has a score row**. The path is singular `evidence`.

**Access:** the write rules above — ENTREPRENEUR cannot upload evidence. On a finished round the admin-only content rule applies, same as a score write.

**Content-Type:** `multipart/form-data`, single field `file`. Types: jpeg, png, webp, pdf, xlsx. Max 10 MB. There is no `description` field — the `Evidence` model has no such column.

**Response 201**
```json
{
  "id": "clevid1",
  "filename": "costing_sheet.xlsx",
  "fileType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "fileSize": 51200,
  "url": "/uploads/evidence/classess1/f47ac10b.xlsx",
  "uploadedAt": "2026-02-01T09:00:00.000Z"
}
```
`url` is a relative local-disk path. There is no `scoreId` in the response.

**Errors**
- `400 ASSESS_003` — The question has no score yet
- `400 ASSESS_004` — Round finished (non-admin)
- `400 FILE_001` / `400 FILE_002` — Type not allowed / over 10 MB (both 400)
- `404 ASSESS_001` — Assessment not found

### DELETE /assessments/:id/evidence/:evidenceId
Removes the DB row and the file on disk. The path is flat — **not** nested under `scores/:questionId`.

**Response 200** — `{ "success": true, "data": null }`

**Errors**
- `404 FILE_003` — Evidence not found, or belongs to another assessment
- `400 ASSESS_004` — Round finished (non-admin)
- `403 PERM_001` — Not a write role / not assigned
