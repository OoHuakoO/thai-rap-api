# Assessments Module — `/api/v1`

Covers: Dimensions, Questions, Assessments, Scores, Evidences

> Implementation/progress status lives in `../plan/progress.md`, not here.

---

## Dimensions & Questions (Seed / Read-only)

### GET /dimensions
List all 8 dimensions. Raw `Dimension` rows, no `questions` relation included.

**Access:** All roles (any valid access token)

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
No `questions` array — use `GET /dimensions/:id/questions` to fetch a dimension's questions separately.

---

### GET /dimensions/:id/questions
List questions for a single dimension, ordered by `questionNo`.

**Access:** All roles

**Response 200** — Array of question objects, same flat shape as `GET /questions` below (no nested `dimension` object).

---

### GET /questions
List all 50 questions, ordered by `questionNo`. Raw `Question` rows, no `dimension` relation included.

**Access:** All roles

**Query Params**
| Param | Type | Description |
|---|---|---|
| `dimensionId` | number | Filter by dimension |

**Response 200**
```json
[
  {
    "id": 1,
    "dimensionId": 1,
    "questionNo": 1,
    "questionText": "ร้านมีเมนูหลักที่ขายดีและลูกค้าจดจำได้ชัดเจน",
    "maxScore": 4
  }
]
```
No nested `dimension` object — join with `GET /dimensions` client-side using `dimensionId` if needed.

---

## Assessments

### GET /assessments
List assessments with filtering. Raw `Assessment` rows (no `store`/`assessor` join, no computed `zone`).

**Access:** Any valid access token — there is no role or ownership scoping on this endpoint; every role sees every assessment.

**Query Params**
| Param | Type | Description |
|---|---|---|
| `storeId` | string | Filter by store |
| `round` | Round enum | Filter by round (T0–T4) |
| `status` | AssessmentStatus enum | Filter by status |

`assessorId` filtering does not exist on `QueryAssessmentDto`.

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
`storeName`, `assessorName`, and `zone` shown in earlier drafts are not present — the list query has no `include`/`select` beyond the raw `Assessment` columns.

---

### GET /assessments/:id
Get full assessment detail: all 50 questions merged with any existing scores (unscored questions come back with `rawScore: null` rather than being omitted), plus red flags. This is the exact same response shape returned by `POST /assessments`, `POST /assessments/:id/submit`, and `PUT .../scores/:questionId`'s parent resource.

