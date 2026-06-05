# Field Audit Module — `/api/v1/field-audit`

On-site verification for selected 20 stores (round T2). Auditor records checklist items and can upload evidence.

---

## Audit Checklist Items

Each item has: `category`, `item`, `result` (PASS / PENDING / FAIL), `note`, `evidenceUrls`

### Predefined Checklist Categories

| Category | Items |
|---|---|
| Food Safety | ภาพครัว, โซนจัดเก็บวัตถุดิบ, ใบอนุญาตร้านอาหาร, Food Safety Action Plan |
| Operations | SOP เปิด–ปิดร้าน, ระบบสต็อก, Costing Sheet |
| Menu & Quality | หลักฐานเมนูมาตรฐาน, ผลทดสอบรสชาติ |
| Marketing | หลักฐานช่องทางขาย, คอนเทนต์โซเชียล |
| Before–After | รูปภาพก่อน–หลังการปรับปรุง |

### Item Result

| Result | Meaning |
|---|---|
| `PASS` | Evidence complete, verified |
| `PENDING` | Need to submit more evidence |
| `FAIL` | Not done, requires follow-up |

---

## Endpoints

### GET /field-audit
List all field audits.

**Access:** ADMIN, ME_TEAM (all); ASSESSOR/MENTOR (assigned stores); ENTREPRENEUR (own store)

**Query Params**
| Param | Type | Description |
|---|---|---|
| `storeId` | string | Filter by store |
| `auditorId` | string | Filter by auditor (ADMIN only) |
| `round` | Round enum | Filter by round |

**Response 200**
```json
{
  "items": [
    {
      "id": "claudit1",
      "storeId": "clstore1",
      "storeName": "ร้านอาหารสุขใจ",
      "round": "T2",
      "auditorId": "cluser1",
      "auditorName": "Jane Assessor",
      "totalItems": 14,
      "passed": 10,
      "pending": 3,
      "failed": 1,
      "createdAt": "2026-04-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 20, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### GET /field-audit/:id
Get full audit detail including all checklist items.

**Response 200**
```json
{
  "id": "claudit1",
  "storeId": "clstore1",
  "store": { "id": "clstore1", "name": "ร้านอาหารสุขใจ", "province": "ชลบุรี" },
  "round": "T2",
  "auditorId": "cluser1",
  "auditor": { "id": "cluser1", "name": "Jane Assessor" },
  "items": [
    {
      "category": "Food Safety",
      "item": "ภาพครัว",
      "result": "PASS",
      "note": "ครัวสะอาด แยกโซนชัดเจน",
      "evidenceUrls": [
        "https://cdn.example.com/audits/claudit1/kitchen1.jpg"
      ]
    },
    {
      "category": "Operations",
      "item": "Costing Sheet",
      "result": "PENDING",
      "note": "มีแต่ไม่ครบทุกเมนู",
      "evidenceUrls": []
    }
  ],
  "summary": {
    "totalItems": 14,
    "passed": 10,
    "pending": 3,
    "failed": 1
  },
  "createdAt": "2026-04-01T00:00:00.000Z"
}
```

---

### POST /field-audit
Create a new field audit for a store.

**Access:** ADMIN, ASSESSOR (assigned stores)

**Body**
```json
{
  "storeId": "clstore1",
  "round": "T2",
  "items": [
    {
      "category": "Food Safety",
      "item": "ภาพครัว",
      "result": "PASS",
      "note": "ครัวสะอาด",
      "evidenceUrls": []
    },
    {
      "category": "Operations",
      "item": "Costing Sheet",
      "result": "PENDING",
      "note": "ส่งเพิ่มเติม",
      "evidenceUrls": []
    }
  ]
}
```

**Response 201** — Created audit object

**Errors**
- `409` — Audit already exists for (storeId, round)

---

### PATCH /field-audit/:id
Update audit items.

**Access:** ADMIN, ASSESSOR (owner of audit)

**Body**
```json
{
  "items": [
    {
      "category": "Operations",
      "item": "Costing Sheet",
      "result": "PASS",
      "note": "ส่งครบแล้ว",
      "evidenceUrls": ["https://cdn.example.com/audits/claudit1/costing.xlsx"]
    }
  ]
}
```

**Response 200** — Updated audit object

---

### POST /field-audit/:id/evidence
Upload evidence file for a field audit.

**Access:** ADMIN, ASSESSOR (owner), ENTREPRENEUR (own store)

**Content-Type:** `multipart/form-data`

**Body**
| Field | Type | Required |
|---|---|---|
| `file` | image/pdf/xlsx (max 10MB) | Yes |
| `category` | string | Yes |
| `item` | string | Yes |

**Response 201**
```json
{
  "url": "https://cdn.example.com/audits/claudit1/food_safety_plan.pdf",
  "filename": "food_safety_plan.pdf",
  "category": "Food Safety",
  "item": "Food Safety Action Plan"
}
```
