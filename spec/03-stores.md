# Stores Module — `/api/v1/stores` (+ `/api/v1/provinces`)

> Note: all responses are wrapped in the standard `{ success, data }` envelope per `00-overview.md` — the payloads shown here are the `data` part only.

---

## Access Summary

All routes require a valid access token (`Authorization: Bearer`) — there is no `@Public()` route in this module.

| Action | ADMIN | ASSESSOR | MENTOR | ENTREPRENEUR | JUDGE | ME_TEAM |
|---|---|---|---|---|---|---|
| List stores | ✓ (all) | ✓ (all) | ✓ (all) | own only | ✓ (all) | ✓ (all) |
| Get store detail | ✓ (any) | ✓ (any) | ✓ (any) | own only | ✓ (any) | ✓ (any) |
| Get stats | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create store | ✓ (any owner) | — | — | ✓ (self as owner) | — | — |
| Update store | ✓ (any) | — | — | own only | — | — |
| Delete store | ✓ (any) | — | — | own only | — | — |
| Update status | ✓ | — | — | — | — | — |
| Upload/delete documents & photos | ✓ (any) | — | — | own only | — | — |

`Store.ownerId` (nullable FK to `User`) tracks which `ENTREPRENEUR` owns a store. Scoping (`assertCanManage` in `store.service.ts`):
- **ENTREPRENEUR**: `GET /stores` only returns stores where `ownerId` matches their own user id; `GET /stores/:id` on a store they don't own returns `403 PERM_001`; `POST /stores` always sets `ownerId` to themselves (any `ownerId` in the body is ignored); update/delete/uploads allowed only on their own store.
- **ADMIN**: unrestricted on every action; may pass `ownerId` on `POST /stores` to pre-assign the store to an entrepreneur.
- **ASSESSOR / MENTOR / JUDGE / ME_TEAM**: read-only, no scoping, see every store; no write access.

`ownerId` is set only at creation time and is **not** editable via `PATCH /stores/:id` (`UpdateStoreDto = PartialType(OmitType(CreateStoreDto, ['ownerId']))`).

Assessor-assignment scoping (an `ASSESSOR` seeing only stores assigned to them) is still not implemented — the `assignedUsers` relation exists in the schema but is not enforced in any query.

`province` is validated against a fixed lookup table (see `GET /provinces`) — `POST` and `PATCH` reject any value not in it with `400 STORE_003`.

---

## Store Response Shape (`StoreResult`)

All store endpoints return this mapped shape (not the raw Prisma row):

