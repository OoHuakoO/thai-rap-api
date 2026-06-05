# Ranking Module — `/api/v1/ranking`

Computes Incubation Readiness Score to select Top 20 from 50 stores.

---

## Incubation Readiness Score Formula

```
IRS = (T1_Score × 0.40)
    + (ImprovementScore × 0.25)
    + (PitchingScore × 0.20)
    + (MindsetScore × 0.10)
    + (EvidenceScore × 0.05)
```

| Component | Weight | Source |
|---|---|---|
| T1 total score | 40% | Assessment round T1 |
| Improvement score (T0→T1) | 25% | (T1 - T0) / 100 × 100 |
| Pitching score (avg judges) | 20% | Average of all judge scores |
| Open-Growth Mindset | 10% | Q47 + Q48 score (normalized 0–100) |
| Evidence readiness | 5% | Q49 score (normalized 0–100) |

### Selection Status

| Rank / Condition | Status |
|---|---|
| Rank 1–20, no CRITICAL red flag | `SELECTED` |
| Rank 1–20, has CRITICAL red flag | `CONDITIONAL_SELECTED` |
| Rank 21–30 | `WAITING_LIST` |
| Below rank 30 | `NOT_SELECTED` |

---

## Endpoints

### GET /ranking
Get ranked list of all stores with their IRS.

**Access:** ADMIN, ME_TEAM (full); ASSESSOR/MENTOR/JUDGE (read, assigned/all); ENTREPRENEUR (own rank only)

**Query Params**
| Param | Type | Description |
|---|---|---|
| `province` | string | Filter by province |
| `status` | SelectionStatus | Filter by selection status |
| `limit` | number | How many to return (default 50) |

**Response 200**
```json
{
  "generatedAt": "2026-06-05T10:00:00.000Z",
  "stores": [
    {
      "rank": 1,
      "storeId": "clstore1",
      "storeName": "ร้านอาหารสุขใจ",
      "province": "ชลบุรี",
      "ownerName": "สมชาย ใจดี",
      "T0Score": 48.2,
      "T1Score": 72.5,
      "improvementScore": 24.3,
      "improvementRate": 50.4,
      "pitchingAvgScore": 76.3,
      "mindsetScore": 75.0,
      "evidenceScore": 50.0,
      "incubationReadinessScore": 66.7,
      "hasCriticalRedFlag": false,
      "selectionStatus": "SELECTED"
    }
  ]
}
```

---

### GET /ranking/:storeId
Get ranking detail for a specific store.

**Response 200**
```json
{
  "rank": 1,
  "storeId": "clstore1",
  "storeName": "ร้านอาหารสุขใจ",
  "province": "ชลบุรี",
  "components": {
    "T1Score": { "value": 72.5, "weight": 0.40, "weighted": 29.0 },
    "improvementScore": { "value": 24.3, "weight": 0.25, "weighted": 6.1 },
    "pitchingScore": { "value": 76.3, "weight": 0.20, "weighted": 15.3 },
    "mindsetScore": { "value": 75.0, "weight": 0.10, "weighted": 7.5 },
    "evidenceScore": { "value": 50.0, "weight": 0.05, "weighted": 2.5 }
  },
  "incubationReadinessScore": 60.4,
  "redFlags": [
    { "type": "MARKET", "severity": "WARNING", "resolved": false }
  ],
  "hasCriticalRedFlag": false,
  "selectionStatus": "SELECTED"
}
```

---

### POST /ranking/recalculate
Trigger ranking recalculation (e.g., after new pitching scores are added).

**Access:** ADMIN

**Response 200**
```json
{
  "message": "Ranking recalculated",
  "storesProcessed": 50,
  "generatedAt": "2026-06-05T10:05:00.000Z"
}
```

---

### POST /ranking/finalize
Lock and apply selection statuses to stores (`Store.status` field updated).

**Access:** ADMIN

This action:
1. Computes final ranking
2. Updates `Store.status` for all 50 stores to match selection result
3. Flags stores as `SELECTED`, `CONDITIONAL_SELECTED`, `WAITING_LIST`, or `NOT_SELECTED`

**Response 200**
```json
{
  "message": "Ranking finalized and store statuses updated",
  "selected": 15,
  "conditionalSelected": 5,
  "waitingList": 10,
  "notSelected": 20
}
```

**Errors**
- `400` — T1 assessments not complete for all stores
- `400` — Pitching scores missing
