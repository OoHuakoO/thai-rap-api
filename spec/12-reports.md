# Reports Module — `/api/v1/reports`

Async report generation. Request a report → system queues it → poll for status → download when ready.

---

## Report Types

| Type | Format | Description |
|---|---|---|
| `restaurant_survival` | PDF | Per-store full diagnosis report |
| `top20_incubation` | PDF + Excel | Top 20 ranking report |
| `program_overview` | PDF + Excel | All 50 stores overview |
| `red_flag_list` | Excel | All unresolved red flags |
| `scores_csv` | Excel/CSV | All raw scores (every question, every store, every round) |
| `portfolio_csv` | Excel/CSV | Portfolio completion data |
| `field_audit` | PDF + Excel | Field audit results per store |
| `idp` | PDF | IDP report per store |
| `okr_report` | PDF + Excel | OKR/KR progress |
| `backup_json` | JSON | Full data backup |

---

## Endpoints

### GET /reports
List generated reports.

**Access:** ADMIN, ME_TEAM (all); others see only reports they requested

**Query Params**
| Param | Type | Description |
|---|---|---|
| `type` | string | Filter by report type |
| `status` | ReportStatus enum | Filter by status |
| `storeId` | string | Filter by store (for per-store reports) |

**Response 200**
```json
{
  "items": [
    {
      "id": "clreport1",
      "name": "Restaurant Survival Report — ร้านอาหารสุขใจ",
      "type": "restaurant_survival",
      "format": "PDF",
      "status": "DONE",
      "fileUrl": "https://cdn.example.com/reports/clreport1.pdf",
      "createdBy": "cluser1",
      "createdAt": "2026-06-05T10:00:00.000Z"
    }
  ],
  "meta": { "total": 8, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### POST /reports/generate
Request a new report (async). Returns report ID immediately; poll status until DONE.

**Access:** ADMIN, ME_TEAM; ENTREPRENEUR (own store reports only)

**Body**
```json
{
  "type": "restaurant_survival",
  "format": "PDF",
  "storeId": "clstore1",
  "province": null,
  "dateFrom": null,
  "dateTo": null
}
```

> **Note:** `storeId` required for per-store reports. For program-wide reports (`top20_incubation`, `program_overview`, etc.) `storeId` is omitted.

**Response 202**
```json
{
  "id": "clreport1",
  "name": "Restaurant Survival Report — ร้านอาหารสุขใจ",
  "type": "restaurant_survival",
  "format": "PDF",
  "status": "PENDING",
  "createdAt": "2026-06-05T10:00:00.000Z"
}
```

---

### GET /reports/:id
Get report status and download URL.

**Response 200**
```json
{
  "id": "clreport1",
  "name": "Restaurant Survival Report — ร้านอาหารสุขใจ",
  "type": "restaurant_survival",
  "format": "PDF",
  "status": "DONE",
  "fileUrl": "https://cdn.example.com/reports/clreport1.pdf",
  "createdBy": "cluser1",
  "createdAt": "2026-06-05T10:00:00.000Z"
}
```

**Report Status Lifecycle:**
```
PENDING → GENERATING → DONE
                     ↘ FAILED
```

---

### GET /reports/:id/download
Redirect to signed download URL (short-lived pre-signed URL).

**Response 302** — Redirect to file URL

**Errors**
- `404` — Report not found
- `400` — Report not yet DONE

---

### DELETE /reports/:id
Delete a report file.

**Access:** ADMIN

**Response 200**
```json
{ "message": "Report deleted" }
```

---

## Restaurant Survival Report Content

When `type = restaurant_survival`, the generated PDF contains:

1. **ข้อมูลพื้นฐานร้าน** — ชื่อ, จังหวัด, ประเภท, เจ้าของ, ช่องทางติดต่อ
2. **คะแนนรวม T0 / T1** — พร้อมระดับ Zone
3. **คะแนนพัฒนา** — delta และ rate
4. **กราฟเปรียบเทียบ 8 มิติ** — T0 vs T1 radar chart
5. **จุดแข็ง 3 อันดับแรก** — dimension + score
6. **จุดอ่อน 3 อันดับแรก** — dimension + score
7. **Red Flag ที่พบ** — ประเภท, ความรุนแรง, คำแนะนำ
8. **คำแนะนำรายมิติ** — จาก Mentor
9. **แผนพัฒนา 7 / 30 / 90 วัน** — IDP plans
10. **สถานะการคัดเลือก** — SELECTED / CONDITIONAL / WAITING / NOT_SELECTED
11. **หลักฐานประกอบ** — Portfolio file links
