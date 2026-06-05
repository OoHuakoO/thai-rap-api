# Portfolio Module — `/api/v1/portfolio`

Digital Portfolio — one record per store per dimension (8 dimensions total per store).
Portfolio tracks evidence, files, mentor notes, and completion status.

---

## Portfolio Dimensions

| Dimension ID | Dimension | Key Evidence |
|---|---|---|
| 1 | อาหารและเมนู | Signature menu, สูตรมาตรฐาน, รูปอาหาร, ผลทดสอบรสชาติ |
| 2 | Food Safety | Food Safety Action Plan, รูปครัว, ใบอนุญาต, Checklist สุขอนามัย |
| 3 | แบรนด์ | Brand Story, CI/Key Visual, Business Model Canvas |
| 4 | การตลาด | ช่องทางออนไลน์, แผนคอนเทนต์, Customer Persona, CRM |
| 5 | การเงิน | Costing Sheet, ราคาขาย, ยอดขายก่อน–หลัง, บัญชีรายรับรายจ่าย |
| 6 | ระบบร้าน | SOP เปิด–ปิดร้าน, SOP ครัว, SOP บริการ, ระบบสต็อก |
| 7 | Supply Chain | ซัพพลายเออร์, วัตถุดิบท้องถิ่น, ภาคีชุมชน, คู่ค้า |
| 8 | การเติบโต | Pitch Deck, Scaling Plan, ช่องทางขายใหม่, Roadmap 90 วัน |

---

## Endpoints

### GET /portfolio
List portfolio entries.

**Access:** ADMIN, ME_TEAM (all); MENTOR (assigned stores); ASSESSOR (assigned stores, read); ENTREPRENEUR (own store)

**Query Params**
| Param | Type | Description |
|---|---|---|
| `storeId` | string | Filter by store |
| `dimensionId` | number | Filter by dimension |
| `status` | `PENDING` \| `COMPLETE` | Filter by status |

**Response 200**
```json
{
  "items": [
    {
      "id": "clport1",
      "storeId": "clstore1",
      "storeName": "ร้านอาหารสุขใจ",
      "dimensionId": 1,
      "dimensionName": "อาหารและเมนู",
      "status": "COMPLETE",
      "fileCount": 4,
      "updatedAt": "2026-04-15T00:00:00.000Z"
    }
  ],
  "meta": { "total": 8, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### GET /portfolio/store/:storeId
Get all 8 portfolio dimensions for a store.

**Response 200**
```json
{
  "storeId": "clstore1",
  "storeName": "ร้านอาหารสุขใจ",
  "completionSummary": {
    "total": 8,
    "complete": 5,
    "pending": 3,
    "percentComplete": 62.5
  },
  "portfolios": [
    {
      "id": "clport1",
      "dimensionId": 1,
      "dimensionName": "อาหารและเมนู",
      "summary": "มีเมนู Signature 3 รายการ มีสูตรมาตรฐานครบ",
      "results": "ยอดขายเมนู Signature เพิ่มขึ้น 20% หลังปรับแผน",
      "files": [
        {
          "name": "menu_signature.pdf",
          "url": "https://cdn.example.com/portfolio/clstore1/dim1/menu.pdf",
          "type": "pdf"
        }
      ],
      "mentorNote": "ดีมาก แนะนำให้ถ่ายรูปเมนูเพิ่มสำหรับ marketing",
      "status": "COMPLETE",
      "updatedAt": "2026-04-15T00:00:00.000Z"
    }
  ]
}
```

---

### GET /portfolio/:id
Get single portfolio entry detail.

**Response 200** — Single portfolio object (same structure as portfolios[] above)

---

### PUT /portfolio/store/:storeId/dimension/:dimensionId
Create or update portfolio for a specific dimension. (Upsert)

**Access:** ADMIN, ENTREPRENEUR (own store — summary/results/files), MENTOR (mentorNote + status)

**Body**
```json
{
  "summary": "มีเมนู Signature 3 รายการ มีสูตรมาตรฐานครบ",
  "results": "ยอดขายเมนู Signature เพิ่มขึ้น 20%",
  "mentorNote": "ดีมาก ควรเพิ่มรูปอาหาร",
  "status": "COMPLETE"
}
```

**Response 200** — Updated portfolio object

---

### POST /portfolio/store/:storeId/dimension/:dimensionId/files
Upload files to a portfolio dimension.

**Access:** ADMIN, ENTREPRENEUR (own store), MENTOR (assigned stores)

**Content-Type:** `multipart/form-data`

**Body**
| Field | Type | Required |
|---|---|---|
| `files` | image/pdf/xlsx (max 10MB each, max 10 files) | Yes |

**Response 201**
```json
{
  "uploaded": 2,
  "files": [
    {
      "name": "brand_story.pdf",
      "url": "https://cdn.example.com/portfolio/clstore1/dim3/brand_story.pdf",
      "type": "pdf",
      "size": 512000
    }
  ]
}
```

---

### DELETE /portfolio/store/:storeId/dimension/:dimensionId/files
Remove a file from portfolio.

**Access:** ADMIN, ENTREPRENEUR (own store), MENTOR (assigned)

**Body**
```json
{ "url": "https://cdn.example.com/portfolio/clstore1/dim3/brand_story.pdf" }
```

**Response 200**
```json
{ "message": "File removed" }
```

---

### GET /portfolio/summary
Get portfolio completion summary across all stores (for Dashboard).

**Access:** ADMIN, ME_TEAM

**Response 200**
```json
{
  "totalStores": 50,
  "portfolioStarted": 30,
  "portfolioComplete8Dims": 8,
  "avgDimensionsComplete": 4.2,
  "byDimension": [
    {
      "dimensionId": 1,
      "dimensionName": "อาหารและเมนู",
      "completeCount": 25,
      "pendingCount": 25
    }
  ]
}
```