```json
{
  "id": "clstore1",
  "name": "ร้านอาหารสุขใจ",
  "province": "ชลบุรี",
  "storeType": "อาหารตามสั่ง",
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

- `avgRevenueMin`/`avgRevenueMax` — revenue range (the single `avgRevenue` field from earlier drafts no longer exists). Both nullable.
- `mainProblems`/`goals` — arrays of strings (not free-text strings).
- `latestScore`/`latestAssessorName`/`latestAssessedAt` — from the store's most recent `SUBMITTED`/`APPROVED` assessment (any round); all `null` if none.
- `documents` — populated on `GET /stores/:id` only; **always `[]` in the `GET /stores` list**.
- File URLs are relative paths served from local disk (`/uploads/...`).

---

## Endpoints

### GET /provinces
List all 77 Thai provinces (76 provinces + Bangkok), seeded via `prisma/seed.ts`. For the store create/edit province dropdown.

**Access:** Any valid access token

**Response 200**
```json
[
  { "id": 1, "nameTh": "กระบี่" },
  { "id": 2, "nameTh": "กรุงเทพมหานคร" }
]
```
Sorted by `nameTh` ascending. Thai name only — no `nameEn`/region field.

---

### GET /stores
List stores with pagination and filtering. `ENTREPRENEUR` callers only see their own stores.

**Query Params**
| Param | Type | Description |
|---|---|---|
| `page` | number | Page number (default 1) |
| `limit` | number | Items per page (default 10, max 100) |
| `search` | string | `name`/`ownerName` contains |
| `province` | string | Exact match |
| `storeType` | string | Exact match |
| `status` | StoreStatus enum | Exact match |

`hasRedFlag`, `zone`, and `round` filters do not exist on `QueryStoreDto`.

**Response 200** — `{ items: StoreResult[], meta }` (see shape above; `documents` is always `[]` here). Sorted `createdAt desc`; no `sortBy`/`sortOrder` support.

---

### GET /stores/:id
Single store as `StoreResult` **with `documents` populated**. `ENTREPRENEUR` callers get `403 PERM_001` on a store they don't own.

**Errors**
- `403 PERM_001` — ENTREPRENEUR who doesn't own this store
- `404 STORE_001` — Store not found

---

### GET /stores/stats
Aggregate dashboard stats. No query params.

**Response 200**
```json
{
  "total": 120,
  "targetTotal": 150,
  "t0CompletedCount": 95,
  "t1CompletedCount": 40,
  "passedCount": 30,
  "byProvince": [
    { "province": "ชลบุรี", "count": 40, "pct": 33.3 }
  ],
  "storeTypes": ["อาหารตามสั่ง", "ก๋วยเตี๋ยว"]
}
```
- `targetTotal` — fixed constant (`STORE_TARGET_TOTAL`), not derived from data.
- `t0CompletedCount`/`t1CompletedCount` — count of distinct stores with a `SUBMITTED`/`APPROVED` assessment for that round (`(storeId, round)` is unique, so an assessment count equals a store count).
- `passedCount` — stores with status `SELECTED` or `CONDITIONAL_SELECTED`.
- `byProvince` — grouped by `province`, sorted by count desc, `pct` rounded to 1 decimal.
- `storeTypes` — distinct `storeType` values, sorted asc (for filter dropdowns).

---

### POST /stores
Create a new store.

**Access:** ADMIN, ENTREPRENEUR (`403 PERM_001` for ASSESSOR/MENTOR/JUDGE/ME_TEAM)

**Body**
```json
{
  "name": "ร้านส้มตำป้าแดง",
  "province": "ชลบุรี",
  "storeType": "อาหารตามสั่ง",
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
`name`, `province`, `storeType`, `ownerName`, `phone`, `address` are required; the rest optional. `status` defaults to `REGISTERED` and cannot be set on create. Photos/documents cannot be set here — use the upload endpoints after creation.

`ownerId` behavior: **ENTREPRENEUR** → always the caller's own id (body value ignored); **ADMIN** → used as-is if provided, else `null`.

**Response 201** — `StoreResult`

**Errors**
- `403 PERM_001` — Caller is ASSESSOR/MENTOR/JUDGE/ME_TEAM
- `400 STORE_003` — `province` not in the lookup table
- `422 VALID_002` — Validation failure

---

### PATCH /stores/:id
Update store info. Accepts any subset of the `POST /stores` body except `ownerId`. `status` is not settable here (use `PATCH /stores/:id/status`); photos/documents are not settable here either.

**Access:** ADMIN (any store); ENTREPRENEUR (own store only)

**Response 200** — Updated `StoreResult`

**Errors**
- `403 PERM_001` — Not ADMIN and not the owning ENTREPRENEUR
- `400 STORE_003` — `province` (if sent) not in the lookup table
- `404 STORE_001` — Store not found

---

### PATCH /stores/:id/status
Update store status. **ADMIN only** — the role check runs before the existence check, so a non-admin gets `403` even for a nonexistent store id.

**Body**
```json
{ "status": "SELECTED" }
```

**Response 200** — Full updated `StoreResult`

**Errors**
- `403 PERM_001` — Not ADMIN
- `404 STORE_001` — Store not found
- `422 VALID_002` — Invalid `StoreStatus`

---

### DELETE /stores/:id
Delete store (relations cascade per Prisma schema).

**Access:** ADMIN (any store); ENTREPRENEUR (own store only)

**Response 200** — `{ "success": true, "data": null }`

**Errors**
- `403 PERM_001` — Not ADMIN and not the owning ENTREPRENEUR
- `404 STORE_001` — Store not found

---

## File Uploads

All upload/delete endpoints below share the same access rule as update/delete (ADMIN any store, ENTREPRENEUR own store only — `403 PERM_001` otherwise) and `404 STORE_001` if the store doesn't exist. Uploads are `multipart/form-data` with a single `file` field, stored on local disk under `/uploads/stores/:id/...`; original (Thai) filenames are preserved in metadata. Max size 10 MB (`FILE_MAX_SIZE_BYTES`).

**File errors (all endpoints):**
- `400 FILE_001` — File type not allowed
- `400 FILE_002` — File exceeds 10 MB

Both are `BadRequestException` (HTTP 400) — not 413/422.

| Endpoint | Allowed types | Returns |
|---|---|---|
| `POST /stores/:id/documents` | pdf, xlsx, docx, csv (`STORE_DOCUMENT_MIME_REGEX` — **no images**) | 201, the created document object (same shape as `documents[]` entries) |
| `DELETE /stores/:id/documents/:documentId` | — | 200, `null`. `404 STORE_004` if the document doesn't exist or belongs to another store. Removes DB row and disk file |
| `POST /stores/:id/menu-photos` | jpeg, png, webp (`PHOTO_MIME_REGEX`) | 201, the full updated `menuPhotos` string array |
| `DELETE /stores/:id/menu-photos` | body `{ "url": "/uploads/..." }` | 200, the updated `menuPhotos` array. Deleting a url not in the array is a silent no-op |
| `POST /stores/:id/cover` | jpeg, png, webp | 201, the new `coverUrl` string. Replaces (and deletes) any existing cover |
| `DELETE /stores/:id/cover` | — | 200, `null` |
| `POST /stores/:id/store-photos` | jpeg, png, webp | 201, the full updated `storePhotos` string array |
| `DELETE /stores/:id/store-photos` | body `{ "url": "/uploads/..." }` | 200, the updated `storePhotos` array |
