# Assessments Module — `/api/v1`

Covers: Dimensions, Questions, Assessments, Scores, Evidences

> Implementation/progress status lives in `../plan/progress.md`, not here.

---

## Dimensions & Questions (Seed / Read-only)

### GET /dimensions
List all 8 dimensions with questions.

**Access:** All roles

**Response 200**
```json
[
  {
    "id": 1,
    "name": "คุณภาพอาหารและนวัตกรรมเมนู",
    "nameEn": "Food Quality & Menu Innovation",
    "weight": 12,
    "questionCount": 7,
    "questions": [
      {
        "id": 1,
        "questionNo": 1,
        "questionText": "ร้านมีเมนูหลักที่ขายดีและลูกค้าจดจำได้ชัดเจน",
        "maxScore": 4
      }
    ]
  }
]
```

---

### GET /dimensions/:id/questions
List questions for a single dimension.

**Access:** All roles

**Response 200** — Array of question objects

---

### GET /questions
List all 50 questions.

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
    "maxScore": 4,
    "dimension": { "id": 1, "name": "คุณภาพอาหารและนวัตกรรมเมนู", "weight": 12 }
  }
]
```

---

## Assessments

### GET /assessments
List assessments with filtering.

**Access:** ADMIN, ME_TEAM (all); ASSESSOR (assigned stores); MENTOR (assigned stores); ENTREPRENEUR (own store)

**Query Params**
| Param | Type | Description |
|---|---|---|
| `storeId` | string | Filter by store |
| `round` | Round enum | Filter by round (T0–T4) |
| `status` | AssessmentStatus enum | Filter by status |
| `assessorId` | string | Filter by assessor (ADMIN only) |

**Response 200**
```json
{
  "items": [
    {
      "id": "classess1",
      "storeId": "clstore1",
      "storeName": "ร้านอาหารสุขใจ",
      "round": "T0",
      "assessorId": "cluser1",
      "assessorName": "Jane Assessor",
      "status": "SUBMITTED",
      "totalScore": 48.2,
      "zone": "Survival Zone",
      "submittedAt": "2026-02-01T00:00:00.000Z",
      "createdAt": "2026-01-20T00:00:00.000Z"
    }
  ],
  "meta": { "total": 5, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### GET /assessments/:id
Get full assessment detail including all 50 scores and red flags. The `scores` array always contains all 50 questions merged with any existing scores — unscored questions come back with `rawScore: null` rather than being omitted.

**Response 200**
```json
{
  "id": "classess1",
  "storeId": "clstore1",
  "store": { "id": "clstore1", "name": "ร้านอาหารสุขใจ", "province": "ชลบุรี" },
  "round": "T0",
  "assessorId": "cluser1",
  "assessor": { "id": "cluser1", "name": "Jane Assessor" },
  "status": "SUBMITTED",
  "totalScore": 48.2,
  "zone": "Survival Zone",
  "dimensionScores": [
    {
      "dimensionId": 1,
      "dimensionName": "คุณภาพอาหารและนวัตกรรมเมนู",
      "weight": 12,
      "rawScore": 14,
      "maxScore": 28,
      "percentScore": 50.0,
      "weightedScore": 6.0
    }
  ],
  "scores": [
    {
      "id": "clscore1",
      "questionId": 1,
      "questionNo": 1,
      "questionText": "ร้านมีเมนูหลักที่ขายดี...",
      "rawScore": 3,
      "note": "มีเมนูปลาสดขาดไม่ได้ แต่ไม่มีบอร์ดเมนูที่ชัดเจน",
      "suggestion": "แนะนำทำเมนูดิจิทัล",
      "status": "SCORED",
      "evidences": [
        {
          "id": "clevid1",
          "filename": "menu_photo.jpg",
          "fileType": "image/jpeg",
          "fileSize": 204800,
          "url": "https://cdn.example.com/evidences/clevid1.jpg",
          "uploadedAt": "2026-02-01T09:00:00.000Z"
        }
      ]
    }
  ],
  "redFlags": [
    {
      "id": "clredflag1",
      "type": "FINANCIAL",
      "severity": "CRITICAL",
      "triggerQuestions": [28, 29, 30],
      "recommendation": "ต้องจัดทำ Costing Sheet และแยกบัญชีร้านก่อนเข้า Incubation",
      "resolved": false
    }
  ],
  "submittedAt": "2026-02-01T10:00:00.000Z",
  "createdAt": "2026-01-20T00:00:00.000Z"
}
```

---

### POST /assessments
Create a new assessment (one per store per round).

**Access:** ADMIN, ASSESSOR (assigned stores only)

**Body**
```json
{
  "storeId": "clstore1",
  "round": "T0"
}
```

**Response 201**
```json
{
  "id": "classess1",
  "storeId": "clstore1",
  "round": "T0",
  "assessorId": "cluser1",
  "status": "DRAFT",
  "createdAt": "2026-01-20T00:00:00.000Z"
}
```

**Errors**
- `409 ASSESSMENT_ALREADY_EXISTS` — (storeId, round) already exists
- `403 FORBIDDEN` — Assessor not assigned to this store

---

### POST /assessments/:id/submit
Submit assessment (locks scores, triggers score calculation + red flag detection).

**Access:** ADMIN, ASSESSOR (owner of assessment)

Validation: All 50 questions must have a score before submission.

**Response 200**
```json
{
  "id": "classess1",
  "status": "SUBMITTED",
  "totalScore": 48.2,
  "zone": "Survival Zone",
  "dimensionScores": [...],
  "redFlagsGenerated": [
    { "type": "FINANCIAL", "severity": "CRITICAL" },
    { "type": "MARKET", "severity": "WARNING" }
  ],
  "submittedAt": "2026-02-01T10:00:00.000Z"
}
```

**Errors**
- `400` — Not all questions scored
- `400 ASSESSMENT_SUBMITTED` — Already submitted

---

### DELETE /assessments/:id
Delete a DRAFT assessment.

**Access:** ADMIN

**Errors**
- `400` — Cannot delete submitted assessment

---

## Scores

### PUT /assessments/:id/scores/:questionId
Set or update a single question score.

**Access:** ADMIN, ASSESSOR (owner of assessment)

Validation: Assessment must not be SUBMITTED.

**Body**
```json
{
  "rawScore": 3,
  "note": "มีระบบบ้าง แต่ไม่ครบ",
  "suggestion": "แนะนำทำ Costing Sheet",
  "status": "SCORED"
}
```

**Response 200**
```json
{
  "id": "clscore1",
  "assessmentId": "classess1",
  "questionId": 1,
  "rawScore": 3,
  "note": "มีระบบบ้าง แต่ไม่ครบ",
  "suggestion": "แนะนำทำ Costing Sheet",
  "status": "SCORED"
}
```

**Errors**
- `422 SCORE_OUT_OF_RANGE` — Score must be 0–4
- `400 ASSESSMENT_SUBMITTED` — Cannot edit submitted assessment

---

### POST /assessments/:id/scores/bulk
Bulk upsert scores for multiple questions at once.

**Access:** ADMIN, ASSESSOR (owner of assessment)

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

**Response 200**
```json
{
  "updated": 3,
  "scores": [...]
}
```

---

### GET /assessments/:id/scores/progress
Get scoring progress (how many of 50 questions have been scored).

**Response 200**
```json
{
  "total": 50,
  "scored": 38,
  "pending": 12,
  "byDimension": [
    { "dimensionId": 1, "dimensionName": "...", "total": 7, "scored": 7 },
    { "dimensionId": 2, "dimensionName": "...", "total": 7, "scored": 5 }
  ]
}
```

---

## Evidences

### POST /assessments/:id/scores/:questionId/evidences
Upload evidence file for a specific question score.

**Access:** ADMIN, ASSESSOR (owner), ENTREPRENEUR (own store)

**Content-Type:** `multipart/form-data`

**Body**
| Field | Type | Required |
|---|---|---|
| `file` | image/pdf/xlsx (max 10MB) | Yes |
| `description` | string | No |

**Response 201**
```json
{
  "id": "clevid1",
  "scoreId": "clscore1",
  "filename": "costing_sheet.xlsx",
  "fileType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "fileSize": 51200,
  "url": "https://cdn.example.com/evidences/clevid1.xlsx",
  "uploadedAt": "2026-02-01T09:00:00.000Z"
}
```

**Errors**
- `413 FILE_TOO_LARGE` — Max 10 MB
- `422 INVALID_FILE_TYPE` — Only image/pdf/xlsx

---

### DELETE /assessments/:id/scores/:questionId/evidences/:evidenceId
Remove an evidence file.

**Access:** ADMIN, ASSESSOR (owner)

**Response 200**
```json
{ "message": "Evidence removed" }
```

---

## Score Analysis

### GET /assessments/:id/analysis
Get computed analysis: dimension scores, zone, improvement from previous round.

**Response 200**
```json
{
  "assessmentId": "classess1",
  "storeId": "clstore1",
  "round": "T1",
  "totalScore": 62.5,
  "zone": "Improve Zone",
  "dimensionScores": [
    {
      "dimensionId": 1,
      "dimensionName": "คุณภาพอาหารและนวัตกรรมเมนู",
      "weight": 12,
      "percentScore": 64.3,
      "weightedScore": 7.7
    }
  ],
  "comparison": {
    "previousRound": "T0",
    "previousScore": 48.2,
    "improvement": 14.3,
    "improvementRate": 29.7,
    "dimensionComparison": [
      {
        "dimensionId": 1,
        "dimensionName": "คุณภาพอาหารและนวัตกรรมเมนู",
        "T0": 50.0,
        "T1": 64.3,
        "delta": 14.3
      }
    ]
  },
  "topStrengths": [
    { "dimensionId": 8, "dimensionName": "ความพร้อมเติบโต", "percentScore": 88.0 }
  ],
  "topWeaknesses": [
    { "dimensionId": 5, "dimensionName": "การเงิน", "percentScore": 42.0 }
  ],
  "redFlags": [...]
}
```

---

### GET /stores/:storeId/assessments/comparison
Compare scores across all completed rounds for a store.

**Response 200**
```json
{
  "storeId": "clstore1",
  "storeName": "ร้านอาหารสุขใจ",
  "rounds": {
    "T0": { "totalScore": 48.2, "zone": "Survival Zone", "submittedAt": "2026-02-01T00:00:00.000Z" },
    "T1": { "totalScore": 62.5, "zone": "Improve Zone", "submittedAt": "2026-03-15T00:00:00.000Z" },
    "T2": null,
    "T3": null,
    "T4": null
  },
  "dimensionTrend": [
    {
      "dimensionId": 1,
      "dimensionName": "คุณภาพอาหารและนวัตกรรมเมนู",
      "T0": 50.0,
      "T1": 64.3,
      "T2": null,
      "T3": null,
      "T4": null
    }
  ]
}
```
