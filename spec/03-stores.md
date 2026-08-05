# Stores Module — `/api/v1/stores` (+ `/provinces`, `/store-types`)

> All responses are wrapped in the standard `{ success, data }` envelope per [00-overview.md](00-overview.md) — the payloads below are the `data` part only.

---

## Access Summary

Every route needs a valid access token; there is no `@Public()` route in this module.

| Action | SUPER_ADMIN / ADMIN | ASSESSOR / MENTOR | ENTREPRENEUR | JUDGE / ME_TEAM | VIEWER |
|---|---|---|---|---|---|
| List stores | ✓ all | ✓ assigned only | ✓ owned only | ✓ all | ✓ all, public fields |
| Get store detail | ✓ any | ✓ assigned only | ✓ owned only | ✓ any | ✓ any, public fields |
| Get stats | ✓ | 403 | ✓ | 403 | 403 |
| Create store | ✓ (any owner) | 403 | ✓ (self as owner) | 403 | 403 |
| Update / delete / uploads | ✓ any | 403 | ✓ own only | 403 | 403 |
| Update status | ✓ | 403 | 403 | 403 | 403 |

Two different checks are at work:

- **`assertVisible`** (reads) is the single-store mirror of `resolveStoreScope()`. An ENTREPRENEUR 403s on a store it doesn't own; an ASSESSOR or MENTOR 403s on a store outside its assignment list. A narrowed role cannot reach a hidden store by guessing its id — and because assessments, reports and analytics all resolve through `StoreService.findAccessible()`, the same 403 follows it into those modules.
- **`assertCanManage`** (writes) allows admin roles and the owning ENTREPRENEUR, nobody else.

`Store.ownerId` (nullable FK) is set at creation and is **not** editable through `PATCH /stores/:id` (`UpdateStoreDto` omits it). A SUPER_ADMIN moves ownership with `PATCH /users/:id/owned-stores`.

`province` and `storeType` are validated against lookup tables — `400 STORE_003` / `400 STORE_009` for a value not in them.

---

## Store Response Shape (`StoreResult`)

