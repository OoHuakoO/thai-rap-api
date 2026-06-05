# Red Flags Module — `/api/v1/red-flags`

Red flags are **auto-generated** when an assessment is submitted. They can also be manually created by Admin/Assessor.

---

## Red Flag Types & Triggers

| Type | Severity | Trigger |
|---|---|---|
| `FOOD_SAFETY` | WARNING | Q8–Q14 average < 2 |
| `FINANCIAL` | CRITICAL | Q28, Q29, Q30, or Q31 scored 0–1 |
| `OPERATION` | WARNING | Q35, Q36, Q39, or Q41 scored 0–1 |
| `MARKET` | WARNING | Q21 or Q22 scored 0–1 |
| `LEGAL` | CRITICAL | Q13 = 0 |
| `OWNER_READINESS` | WARNING | Q47 or Q48 < 2 |
| `EVIDENCE` | WARNING | Q49 < 2 |
| `GROWTH` | WARNING | Q50 < 2 |

---

## Endpoints

### GET /red-flags
List red flags with filtering.

**Access:** ADMIN, ME_TEAM (all); ASSESSOR/MENTOR (assigned stores); ENTREPRENEUR (own store)

**Query Params**
| Param | Type | Description |
|---|---|---|
| `storeId` | string | Filter by store |
| `assessmentId` | string | Filter by assessment |
| `type` | RedFlagType enum | Filter by flag type |
| `severity` | `WARNING` \| `CRITICAL` | Filter by severity |
| `resolved` | boolean | Filter resolved/unresolved |
| `round` | Round enum | Filter by assessment round |
| `province` | string | Filter by province (ADMIN only) |

**Response 200**
```json
{
  "items": [
    {
      "id": "clredflag1",
      "assessmentId": "classess1",
      "storeId": "clstore1",
      "storeName": "ร้านอาหารสุขใจ",
      "round": "T0",
      "type": "FINANCIAL",
      "severity": "CRITICAL",
      "triggerQuestions": [28, 29, 30],
      "recommendation": "ต้องจัดทำ Costing Sheet และแยกบัญชีร้าน",
      "resolved": false,
      "createdAt": "2026-02-01T10:00:00.000Z"
    }
  ],
  "meta": { "total": 15, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### GET /red-flags/:id
Get single red flag detail.

**Response 200** — Single red flag object (same structure as list item)

---

### POST /red-flags
Manually create a red flag (for cases not covered by auto-detection).

**Access:** ADMIN, ASSESSOR (assigned stores)

**Body**
```json
{
  "assessmentId": "classess1",
  "type": "FOOD_SAFETY",
  "severity": "CRITICAL",
  "triggerQuestions": [8, 9, 10],
  "recommendation": "ครัวสกปรกมาก ต้องแก้ด่วนก่อนเปิดร้าน"
}
```

**Response 201** — Created red flag object

---

### PATCH /red-flags/:id
Update red flag recommendation or resolve it.

**Access:** ADMIN, MENTOR (assigned stores)

**Body** (all optional)
```json
{
  "recommendation": "ปรับแล้ว แนะนำตรวจซ้ำใน 2 สัปดาห์",
  "resolved": true
}
```

**Response 200** — Updated red flag object

---

### GET /stores/:storeId/red-flags
Get all red flags for a specific store across all rounds.

**Response 200**
```json
{
  "storeId": "clstore1",
  "storeName": "ร้านอาหารสุขใจ",
  "summary": {
    "total": 4,
    "critical": 2,
    "warning": 2,
    "resolved": 1,
    "unresolved": 3
  },
  "byRound": {
    "T0": [
      {
        "type": "FINANCIAL",
        "severity": "CRITICAL",
        "resolved": false
      }
    ],
    "T1": [
      {
        "type": "FINANCIAL",
        "severity": "CRITICAL",
        "resolved": true
      }
    ]
  }
}
```
