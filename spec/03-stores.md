# Stores Module — `/api/v1/stores`

## Access Summary

| Action | ADMIN | ASSESSOR | MENTOR | ENTREPRENEUR | JUDGE | ME_TEAM |
|---|---|---|---|---|---|---|
| List all stores | ✓ | assigned only | assigned only | own only | — | ✓ (read) |
| Get store detail | ✓ | assigned only | assigned only | own only | ✓ (limited) | ✓ |
| Create store | ✓ | — | — | — | — | — |
| Update store | ✓ | — | — | own basic info | — | — |
| Delete store | ✓ | — | — | — | — | — |
| Update status | ✓ | — | — | — | — | — |
| Upload photos | ✓ | — | — | ✓ | — | — |

---

## Endpoints

### GET /stores
List all stores with pagination and filtering.

**Query Params**
| Param | Type | Description |
|---|---|---|
| `page` | number | Page number |
| `limit` | number | Items per page |
| `search` | string | Search by name, owner, province |
| `province` | string | Filter by province |
| `storeType` | string | Filter by store type |
| `status` | StoreStatus enum | Filter by status |
| `hasRedFlag` | boolean | Filter stores with unresolved red flags |
| `zone` | `red` \| `survival` \| `improve` \| `growth` \| `model` | Filter by score zone (T0 or latest round) |
| `round` | Round enum | Round to use for score/zone filter |

**Response 200**
```json
{
  "items": [
    {
      "id": "clstore1",
      "name": "ร้านอาหารสุขใจ",
      "province": "ชลบุรี",
      "storeType": "ร้านอาหารทั่วไป",
      "ownerName": "สมชาย ใจดี",
      "phone": "0812345678",
      "status": "T0_COMPLETED",
      "latestScore": 62.5,
      "zone": "Improve Zone",
      "hasRedFlag": true,
      "redFlagCount": 2,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 50, "page": 1, "limit": 20, "totalPages": 3 }
}
```

---

### GET /stores/:id
Get full store detail including latest scores per dimension.

**Response 200**
```json
{
  "id": "clstore1",
  "name": "ร้านอาหารสุขใจ",
  "province": "ชลบุรี",
  "storeType": "ร้านอาหารทั่วไป",
  "ownerName": "สมชาย ใจดี",
  "phone": "0812345678",
  "email": "somchai@example.com",
  "address": "123 ถ.สุขุมวิท ต.บางปลาสร้อย อ.เมือง จ.ชลบุรี",
  "socialLinks": {
    "facebook": "https://facebook.com/sukjai",
    "tiktok": "@sukjai_food",
    "lineOA": "@sukjai",
    "googleMaps": "https://maps.google.com/..."
  },
  "avgRevenue": 45000,
  "mainProblems": "ต้นทุนสูง ไม่มีระบบบัญชี",
  "goals": "เพิ่มยอดขาย 30% ภายใน 3 เดือน",
  "photos": [
    "https://cdn.example.com/stores/clstore1/photo1.jpg"
  ],
  "status": "T0_COMPLETED",
  "assignedAssessors": [
    { "id": "claxxxx", "name": "Jane Assessor" }
  ],
  "assessmentSummary": {
    "T0": { "totalScore": 48.2, "zone": "Survival Zone", "submittedAt": "2026-02-01T00:00:00.000Z" },
    "T1": null
  },
  "redFlags": [
    { "type": "FINANCIAL", "severity": "CRITICAL", "resolved": false },
    { "type": "MARKET", "severity": "WARNING", "resolved": false }
  ],
  "createdAt": "2026-01-15T00:00:00.000Z",
  "updatedAt": "2026-02-01T00:00:00.000Z"
}
```

---

### POST /stores
Create a new store.

**Access:** ADMIN

**Body**
```json
{
  "name": "ร้านอาหารสุขใจ",
  "province": "ชลบุรี",
  "storeType": "ร้านอาหารทั่วไป",
  "ownerName": "สมชาย ใจดี",
  "phone": "0812345678",
  "email": "somchai@example.com",
  "address": "123 ถ.สุขุมวิท ...",
  "socialLinks": {
    "facebook": "https://facebook.com/sukjai",
    "tiktok": "@sukjai_food",
    "lineOA": "@sukjai",
    "googleMaps": "https://maps.google.com/..."
  },
  "avgRevenue": 45000,
  "mainProblems": "ต้นทุนสูง ไม่มีระบบบัญชี",
  "goals": "เพิ่มยอดขาย 30%"
}
```

**Response 201** — Full store object

---

### PATCH /stores/:id
Update store information.

**Access:** ADMIN (all fields), ENTREPRENEUR (own store: name, phone, email, address, socialLinks, avgRevenue, mainProblems, goals)

**Body** (all optional)
```json
{
  "name": "ร้านสุขใจ (ใหม่)",
  "phone": "0899999999",
  "avgRevenue": 55000,
  "mainProblems": "แก้ไขแล้ว",
  "goals": "เป้าหมายใหม่"
}
```

**Response 200** — Updated store object

---

### PATCH /stores/:id/status
Update store status.

**Access:** ADMIN

**Body**
```json
{
  "status": "SELECTED"
}
```

**Response 200**
```json
{
  "id": "clstore1",
  "status": "SELECTED",
  "updatedAt": "2026-06-05T10:00:00.000Z"
}
```

---

### DELETE /stores/:id
Delete store (cascade deletes assessments, scores, etc.).

**Access:** ADMIN

**Response 200**
```json
{ "message": "Store deleted" }
```

---

### POST /stores/:id/photos
Upload store or menu photos.

**Access:** ADMIN, ENTREPRENEUR (own store)

**Content-Type:** `multipart/form-data`

**Body**
| Field | Type | Required |
|---|---|---|
| `files` | image[] (jpg/png, max 10MB each, max 10 files) | Yes |
| `type` | `store` \| `menu` | Yes |

**Response 201**
```json
{
  "uploaded": 3,
  "urls": [
    "https://cdn.example.com/stores/clstore1/photo1.jpg",
    "https://cdn.example.com/stores/clstore1/photo2.jpg",
    "https://cdn.example.com/stores/clstore1/menu1.jpg"
  ]
}
```

---

### DELETE /stores/:id/photos
Remove a store photo.

**Access:** ADMIN

**Body**
```json
{ "url": "https://cdn.example.com/stores/clstore1/photo1.jpg" }
```

**Response 200**
```json
{ "message": "Photo removed" }
```
