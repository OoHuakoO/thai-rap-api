# Reports Module — `/api/v1/reports`

Rendered views over submitted assessments. Nothing here is stored: there is no `Report` table, and every report is computed from `Assessment` on request.

```
GET /reports/stores/:storeId/rounds/:round
GET /reports/stores/:storeId/rounds/:round/export
GET /reports/rounds/:round/stores
GET /reports/rounds/:round/stores/export
GET /reports/stores/:storeId/overview
GET /reports/stores/:storeId/overview/export
```

## Access

Store-scoped reports answer `ASSESSMENT_READ_ROLES` (SUPER_ADMIN, ADMIN, ASSESSOR, MENTOR, ENTREPRENEUR) and resolve the store through `StoreService.findAccessible()` — so an ENTREPRENEUR reads its own store, an ASSESSOR/MENTOR its assignment list, and JUDGE/VIEWER get `403 PERM_001`. Exports included.

**The cross-store matrix (`/rounds/:round/stores`) is ADMIN / SUPER_ADMIN only.** It is the one report that puts one store's scores in front of another store's people, so it is narrower than the rest: ENTREPRENEUR / ASSESSOR / MENTOR get `403 PERM_001` there even though they read their own round report fine.

`:round` is parsed by `ParseEnumPipe(Round)` — anything other than `T0`–`T3` is a `400 VALID_001` before the service runs.

## Exports

Every `*/export` route takes `?format=xlsx|pdf` (default `xlsx`) and responds with a **raw binary body** — `Content-Type` per format, `Content-Disposition: attachment`, and **no `{ success, data }` envelope**. Filenames: `assessment-report-<round>.<ext>`, `assessment-report-stores-<round>.<ext>`, `assessment-report-overview.<ext>`.

Because the token is not in a cookie, a browser `<a href>` to these routes arrives unauthenticated and 401s — fetch them through the HTTP client with `responseType: 'blob'`.

---

## GET /reports/stores/:storeId/rounds/:round
One store, one round — "รายงานผลการประเมินแต่ละ T", including the per-question breakdown.

**Response 200**
```json
{
  "store": {
    "id": "clstore1",
    "name": "ร้านอาหารสุขใจ",
    "province": "ชลบุรี",
    "storeType": "อาหารไทย",
    "ownerName": "สมชาย ใจดี"
  },
  "round": "T0",
  "totalScore": 48.2,
  "zone": "Survival Zone",
  "assessorName": "สมหญิง ประเมินดี",
  "submittedAt": "2026-02-01T00:00:00.000Z",
  "notes": "ร้านมีศักยภาพด้านการตลาดสูง",
  "rawScore": 96,
  "maxScore": 200,
  "rawScorePct": 48.0,
  "completionPct": 100.0,
  "dimensions": [
    {
      "dimensionId": 1,
      "dimensionName": "คุณภาพอาหารและนวัตกรรมเมนู",
      "weight": 12,
      "scorePct": 57.1,
      "rawScore": 16,
      "maxScore": 28,
      "weightedScore": 6.85,
      "questions": [
        { "questionNo": 1, "questionText": "ร้านมีเมนูหลัก...", "rawScore": 3, "maxScore": 4 }
      ]
    }
  ],
  "redFlags": [
    { "type": "FINANCIAL", "severity": "CRITICAL", "triggerQuestions": [28, 29], "resolved": false }
  ]
}
```

- `rawScore` / `maxScore` / `rawScorePct` — คะแนนดิบ and the unweighted total; `totalScore` is the weighted one (คะแนนถ่วงน้ำหนัก).
- `completionPct` — answered questions ÷ total questions.
- `questions[]` comes from the question master, so an **unanswered** question is present with `rawScore: null` rather than missing.
- Red flags here carry no `id` and no `recommendation`.

**Errors**
- `403 PERM_001` — Role not allowed, or store out of scope
- `404 RPT_001` — No `SUBMITTED`/`APPROVED` assessment for that store and round
- `404 STORE_001` — Store not found

---

## GET /reports/stores/:storeId/overview
Every assessed round of one store side by side — "รายงานผลการประเมินภาพรวมทุก T".

