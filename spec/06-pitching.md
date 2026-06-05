# Pitching Module — `/api/v1/pitching`

Judges score each store's business presentation. Each judge scores independently. Multiple judges allowed per store per round.

---

## Scoring Criteria (each 0–20 points, total 100)

| Criterion | Field | Max |
|---|---|---|
| ความชัดเจนของปัญหาและโอกาสทางธุรกิจ | `businessClarity` | 20 |
| ความน่าสนใจของเมนู / สินค้า | `productAppeal` | 20 |
| ความเป็นไปได้ของแผนตลาด | `marketPlan` | 20 |
| ความเข้าใจต้นทุนและกำไร | `financialUnderstanding` | 20 |
| ความพร้อมของเจ้าของร้าน | `ownerReadiness` | 20 |

---

## Endpoints

### GET /pitching
List all pitching scores.

**Access:** ADMIN, JUDGE, ME_TEAM (all); MENTOR (assigned stores); ENTREPRENEUR (own store — own judge score only)

**Query Params**
| Param | Type | Description |
|---|---|---|
| `storeId` | string | Filter by store |
| `judgeId` | string | Filter by judge (ADMIN only) |
| `round` | string | Filter by pitching round |

**Response 200**
```json
{
  "items": [
    {
      "id": "clpitch1",
      "storeId": "clstore1",
      "storeName": "ร้านอาหารสุขใจ",
      "judgeId": "cljudge1",
      "judgeName": "กรรมการ ก",
      "round": "T1",
      "businessClarity": 16,
      "productAppeal": 18,
      "marketPlan": 14,
      "financialUnderstanding": 12,
      "ownerReadiness": 17,
      "total": 77,
      "comment": "เจ้าของร้านมี passion สูง แต่แผนการเงินยังคลุมเครือ",
      "strengths": ["เมนูน่าสนใจ", "เจ้าของพูดเก่ง"],
      "concerns": ["ไม่รู้ต้นทุนจริง"],
      "createdAt": "2026-03-10T00:00:00.000Z"
    }
  ],
  "meta": { "total": 50, "page": 1, "limit": 20, "totalPages": 3 }
}
```

---

### GET /pitching/store/:storeId
Get aggregated pitching summary for a store (average across all judges).

**Response 200**
```json
{
  "storeId": "clstore1",
  "storeName": "ร้านอาหารสุขใจ",
  "round": "T1",
  "judgeCount": 3,
  "scores": [
    {
      "judgeId": "cljudge1",
      "judgeName": "กรรมการ ก",
      "total": 77
    },
    {
      "judgeId": "cljudge2",
      "judgeName": "กรรมการ ข",
      "total": 82
    },
    {
      "judgeId": "cljudge3",
      "judgeName": "กรรมการ ค",
      "total": 74
    }
  ],
  "average": {
    "businessClarity": 15.7,
    "productAppeal": 17.3,
    "marketPlan": 13.7,
    "financialUnderstanding": 13.0,
    "ownerReadiness": 16.7,
    "total": 76.3
  }
}
```

---

### POST /pitching
Submit pitching score for a store.

**Access:** ADMIN, JUDGE

**Body**
```json
{
  "storeId": "clstore1",
  "round": "T1",
  "businessClarity": 16,
  "productAppeal": 18,
  "marketPlan": 14,
  "financialUnderstanding": 12,
  "ownerReadiness": 17,
  "comment": "เจ้าของร้านมี passion สูง แต่แผนการเงินยังคลุมเครือ",
  "strengths": ["เมนูน่าสนใจ", "เจ้าของพูดเก่ง"],
  "concerns": ["ไม่รู้ต้นทุนจริง"]
}
```

**Response 201** — Created pitching score object

**Errors**
- `409 CONFLICT` — Judge already scored this store in this round

---

### PATCH /pitching/:id
Update pitching score (before ranking is finalized).

**Access:** ADMIN, JUDGE (own score)

**Body** (all optional)
```json
{
  "businessClarity": 17,
  "marketPlan": 15,
  "comment": "ปรับคะแนนหลังดู Pitch Deck อีกรอบ"
}
```

**Response 200** — Updated pitching score object

---

### DELETE /pitching/:id
Delete a pitching score.

**Access:** ADMIN

**Response 200**
```json
{ "message": "Pitching score deleted" }
```
