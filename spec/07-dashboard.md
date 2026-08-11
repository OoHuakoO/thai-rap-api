# Dashboard Module — `/api/v1/dashboard`

The ภาพรวมโครงการ cards. Aggregates over `Store` and `Assessment`; nothing here is stored or cached.

```
GET /dashboard/kpis
GET /dashboard/province-distribution
GET /dashboard/top20
GET /dashboard/incubation-progress
GET /dashboard/province-comparison
GET /dashboard/store-scores
GET /dashboard/store-scores/export
GET /dashboard/activities
GET /dashboard/reports-status
```

## Access

**JUDGE is refused every endpoint here** (`403 PERM_001`, `OVERVIEW_READ_ROLES`) — a judge is a guest on the panel for the stores it is assigned, not a participant in the programme, and the web app hides ภาพรวมโครงการ from it for the same reason.

Every other signed-in role gets an answer; what changes is the store set it is computed over, through the same `resolveStoreScope()` the store directory uses:

| Role | Cards computed over |
|---|---|
| ENTREPRENEUR | the stores it owns |
| ASSESSOR / MENTOR | its assignment list |
| JUDGE | refused — `403 PERM_001` |
| everyone else | every store |

So an assessor's Top 20 and KPI counts describe exactly the stores it can open on `/stores` — never a store it would 403 on. A narrowed role with nothing in scope gets zeros and empty arrays, not an error.

Two exceptions to the scoping: `GET /dashboard/activities` is the news feed and has no store to narrow on, and `targetStores` stays the project-wide `STORE_TARGET_TOTAL` (400) for every role — the goal is the programme's, not a count of what the caller reaches.

Every response here is a **bare array or object** — none of these endpoints is paginated.

---

## GET /dashboard/kpis

