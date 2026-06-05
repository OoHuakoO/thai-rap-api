# Dashboard Module — `/api/v1/dashboard`

Read-only aggregated statistics. All endpoints are GET only.

---

## Access

| Endpoint | ADMIN | ASSESSOR | MENTOR | ENTREPRENEUR | ME_TEAM |
|---|---|---|---|---|---|
| Overview | ✓ (all) | assigned stores only | assigned stores only | own store only | ✓ (all) |
| Province stats | ✓ | — | — | — | ✓ |
| Dimension stats | ✓ | — | — | — | ✓ |
| Red flag overview | ✓ | assigned | assigned | own | ✓ |
| Store progress | ✓ | assigned | assigned | own | ✓ |

---

## Endpoints

### GET /dashboard/overview
Main overview stats for the entire program.

**Response 200**
```json
{
  "storeStats": {
    "total": 50,
    "byStatus": {
      "REGISTERED": 10,
      "T0_COMPLETED": 20,
      "CAMP_COMPLETED": 20,
      "T1_COMPLETED": 18,
      "PITCHING_COMPLETED": 18,
      "SELECTED": 15,
      "CONDITIONAL_SELECTED": 5,
      "WAITING_LIST": 10,
      "NOT_SELECTED": 20,
      "FIELD_AUDITED": 12,
      "IDP_CREATED": 10,
      "COMPLETED": 0
    }
  },
  "scoreStats": {
    "T0": {
      "avgTotal": 51.3,
      "byZone": {
        "redZone": 8,
        "survivalZone": 22,
        "improveZone": 15,
        "growthZone": 4,
        "modelZone": 1
      }
    },
    "T1": {
      "avgTotal": 64.8,
      "byZone": {
        "redZone": 2,
        "survivalZone": 10,
        "improveZone": 25,
        "growthZone": 10,
        "modelZone": 3
      }
    }
  },
  "improvementStats": {
    "avgImprovement": 13.5,
    "avgImprovementRate": 26.3
  },
  "redFlagStats": {
    "totalUnresolved": 38,
    "critical": 12,
    "warning": 26,
    "storesWithCritical": 10,
    "byType": {
      "FINANCIAL": 15,
      "FOOD_SAFETY": 8,
      "OPERATION": 5,
      "MARKET": 6,
      "LEGAL": 2,
      "OWNER_READINESS": 1,
      "EVIDENCE": 1,
      "GROWTH": 0
    }
  },
  "portfolioStats": {
    "storesStarted": 30,
    "storesComplete": 8,
    "avgDimensionsComplete": 4.2
  },
  "top20": [
    {
      "rank": 1,
      "storeId": "clstore1",
      "storeName": "ร้านอาหารสุขใจ",
      "province": "ชลบุรี",
      "incubationReadinessScore": 72.1,
      "selectionStatus": "SELECTED"
    }
  ],
  "urgentFieldVisit": [
    {
      "storeId": "clstore5",
      "storeName": "ร้านข้าวมันไก่",
      "province": "ระยอง",
      "criticalRedFlags": ["LEGAL", "FINANCIAL"]
    }
  ],
  "weakestDimensions": [
    { "dimensionId": 5, "dimensionName": "การเงิน", "avgScore": 38.2 },
    { "dimensionId": 6, "dimensionName": "ระบบปฏิบัติการ", "avgScore": 41.5 }
  ]
}
```

---

### GET /dashboard/provinces
Score statistics grouped by province.

**Response 200**
```json
{
  "provinces": [
    {
      "province": "ชลบุรี",
      "storeCount": 15,
      "avgT0Score": 53.2,
      "avgT1Score": 67.4,
      "avgImprovement": 14.2,
      "redFlagCount": 12
    },
    {
      "province": "ระยอง",
      "storeCount": 12,
      "avgT0Score": 48.1,
      "avgT1Score": 61.9,
      "avgImprovement": 13.8,
      "redFlagCount": 9
    }
  ],
  "highestAvgScore": "ชลบุรี",
  "lowestAvgScore": "สระแก้ว"
}
```