**Response 200**
```json
{
  "store": { "id": "clstore1", "name": "ร้านอาหารสุขใจ", "province": "ชลบุรี", "storeType": "อาหารไทย", "ownerName": "สมชาย ใจดี" },
  "rounds": [
    { "round": "T0", "totalScore": 48.2, "zone": "Survival Zone", "delta": null, "submittedAt": "2026-02-01T00:00:00.000Z" },
    { "round": "T1", "totalScore": 61.5, "zone": "Improve Zone", "delta": 13.3, "submittedAt": "2026-05-01T00:00:00.000Z" }
  ],
  "dimensionTrends": [
    {
      "dimensionId": 1,
      "dimensionName": "คุณภาพอาหารและนวัตกรรมเมนู",
      "weight": 12,
      "scoresByRound": { "T0": 57.1, "T1": 71.4 }
    }
  ],
  "unresolvedRedFlagCount": 2
}
```
`rounds` holds only rounds that have been submitted; `delta` compares against the previously **assessed** round, so T0 → T2 still reads as consecutive, and the first entry is always `null`. `scoresByRound` omits rounds with no data.

**Errors** — `403 PERM_001`, `404 STORE_001`. An unassessed store returns `rounds: []`, not a 404.

---

## GET /reports/rounds/:round/stores
One row per accessible store for a single round — the cross-store matrix (mirrors `03_สรุปคะแนน`). **ADMIN / SUPER_ADMIN only.**

**Query Params** — `page` (default 1), `limit` (default 10, max 100)

**Response 200**
```json
{
  "round": "T1",
  "dimensions": [
    { "dimensionId": 1, "dimensionName": "คุณภาพอาหารและนวัตกรรมเมนู", "weight": 12 }
  ],
  "rows": [
    {
      "storeId": "clstore1",
      "storeCode": "RAP69-001",
      "storeName": "ร้านอาหารสุขใจ",
      "province": "ชลบุรี",
      "completionPct": 100.0,
      "rawScore": 123,
      "rawScorePct": 61.5,
      "weightedScore": 61.5,
      "overallLevel": "ต้องพัฒนา",
      "redFlagCount": 3,
      "unresolvedRedFlagCount": 2,
      "criticalDimensionId": 5,
      "criticalDimensionName": "การเงิน ต้นทุน และกำไร",
      "scoresByDimension": { "1": 71.4, "2": 60.7 }
    }
  ],
  "averageByDimension": { "1": 64.2, "2": 58.9 },
  "averageWeightedScore": 59.8,
  "meta": { "total": 118, "page": 1, "limit": 10, "totalPages": 12 }
}
```

- `overallLevel` is the **ระดับรวม** scale (cut points 50 / 65 / 80), a different scale from Zone — this report does not carry Zone at all.
- `criticalDimension*` is the lowest-scoring dimension (มิติเร่งแก้ไข); `null` when nothing is scored.
- **The averages are the round's, not the page's.** They are computed in the database over every store in the round, so paging never moves them. `averageWeightedScore` is derived from those dimension percentages rather than from the stored `Assessment.totalScore`; the two agree unless dimension weights changed after a round was submitted.

**Errors** — `403 PERM_001` (any non-admin role), `400 VALID_001` (bad round)

---

## GET /reports/rounds/:round/stores/export
The same matrix as a file. **It deliberately takes no `page`/`limit`** — a file cut to the rows on screen would have to be stitched back together by hand, so it always carries every store in the round.

Rows are read from the database in batches and piped straight into the response, so a large cohort is never held in memory as one array. Access is checked and the cohort counted **before any header is set**, so a `403` still leaves as JSON rather than landing inside a half-written file.

**Query Params** — `format` only (`xlsx` | `pdf`, default `xlsx`)

---

## Report availability (`/dashboard/reports-status`)

`ReportService.listAvailableReports()` powers `GET /dashboard/reports-status` — see [07-dashboard.md](07-dashboard.md). It derives two report kinds per store (one per submitted round, one overview) in both formats, so a store's reports appear the moment a round is submitted; nothing has to be exported first. `id` is synthetic and stable (`store:round:format`, `store:overview:format`), `createdAt` is the round's `submittedAt`, `status` is always `DONE`, and the download url is one of the `/reports/**/export` routes above. JUDGE and VIEWER get `[]` there rather than a 403.