**Response 200**
```json
{
  "totalStores": 118,
  "targetStores": 400,
  "t0Completed": 95,
  "t0Percentage": 80.51,
  "t1Completed": 40,
  "t1Percentage": 33.9,
  "t2Completed": 12,
  "t2Percentage": 10.17,
  "t3Completed": 3,
  "t3Percentage": 2.54,
  "selectedStores": 30,
  "selectedPercentage": 25.42,
  "improvedStores": 22,
  "improvementRate": 18.64,
  "avgScore": 55.31,
  "lastUpdated": "2026-06-01T09:00:00.000Z"
}
```
- Percentages are against `totalStores` (the caller's scope), not `targetStores`; 0 when the scope is empty.
- `selectedStores` counts `SELECTED`, `FIELD_AUDITED`, `IDP_CREATED`, `COMPLETED` — a store that advanced past selection still counts as selected.
- `improvedStores` counts a store **once** if any round scored higher than the previous assessed round; rounds a store skipped are ignored, so T0 → T2 compares as consecutive. `improvementRate` is that count as a percentage of stores in scope.
- `avgScore` averages each store's **latest** submitted `totalScore`.
- `lastUpdated` is the newest `submittedAt` in scope; `null` if nothing is submitted.

---

## GET /dashboard/province-distribution
Store counts by province, for the donut chart.

**Response 200**
```json
[{ "province": "ชลบุรี", "count": 40, "percentage": 33.9 }]
```
A store with no province is grouped under `"ไม่ระบุ"`. `percentage` is against the total in scope, 2 decimals.

---

## GET /dashboard/top20
The highest-scoring stores, at most 20.

**Query Params**
| Param | Type | Default | Description |
|---|---|---|---|
| `round` | `all` \| `T0`–`T3` | `all` | `all` ranks each store by its **latest** submitted assessment |

**Response 200**
```json
[
  {
    "rank": 1,
    "storeId": "clstore1",
    "storeName": "ร้านอาหารสุขใจ",
    "province": "ชลบุรี",
    "storeType": "อาหารไทย",
    "t1Score": 82.4
  }
]
```
`t1Score` is whatever round was ranked, not necessarily T1 — the field name is the web's. Stores with no score are excluded; `rank` is 1-based over what remains.

**Errors** — `422 VALID_002` for a `round` that is neither `all` nor a `Round`

---

## GET /dashboard/incubation-progress
The funnel, five fixed steps.

**Response 200**
```json
[
  { "label": "คัดกรองเบื้องต้น", "count": 95, "percentage": 80.51 },
  { "label": "ประเมิน T1", "count": 40, "percentage": 33.9 },
  { "label": "พัฒนาศักยภาพ", "count": 12, "percentage": 10.17 },
  { "label": "ประเมิน", "count": 3, "percentage": 2.54 },
  { "label": "ผ่านเข้ารอบ", "count": 30, "percentage": 25.42 }
]
```
Steps 1–4 are submissions of T0 / T1 / T2 / T3 — deliberately round counts rather than `Store.status` stages, because the web stamps a fixed T0–T3 badge on each position. The last step counts the same selected statuses as `selectedStores` above, which is why it can exceed the step before it.

---

## GET /dashboard/province-comparison
Two rounds by province, for the grouped bar chart.

**Query Params**
| Param | Type | Default |
|---|---|---|
| `from` | Round enum | `T0` |
| `to` | Round enum | `T1` |

**Response 200**
```json
[{ "province": "ชลบุรี", "fromRound": "T0", "toRound": "T1", "fromScore": 47.8, "toScore": 60.2 }]
```

- Only stores holding **both** scores are counted, so the two bars describe the same set of stores. A province with no baseline is absent rather than plotted as a real zero.
- At most **5 provinces**, chosen by paired-store count (ties broken by name), then sorted by `toScore` descending. The chart collides its labels past five.

---

## GET /dashboard/store-scores
Every store in scope with its score in each round — the source of the คะแนนรายร้าน table.

**Response 200**
```json
[
  {
    "storeId": "clstore1",
    "storeName": "ร้านอาหารสุขใจ",
    "province": "ชลบุรี",
    "storeType": "อาหารไทย",
    "scores": { "T0": 48.2, "T1": 61.5, "T2": null, "T3": null }
  }
]
```
All four round keys are always present; `null` means no submitted assessment. Missing province/type read `"ไม่ระบุ"`. Not paginated — this returns every store in scope.

## GET /dashboard/store-scores/export
The same rows as an Excel workbook.

**Response 200** — raw `xlsx` binary, `Content-Disposition: attachment; filename="store-round-scores.xlsx"`. **No `{ success, data }` envelope**; no query params. Fetch as a blob through the HTTP client — an `<a href>` arrives without the bearer token and 401s.

---

## GET /dashboard/activities
The overview's activity feed — **nothing but the news module**, the 10 newest announcements (urgent pinned first). It derives no rows of its own: the T1-follow-up and red-flag warnings it once synthesised are gone, and an admin who wants one publishes an `ALERT` item on `/news`.

Not scoped by store, and takes no user — same as `GET /news`.

**Response 200**
```json
[
  {
    "type": "announcement",
    "title": "อัปเดตเกณฑ์การประเมินโครงการ ปี 2569",
    "description": "มีผลตั้งแต่วันที่ 18 พ.ค. 2569 เป็นต้นไป",
    "date": "2026-05-18T00:00:00.000Z",
    "urgent": false
  }
]
```
`type` maps from `NewsType`: `GENERAL` → `announcement`, `EVENT` → `event`, `ALERT` → `warning`. The item's `id` is not carried — this is a feed, not a link list.

---

## GET /dashboard/reports-status
The เอกสาร / รายงาน card — reports the caller may download right now. Derived from submitted rounds by `ReportService.listAvailableReports()`; see [05-reports.md](05-reports.md).

**Response 200**
```json
[
  {
    "id": "clstore1:T1:xlsx",
    "name": "รายงานผลการประเมิน T1 - ร้านอาหารสุขใจ",
    "format": "XLSX",
    "createdAt": "2026-05-01T00:00:00.000Z",
    "status": "DONE",
    "downloadUrl": "/reports/stores/clstore1/rounds/T1/export?format=xlsx"
  }
]
```
At most **5 rows**, newest first (`RECENT_REPORT_LIMIT`), built from the caller's most recent submitted rounds — two kinds per store (the round, and the store's overview) × two formats. `status` is always `DONE` and `format` is always `PDF` or `XLSX` — the API never emits `PENDING`/`GENERATING`/`FAILED`/`CSV`, even though the TypeScript union allows them. Scope follows assessment reads: JUDGE and VIEWER get `[]` rather than a 403, so the card still renders.

`downloadUrl` is an API route relative to `/api/v1`, not a stored file.