```json
{
  "id": "clstore1",
  "code": "RAP69-001",
  "name": "ร้านอาหารสุขใจ",
  "province": "ชลบุรี",
  "storeType": "อาหารไทย",
  "ownerName": "สมชาย ใจดี",
  "phone": "0812345678",
  "email": "somchai@example.com",
  "address": "123 ถ.สุขุมวิท ต.บางปลาสร้อย อ.เมือง จ.ชลบุรี",
  "socialLinks": { "facebook": "https://facebook.com/sukjai" },
  "avgRevenueMin": 15000,
  "avgRevenueMax": 25000,
  "mainProblems": ["ต้นทุนสูง", "ไม่มีระบบบัญชี"],
  "goals": ["เพิ่มยอดขาย 30% ภายใน 3 เดือน"],
  "menuPhotos": ["/uploads/stores/clstore1/menu-photos/xxx.jpg"],
  "coverUrl": "/uploads/stores/clstore1/cover/yyy.jpg",
  "storePhotos": ["/uploads/stores/clstore1/store-photos/zzz.jpg"],
  "documents": [
    {
      "id": "cldoc1",
      "filename": "งบการเงิน.xlsx",
      "fileType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "fileSize": 51200,
      "url": "/uploads/stores/clstore1/documents/xxx.xlsx",
      "uploadedAt": "2026-06-01T09:00:00.000Z"
    }
  ],
  "status": "T0_COMPLETED",
  "ownerId": null,
  "latestScore": 48.2,
  "latestAssessorName": "สมหญิง ประเมินดี",
  "latestAssessedAt": "2026-06-01T09:00:00.000Z",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

- `code` — the project-wide identifier printed on every offline form and Excel export (`RAP69-001…`). Unique, required on create; the cuid `id` exists nowhere outside this database.
- `province`, `storeType`, `ownerName`, `phone`, `email`, `address` are **nullable in the schema** — stores imported from the intake workbook arrive without them. Aggregates substitute `"ไม่ระบุ"` rather than emitting null.
- `mainProblems`/`goals` — arrays of strings.
- `latestScore`/`latestAssessorName`/`latestAssessedAt` — from the store's most recent `SUBMITTED`/`APPROVED` assessment of any round; all `null` if none.
- `documents` — populated on `GET /stores/:id` only; **always `[]` in the `GET /stores` list**.
- File urls are relative paths served from local disk.

### `PublicStoreResult` — what a VIEWER gets

On both `GET /stores` and `GET /stores/:id`, a `VIEWER` receives a narrowed object:

```
id, ownerId, code, name, province, storeType,
socialLinks, goals, menuPhotos, coverUrl, storePhotos, status
```

Contact details, revenue, `mainProblems`, `documents`, `latestScore` and every timestamp are **absent, not blanked** — a client that indexes into them without a guard throws. The object is rebuilt field by field, so anything added to `StoreResult` later is private until it is named there too.

`StoreStatus`: `REGISTERED`, `T0_COMPLETED`, `CAMP_COMPLETED`, `T1_COMPLETED`, `PITCHING_COMPLETED`, `SELECTED`, `CONDITIONAL_SELECTED`, `WAITING_LIST`, `NOT_SELECTED`, `FIELD_AUDITED`, `IDP_CREATED`, `COMPLETED`.

---

## Lookups

### GET /provinces
The provinces THAI-RAP covers — **8 rows**, not all 77 of Thailand: จันทบุรี, ฉะเชิงเทรา, ชลบุรี, ตราด, ปราจีนบุรี, ระยอง, สระแก้ว, นครนายก. Seeded by `prisma/seed.ts`, which throws if the count is not 8.

**Access:** Any valid access token

**Response 200**
```json
[{ "id": 1, "nameTh": "จันทบุรี" }]
```
Thai name only — the model has no `nameEn` or region column.

### GET /store-types
The ประเภทร้าน options a store may be filed under — 6 rows: อาหารไทย, อาหารทะเล, คาเฟ่, เดลิเวอรี, Catering, อื่น ๆ.

**Access:** Any valid access token

**Response 200**
```json
[{ "id": 1, "nameTh": "อาหารไทย" }]
```

Both tables are the validation source for `POST`/`PATCH /stores`.

---

## Endpoints

### GET /stores
Paginated list, `createdAt desc`, narrowed per the access table above.

**Query Params**
| Param | Type | Description |
|---|---|---|
| `page` | number | Default 1 |
| `limit` | number | Default 10, max 100 |
| `search` | string | `name` or `ownerName` contains |
| `province` | string | Exact match |
| `storeType` | string | Exact match |
| `status` | StoreStatus enum | Exact match |

`hasRedFlag`, `zone`, `round` and `sortBy`/`sortOrder` do not exist on `QueryStoreDto`.

**Response 200** — `{ items: StoreResult[], meta }` (`documents` always `[]`). A narrowed role with nothing in scope gets `items: []`, not an error.

---

### GET /stores/:id
Single store **with `documents` populated**.

**Errors**
- `403 PERM_001` — ENTREPRENEUR that doesn't own it, or ASSESSOR/MENTOR it isn't assigned to
- `404 STORE_001` — Store not found

---

### GET /stores/stats
Programme-wide aggregate. Not narrowed by caller — it is a count of the whole programme, not of what the caller reaches. No query params.

**Access:** ADMIN roles and ENTREPRENEUR only (mirrors who may open the web `/stores` page). Everyone else gets `403 PERM_001`.

**Response 200**
```json
{
  "total": 120,
  "targetTotal": 400,
  "t0CompletedCount": 95,
  "t1CompletedCount": 40,
  "t2CompletedCount": 12,
  "t3CompletedCount": 3,
  "storeTypes": ["Catering", "คาเฟ่", "อาหารทะเล", "อาหารไทย"]
}
```
- `targetTotal` — the fixed `STORE_TARGET_TOTAL` constant (400), not derived from data.
- `tNCompletedCount` — distinct stores with a `SUBMITTED`/`APPROVED` assessment in that round.
- `storeTypes` — distinct `Store.storeType` values in use, for filter dropdowns.

There is **no** `byProvince` and no `passedCount` here — province distribution lives at `GET /dashboard/province-distribution`, and selected-store counts at `GET /dashboard/kpis`.

---

### POST /stores

**Access:** ADMIN roles, ENTREPRENEUR

**Body**
```json
{
  "code": "RAP69-001",
  "name": "ร้านส้มตำป้าแดง",
  "province": "ชลบุรี",
  "storeType": "อาหารไทย",
  "ownerName": "สมศรี ใจดี",
  "phone": "0812345678",
  "email": "somsri@example.com",
  "address": "123 หมู่ 4 ต.บางพระ อ.ศรีราชา จ.ชลบุรี",
  "socialLinks": { "facebook": "https://facebook.com/somrestaurant" },
  "avgRevenueMin": 15000,
  "avgRevenueMax": 25000,
  "mainProblems": ["ยอดขายไม่แน่นอน", "ต้นทุนสูง"],
  "goals": ["เพิ่มยอดขาย 20% ใน 6 เดือน"],
  "ownerId": "cluser2"
}
```
Required: `code` (≤50), `name` (≤200), `province`, `storeType`, `ownerName` (≤200), `phone` (≤20), `address`. The rest optional. `status` defaults to `REGISTERED` and cannot be set here; photos and documents are uploaded after creation.

`ownerId`: **ENTREPRENEUR** → always the caller's own id, any body value ignored. **ADMIN** → used as-is, and must reference an existing ENTREPRENEUR.

**Response 201** — `StoreResult` (`documents: []`)

**Errors**
- `403 PERM_001` — Caller is not an admin role or an ENTREPRENEUR
- `409 STORE_008` — `code` already used
- `400 STORE_003` — `province` not in `GET /provinces`
- `400 STORE_009` — `storeType` not in `GET /store-types`
- `400 STORE_007` — `avgRevenueMax` < `avgRevenueMin`
- `400 STORE_005` — `ownerId` is not an existing ENTREPRENEUR
- `422 VALID_002` — Validation failure

---

### PATCH /stores/:id
Any subset of the `POST` body **except `ownerId`** — `code` included, re-checked for uniqueness when it changes. `status` is not settable here; photos and documents are not either.

**Access:** admin roles (any store); ENTREPRENEUR (own store only)

**Response 200** — Updated `StoreResult`

**Errors** — `403 PERM_001`, `404 STORE_001`, plus the same `STORE_003` / `STORE_007` / `STORE_008` / `STORE_009` checks as create (the revenue range is validated against the merged values, so sending only `avgRevenueMin` can still trip `STORE_007`).

---

### PATCH /stores/:id/status
**Admin roles only.** The role check runs before the existence check, so a non-admin gets 403 even for a nonexistent id.

**Body** `{ "status": "SELECTED" }`

**Response 200** — Full updated `StoreResult`

**Errors** — `403 PERM_001`, `404 STORE_001`, `422 VALID_002`

---

### DELETE /stores/:id
Only for a store nothing depends on — neither `Assessment` nor `StoreDocument` cascades.

**Access:** admin roles (any store); ENTREPRENEUR (own store only)

**Response 200** — `{ "success": true, "data": null }`

The store's whole upload directory (`/uploads/stores/:id`) is removed with it.

**Errors**
- `403 PERM_001` — Not an admin role and not the owner
- `409 STORE_010` — The store has assessments, or still has attached documents (delete those first)
- `404 STORE_001` — Store not found

---

## File Uploads

All upload/delete routes share `assertCanManage` (admin roles any store, owning ENTREPRENEUR own store — `403 PERM_001` otherwise) and `404 STORE_001` for a missing store. Uploads are `multipart/form-data` with a single `file` field, written under `/uploads/stores/:id/...`; original Thai filenames are preserved in metadata. Max 10 MB.

**File errors (all endpoints):** `400 FILE_001` type not allowed, `400 FILE_002` over 10 MB. Both are `BadRequestException` — 400, never 413/422.

| Endpoint | Allowed types | Returns |
|---|---|---|
| `POST /stores/:id/documents` | pdf, xlsx, docx, csv (**no images**) | 201, the created document object |
| `DELETE /stores/:id/documents/:documentId` | — | 200, `null`. `404 STORE_004` if the document doesn't exist or belongs to another store |
| `POST /stores/:id/menu-photos` | jpeg, png, webp | 201, the full updated `menuPhotos` array |
| `DELETE /stores/:id/menu-photos` | body `{ "url": "/uploads/..." }` | 200, the updated array. `404 STORE_006` if the url is not in this store's list |
| `POST /stores/:id/cover` | jpeg, png, webp | 201, the new `coverUrl` string. Replaces and deletes any existing cover |
| `DELETE /stores/:id/cover` | — | 200, `null` |
| `POST /stores/:id/store-photos` | jpeg, png, webp | 201, the full updated `storePhotos` array |
| `DELETE /stores/:id/store-photos` | body `{ "url": "/uploads/..." }` | 200, the updated array. `404 STORE_006` on an unknown url |

Deleting a photo is gated on the url actually being in that store's array — otherwise one store's manager could delete another store's files.
