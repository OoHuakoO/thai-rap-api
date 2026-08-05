# Analytics Module — `/api/v1/analytics`

One store's assessment results rendered for charts. Everything here reads the same `SUBMITTED`/`APPROVED` assessments as [05-reports.md](05-reports.md) — it is a different presentation, not a different data source.

```
GET /analytics/:storeId?compare=T0vsT1[&province=]
GET /analytics/:storeId/radar
GET /analytics/:storeId/trend
GET /analytics/:storeId/action-plans
GET /analytics/:storeId/export?compare=T0vsT1[&province=]
```

## Access

`ASSESSMENT_READ_ROLES` plus `StoreService.findAccessible()` on `:storeId` — JUDGE and VIEWER get `403 PERM_001`, an ENTREPRENEUR only its own stores, an ASSESSOR/MENTOR only its assignment list.

## The `compare` param

`GET /analytics/:storeId` and `/export` **require** `compare`, matching `/^T[0-3]vsT[0-3]$/` (e.g. `T0vsT1`). Omitting or misspelling it is a `422 VALID_002`. `province` is optional and defaults to the store's own province.

`compare` drives the **KPIs and the export filename only**. `radar` and `trend` always answer every round, which is why `GET /analytics/:storeId/radar` and `/trend` take no query params at all.

---

## GET /analytics/:storeId
Everything the store analytics page needs in one call.

**Response 200**
```json
{
  "storeId": "clstore1",
  "kpis": {
    "t0Score": 48.2,
    "t1Score": 61.5,
    "improvementRate": 27.59,
    "rankInProject": 7,
    "totalStores": 118,
    "zone": "Improve Zone",
    "incubationReadiness": null
  },
  "radar": {
    "axes": ["คุณภาพอาหารและนวัตกรรมเมนู", "ความปลอดภัยอาหารและมาตรฐาน"],
    "series": [
      { "name": "T0", "data": [57.1, 60.7] },
      { "name": "T1", "data": [71.4, 67.9] }
    ]
  },
  "trend": {
    "xAxis": ["T0", "T1", "T2", "T3"],
    "series": [{ "name": "ร้านอาหารสุขใจ", "data": [48.2, 61.5, null, null], "actualCount": 2 }]
  },
  "strengths": [{ "dimensionId": 4, "name": "การตลาดและฐานลูกค้า", "score": 78.6 }],
  "weaknesses": [{ "dimensionId": 5, "name": "การเงิน ต้นทุน และกำไร", "score": 32.1 }],
  "redFlags": [
    {
      "id": "clredflag1",
      "assessmentId": "classess2",
      "type": "FINANCIAL",
      "severity": "CRITICAL",
      "triggerQuestions": [28, 29],
      "recommendation": null,
      "resolved": false
    }
  ],
  "aiAnalysis": null,
  "mentorRecommendations": [],
  "incubationStatus": null
}
```

**kpis**
- `t0Score` / `t1Score` are the **two compared rounds**, not literally T0 and T1 — with `compare=T1vsT3`, `t0Score` is T1's and `t1Score` is T3's. The names are the web's, kept for compatibility.
- `improvementRate` = `(later − earlier) / earlier × 100`, `null` when either side is missing or the earlier score is 0.
- `zone` is the later round's, falling back to the earlier one.
- `rankInProject` ranks the compared round's cohort within `province` (the store's own unless overridden); `null` when this store has no assessment in that round. `totalStores` is that cohort's size.
- `incubationReadiness` is **always `null`** — the full IRS needs a pitching score and no `PitchingScore` model exists yet.

**radar** — one series per **submitted round** in T0→T3 order, so `series.length` is 0–4 and a series name is a bare round. A round with no submitted assessment is skipped rather than sent as an all-null series. Do **not** index `series[0]`/`series[1]` as baseline/comparison.

**trend** — always all four rounds on the x-axis, `null` for rounds with no submitted assessment. `actualCount` is the number of leading non-null points, i.e. where real data stops and the projection would start.

**strengths / weaknesses** — the 3 highest and 3 lowest dimension percentages of the **later** compared round (falling back to the earlier one); `[]` when neither exists.

**redFlags** — the flags of that same round, in full `RedFlag` shape. `recommendation` is always `null`.

**aiAnalysis / mentorRecommendations / incubationStatus** are fixed at `null` / `[]` / `null`: no narrative, mentor-note or incubation data model exists. They are placeholders the frontend already renders an empty state for, not unfinished work.

**Errors** — `403 PERM_001`, `404 STORE_001`, `422 VALID_002` (missing/invalid `compare`)

---

## GET /analytics/:storeId/radar
Just the `radar` object above. No query params — it answers every submitted round.

## GET /analytics/:storeId/trend
Just the `trend` object above. No query params.

## GET /analytics/:storeId/action-plans
IDP action plans (D7 / D30 / D90).

**Response 200** — `[]`, always. There is no IDP data model yet; the route exists so the page gets a 200 and an empty state instead of a 404. Access is still checked.

---

## GET /analytics/:storeId/export
The same analytics as an Excel workbook.

**Query Params** — `compare` (required), `province` (optional), same as the main endpoint.

**Response 200** — raw `xlsx` binary, `Content-Disposition: attachment; filename="analytics-<compare>-<storeId>.xlsx"`. **No `{ success, data }` envelope** — fetch it as a blob through the HTTP client, not an `<a href>`.
