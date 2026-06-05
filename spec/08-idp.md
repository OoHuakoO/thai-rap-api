# IDP & Mentoring Module — `/api/v1/idp`

Individual Development Plan (IDP) — one per store per mentor. Contains action plans in 3 phases (7/30/90 days) and mentoring logs.

---

## Endpoints

### GET /idp
List all IDPs.

**Access:** ADMIN, ME_TEAM (all); MENTOR (own IDPs); ENTREPRENEUR (own store); ASSESSOR (assigned stores, read-only)

**Query Params**
| Param | Type | Description |
|---|---|---|
| `storeId` | string | Filter by store |
| `mentorId` | string | Filter by mentor (ADMIN only) |

**Response 200**
```json
{
  "items": [
    {
      "id": "clidp1",
      "storeId": "clstore1",
      "storeName": "ร้านอาหารสุขใจ",
      "mentorId": "clmentor1",
      "mentorName": "พี่เลี้ยง ก",
      "planCount": 8,
      "completedPlans": 3,
      "logCount": 5,
      "createdAt": "2026-03-20T00:00:00.000Z",
      "updatedAt": "2026-06-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 20, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### GET /idp/:id
Get IDP detail including all plans and mentoring logs.

**Response 200**
```json
{
  "id": "clidp1",
  "storeId": "clstore1",
  "store": { "id": "clstore1", "name": "ร้านอาหารสุขใจ", "province": "ชลบุรี" },
  "mentorId": "clmentor1",
  "mentor": { "id": "clmentor1", "name": "พี่เลี้ยง ก" },
  "plans": [
    {
      "id": "clplan1",
      "phase": "D7",
      "issue": "ไม่มี Costing Sheet",
      "actionPlan": "จัดทำ Costing Sheet เมนูหลัก 5 เมนู",
      "responsible": "เจ้าของร้าน",
      "dueDate": "2026-03-27T00:00:00.000Z",
      "progress": 100,
      "status": "DONE"
    },
    {
      "id": "clplan2",
      "phase": "D30",
      "issue": "ไม่มี SOP ครัว",
      "actionPlan": "เขียน SOP เปิด–ปิดร้านและ SOP ครัวอย่างน้อย 3 ขั้นตอน",
      "responsible": "เจ้าของร้าน + พี่เลี้ยง",
      "dueDate": "2026-04-20T00:00:00.000Z",
      "progress": 60,
      "status": "IN_PROGRESS"
    }
  ],
  "logs": [
    {
      "id": "cllog1",
      "date": "2026-03-22T00:00:00.000Z",
      "note": "ลงพื้นที่ดูครัว พบว่ามีการแยกวัตถุดิบดีขึ้น แต่ยังขาด Costing Sheet",
      "outcome": "ตกลงจัดทำ Costing Sheet ภายใน 7 วัน",
      "createdAt": "2026-03-22T10:00:00.000Z"
    }
  ],
  "createdAt": "2026-03-20T00:00:00.000Z"
}
```

---

### POST /idp
Create new IDP for a store.

**Access:** ADMIN, MENTOR (assigned stores)

**Body**
```json
{
  "storeId": "clstore1"
}
```

**Response 201** — Created IDP object (empty plans and logs)

**Errors**
- `409` — IDP already exists for this store + mentor pair

---

### DELETE /idp/:id
Delete an IDP.

**Access:** ADMIN

**Response 200**
```json
{ "message": "IDP deleted" }
```

---

## IDP Plans

### POST /idp/:id/plans
Add a plan to an IDP.

**Access:** ADMIN, MENTOR (owner of IDP)

**Body**
```json
{
  "phase": "D7",
  "issue": "ไม่มี Costing Sheet",
  "actionPlan": "จัดทำ Costing Sheet เมนูหลัก 5 เมนู",
  "responsible": "เจ้าของร้าน",
  "dueDate": "2026-03-27T00:00:00.000Z"
}
```

**Response 201**
```json
{
  "id": "clplan1",
  "idpId": "clidp1",
  "phase": "D7",
  "issue": "ไม่มี Costing Sheet",
  "actionPlan": "จัดทำ Costing Sheet เมนูหลัก 5 เมนู",
  "responsible": "เจ้าของร้าน",
  "dueDate": "2026-03-27T00:00:00.000Z",
  "progress": 0,
  "status": "PENDING"
}
```

---

### PATCH /idp/:id/plans/:planId
Update a plan (progress, status, action details).

**Access:** ADMIN, MENTOR (owner of IDP), ENTREPRENEUR (own store — progress only)

**Body** (all optional)
```json
{
  "progress": 60,
  "status": "IN_PROGRESS",
  "actionPlan": "ปรับแผนเพิ่มเติม",
  "dueDate": "2026-04-25T00:00:00.000Z"
}
```

**Response 200** — Updated plan object

---

### DELETE /idp/:id/plans/:planId
Delete a plan.

**Access:** ADMIN, MENTOR (owner of IDP)

**Response 200**
```json
{ "message": "Plan deleted" }
```

---

## Mentoring Logs

### POST /idp/:id/logs
Add a mentoring session log.

**Access:** ADMIN, MENTOR (owner of IDP)

**Body**
```json
{
  "date": "2026-03-22T10:00:00.000Z",
  "note": "ลงพื้นที่ดูครัว พบว่ามีการแยกวัตถุดิบดีขึ้น",
  "outcome": "ตกลงจัดทำ Costing Sheet ภายใน 7 วัน"
}
```

**Response 201** — Created log object

---

### PATCH /idp/:id/logs/:logId
Update a mentoring log.

**Access:** ADMIN, MENTOR (owner)

**Body** (all optional)
```json
{
  "note": "แก้ไขรายละเอียดการลงพื้นที่",
  "outcome": "ปรับ outcome"
}
```

**Response 200** — Updated log object

---

### DELETE /idp/:id/logs/:logId
Delete a mentoring log.

**Access:** ADMIN, MENTOR (owner)

**Response 200**
```json
{ "message": "Log deleted" }
```