---

### GET /dashboard/dimensions
Average dimension scores across all stores for a given round.

**Query Params**
| Param | Type | Default | Description |
|---|---|---|---|
| `round` | Round enum | `T0` | Which round to compute from |
| `province` | string | — | Filter by province |

**Response 200**
```json
{
  "round": "T0",
  "dimensions": [
    {
      "dimensionId": 1,
      "dimensionName": "คุณภาพอาหารและนวัตกรรมเมนู",
      "weight": 12,
      "avgScore": 58.3,
      "minScore": 14.3,
      "maxScore": 100.0
    },
    {
      "dimensionId": 5,
      "dimensionName": "การเงิน ต้นทุน และกำไร",
      "weight": 20,
      "avgScore": 38.2,
      "minScore": 0.0,
      "maxScore": 85.7
    }
  ]
}
```

---

### GET /dashboard/store/:storeId
Store-level dashboard — score trend, red flags, IDP progress, portfolio completion.

**Access:** ADMIN, ASSESSOR/MENTOR (assigned), ENTREPRENEUR (own)

**Response 200**
```json
{
  "storeId": "clstore1",
  "storeName": "ร้านอาหารสุขใจ",
  "province": "ชลบุรี",
  "status": "T1_COMPLETED",
  "scoreTrend": {
    "T0": 48.2,
    "T1": 62.5,
    "T2": null,
    "T3": null,
    "T4": null
  },
  "latestZone": "Improve Zone",
  "improvement": { "delta": 14.3, "rate": 29.7 },
  "dimensionScores": {
    "T0": [
      { "dimensionId": 1, "name": "คุณภาพอาหาร", "score": 50.0 },
      { "dimensionId": 5, "name": "การเงิน", "score": 28.6 }
    ],
    "T1": [
      { "dimensionId": 1, "name": "คุณภาพอาหาร", "score": 64.3 },
      { "dimensionId": 5, "name": "การเงิน", "score": 56.0 }
    ]
  },
  "topStrengths": [
    { "dimensionId": 8, "name": "ความพร้อมเติบโต", "score": 88.0 }
  ],
  "topWeaknesses": [
    { "dimensionId": 5, "name": "การเงิน", "score": 56.0 }
  ],
  "redFlags": {
    "total": 3,
    "critical": 1,
    "warning": 2,
    "resolved": 1,
    "list": [...]
  },
  "pitchingScore": 76.3,
  "incubationReadinessScore": 63.8,
  "selectionStatus": "SELECTED",
  "portfolioCompletion": {
    "complete": 5,
    "total": 8
  },
  "idpProgress": {
    "totalPlans": 8,
    "done": 3,
    "inProgress": 3,
    "pending": 2
  }
}
```

---

### GET /dashboard/okr
OKR/KR progress dashboard. Shows aggregated KR progress across all stores.

**Access:** ADMIN, ME_TEAM

**Response 200**
```json
{
  "objectives": [
    {
      "id": "O1",
      "title": "สร้างเครือข่ายผู้ประกอบการอาหารภาคตะวันออก",
      "keyResults": [
        {
          "id": "KR1.1",
          "title": "ผู้เข้าอบรม 1,200 คน",
          "target": 1200,
          "current": 800,
          "unit": "คน",
          "percentAchieved": 66.7
        }
      ]
    },
    {
      "id": "O2",
      "title": "ปั้นธุรกิจต้นแบบที่โตได้จริง",
      "keyResults": [
        {
          "id": "KR2.1",
          "title": "ธุรกิจต้นแบบ 10 กิจการ",
          "target": 10,
          "current": 2,
          "unit": "กิจการ",
          "percentAchieved": 20.0
        },
        {
          "id": "KR2.2",
          "title": "Portfolio ครบ 8 มิติ",
          "target": 50,
          "current": 8,
          "unit": "ร้าน",
          "percentAchieved": 16.0
        }
      ]
    }
  ]
}
```