**Response 200**
```json
{
  "id": "classess1",
  "storeId": "clstore1",
  "round": "T0",
  "assessorId": "cluser1",
  "status": "SUBMITTED",
  "totalScore": 48.2,
  "zone": "Survival Zone",
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
      "note": "มีเมนูปลาสดขาดไม่ได้ แต่ไม่มีบอร์ดเมนูที่ชัดเจน",
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
Key differences from earlier drafts:
- No nested `store`/`assessor` objects — only the flat `storeId`/`assessorId`.
- The per-question array is named **`questions`** (not `scores`), and it always contains all 50 questions (unscored ones have `rawScore: null`, `note: null`, `suggestion: null`, `evidence: []`). There is no per-question `status`/`id` (score row id) field.
- Evidence is keyed **`evidence`** (singular), not `evidences`.
- There is no top-level `dimensionScores` array anywhere in this response.
- `recommendation` on a red flag is **always `null`** — `detectRedFlags` (`src/modules/assessment/assessment-scoring.util.ts`) never sets it and nothing else populates the column, even though it exists on the `RedFlag` model.
- `zone` is computed on the fly from `totalScore` via `getZone()`; it is `null` until the assessment has a `totalScore` (i.e. before first submit).

**Errors**
- `404 ASSESS_001` — Assessment not found

---

### POST /assessments
Create a new draft assessment (one per store per round).

**Access:** ADMIN, ASSESSOR — any user with either role can create an assessment for any store; there is no check that an `ASSESSOR` is assigned to the target store (no assignment relation is enforced anywhere in this module).

**Body**
```json
{
  "storeId": "clstore1",
  "round": "T0"
}
```

**Response 201** — Full assessment detail, same shape as `GET /assessments/:id` (status `DRAFT`, `totalScore: null`, `zone: null`, all 50 `questions` unscored, `redFlags: []`).

**Errors**
- `403 PERM_001` — Not ADMIN/ASSESSOR
- `404 STORE_001` — `storeId` does not exist
- `409 ASSESS_002` — (storeId, round) already exists

---

### POST /assessments/:id/submit
Submit assessment (locks scores, computes dimension/total score, and auto-generates red flags — all inside one transaction).

**Access:** ADMIN, ASSESSOR (role-only check — not restricted to the assessment's own `assessorId`)

Validation: all 50 questions must have a non-null `rawScore`.

**Response 200** — Full assessment detail, same shape as `GET /assessments/:id` (status `SUBMITTED`, `totalScore`/`zone` populated, `redFlags` populated from the just-created rows). There is no separate `redFlagsGenerated` field or `dimensionScores` array in the response — dimension-level scores are computed during submit but not returned; only the final `totalScore` persists.

**Errors**
- `400 ASSESS_005` — Not all 50 questions scored
- `400 ASSESS_004` — Already submitted
- `404 ASSESS_001` — Assessment not found

---

### DELETE /assessments/:id
Delete a DRAFT assessment.

**Access:** ADMIN, ASSESSOR

**Response 200**
```json
{ "success": true, "data": null }
```

**Errors**
- `400 ASSESS_003` — Assessment is not in DRAFT status
- `404 ASSESS_001` — Assessment not found

---

## Scores

### PUT /assessments/:id/scores/:questionId
Set or update a single question score (upsert).

**Access:** ADMIN, ASSESSOR

Validation: assessment must not be `SUBMITTED`.

**Body**
```json
{
  "rawScore": 3,
  "note": "มีระบบบ้าง แต่ไม่ครบ",
  "suggestion": "แนะนำทำ Costing Sheet"
}
```
There is no `status` field in the request body — `UpdateScoreDto` doesn't define one, and sending one is rejected (global `forbidNonWhitelisted`). The score's status is always force-set to `SCORED` server-side on every upsert.

**Response 200**
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
This is a single question object in the same shape as one entry of `GET /assessments/:id`'s `questions` array — not `{ id, assessmentId, ... }`.

**Errors**
- `422 VALID_002` — `rawScore` outside 0–4 (rejected by class-validator before reaching the service; the catalog defines `ASSESS_006`/`SCORE_OUT_OF_RANGE` for this but it is never actually thrown)
- `400 ASSESS_004` — Cannot edit a submitted assessment
- `404 ASSESS_007` — Question not found
- `404 ASSESS_001` — Assessment not found

---

### POST /assessments/:id/scores/bulk
Bulk upsert scores for multiple questions at once.

**Access:** ADMIN, ASSESSOR

**Body**
```json
{
  "scores": [
    { "questionId": 1, "rawScore": 3, "note": "...", "suggestion": "..." },
    { "questionId": 2, "rawScore": 2, "note": "...", "suggestion": "..." },
    { "questionId": 3, "rawScore": 4 }
  ]
}
```

**Response 200** — Same shape as `GET /assessments/:id/scores/progress` below, **not** `{ updated, scores }`:
```json
{
  "scored": 3,
  "total": 50
}
```

**Errors**
- `400 ASSESS_004` — Assessment already submitted
- `404 ASSESS_007` — A `questionId` in the batch doesn't exist (validated against all 50 questions before any upsert runs)
- `404 ASSESS_001` — Assessment not found

---

### GET /assessments/:id/scores/progress
Get scoring progress.

**Response 200**
```json
{
  "scored": 38,
  "total": 50
}
```
There is no `pending` field (compute as `total - scored` client-side) and no `byDimension` breakdown — the endpoint only counts scores where `rawScore` is not null, globally.

---

## Evidences

### POST /assessments/:id/scores/:questionId/evidence
Upload an evidence file for a question that already has a score. Path is singular `evidence`, not nested `scores/:questionId/evidences` as in earlier drafts.

**Access:** ADMIN, ASSESSOR — entrepreneurs cannot upload evidence (write access to the assessment module is ADMIN/ASSESSOR-only, see Access note on `POST /assessments`).

**Content-Type:** `multipart/form-data`

**Body**
| Field | Type | Required |
|---|---|---|
| `file` | image (jpeg/png/webp), pdf, or xlsx, max 10MB | Yes |

There is no `description` field — the `Evidence` model has no such column and the controller doesn't read one even if sent.

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
`url` is a relative path served from local disk (`/uploads/...`), not a `https://cdn.example.com/...` URL. There is no `scoreId` field in the response.

**Errors**
- `400 ASSESS_003` — The question hasn't been scored yet (evidence requires an existing `Score` row for that question)
- `400 FILE_002` — File exceeds 10 MB (`BadRequestException` from the `ParseFilePipe`, not 413)
- `400 FILE_001` — Type not in jpeg/png/webp/pdf/xlsx (also 400, not 422)

---

### DELETE /assessments/:id/evidence/:evidenceId
Remove an evidence file (deletes the DB row and the file on disk). Path is flat — **not** nested under `scores/:questionId` as in earlier drafts.

**Access:** ADMIN, ASSESSOR

**Response 200**
```json
{ "success": true, "data": null }
```

**Errors**
- `404 FILE_003` — Evidence not found (or doesn't belong to this assessment)

---

## Score Analysis

`GET /assessments/:id/analysis` and `GET /stores/:storeId/assessments/comparison` described in earlier drafts are **not implemented** — no such routes exist in `AssessmentController` or `StoreController`. Round-over-round comparison and per-dimension trend data must currently be computed client-side by fetching individual assessments.
