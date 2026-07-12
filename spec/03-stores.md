# Stores Module — `/api/v1/stores`

> Note: all list responses are wrapped in the standard `{ success, data: { items, meta } }` envelope per `00-overview.md` — the bare `{ items, meta }` shown in this file's examples is just the `data` payload. Implementation/progress status lives in `../plan/progress.md`, not here.

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

`Store.ownerId` (nullable FK to `User`) tracks which `ENTREPRENEUR` owns a store; stores created by ADMIN without an explicit `ownerId` have none. Scoping rules:
- **ENTREPRENEUR**: `GET /stores` only returns stores where `ownerId` matches their own user id; `GET /stores/:id` on a store they don't own returns `403 PERM_001` (existence isn't hidden — same pattern as `STORE_001` elsewhere); `POST /stores` always sets `ownerId` to themselves (any `ownerId` in the request body is ignored); `PATCH`/`DELETE` are allowed only on their own store, `403 PERM_001` otherwise.
- **ADMIN**: unrestricted on every action above — sees, creates, updates, and deletes any store, and may optionally pass `ownerId` on `POST /stores` to assign the new store to a specific entrepreneur.
- **ASSESSOR / MENTOR / JUDGE / ME_TEAM**: unchanged from before — read-only, no scoping, see every store; no write access.

`ownerId` is set only at creation time and is **not** editable via `PATCH /stores/:id` (omitted from `UpdateStoreDto`) — reassigning a store's owner requires a future dedicated endpoint.

Assessor-assignment scoping (an `ASSESSOR` seeing only stores assigned to them) described in earlier drafts is still not implemented — no assignment relation is enforced in queries for that role.

Photo upload/delete endpoints are **not implemented** — the `Store.photos` JSON column exists in the schema but nothing ever writes to it (`CreateStoreDto`/`UpdateStoreDto` don't accept a `photos` field), so it is always `[]` in practice.

`province` is validated against a fixed lookup table (see `GET /provinces` below) — it is no longer free text. `POST /stores` and `PATCH /stores/:id` reject any `province` value not present in that table with `400 STORE_003`.

---

## Endpoints

### GET /provinces
List all 77 Thai provinces (76 provinces + Bangkok), seeded once via `prisma/seed.ts` — not fetched from any external API at runtime. Intended for populating the store create/edit province dropdown and search filter client-side.

**Access:** Any valid access token

**Response 200**
```json
[
  { "id": 1, "nameTh": "กระบี่" },
  { "id": 2, "nameTh": "กรุงเทพมหานคร" }
]
```
Sorted by `nameTh` ascending. There is no `nameEn`/region field — Thai name only, per current scope.

### GET /stores
List stores with pagination and filtering. `ENTREPRENEUR` callers only ever see stores where `ownerId` equals their own user id; every other role sees all stores (see Access Summary above).

**Query Params**
| Param | Type | Description |
|---|---|---|
| `page` | number | Page number |
| `limit` | number | Items per page (default 10, max 100) |
| `search` | string | Search by store name or owner name (`name`/`ownerName` contains) |
| `province` | string | Filter by exact province match |
| `storeType` | string | Filter by exact store type match |
| `status` | StoreStatus enum | Filter by status |

`hasRedFlag`, `zone`, and `round` filters described in earlier drafts do not exist on `QueryStoreDto` — score/red-flag data isn't joined into the store list at all (see response shape note below).

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
      "email": "somchai@example.com",
      "address": "123 ถ.สุขุมวิท ต.บางปลาสร้อย อ.เมือง จ.ชลบุรี",
      "socialLinks": { "facebook": "https://facebook.com/sukjai" },
      "avgRevenue": 45000,
      "mainProblems": "ต้นทุนสูง ไม่มีระบบบัญชี",
      "goals": "เพิ่มยอดขาย 30% ภายใน 3 เดือน",
      "photos": [],
      "status": "T0_COMPLETED",
      "ownerId": null,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 50, "page": 1, "limit": 10, "totalPages": 5 }
}
```
This is the raw `Store` row returned as-is (`store.repository.ts` `findAll` has no `select`/`include`) — sorted by `createdAt desc`, no `sortBy`/`sortOrder` support. There are **no computed fields**: `latestScore`, `zone`, `hasRedFlag`, `redFlagCount` described in earlier drafts are never populated. Every field on the `Store` model is returned (no field is dropped), including a `photos` array which is always `[]`, and `ownerId` which is `null` for stores with no linked entrepreneur.

---

### GET /stores/:id
Get a single store by id. Returns the exact same flat `Store` shape as the list endpoint above — there is no dimension-score, assessment-summary, red-flag, or assigned-assessor data joined in. `ENTREPRENEUR` callers get `403 PERM_001` if the store's `ownerId` isn't their own user id; every other role can fetch any store.

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
  "photos": [],
  "status": "T0_COMPLETED",
  "ownerId": "cluser2",
  "createdAt": "2026-01-15T00:00:00.000Z",
  "updatedAt": "2026-02-01T00:00:00.000Z"
}
```

**Errors**
- `403 PERM_001` — Caller is an ENTREPRENEUR who doesn't own this store
- `404 STORE_001` — Store not found

---

### GET /stores/stats
Aggregate dashboard stats. Not tied to any specific store; no query params.

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
  ]
}
```
- `targetTotal` — fixed constant (`STORE_TARGET_TOTAL`), not derived from data.
- `t0CompletedCount`/`t1CompletedCount` — count of `Assessment` rows for that round with status `SUBMITTED` or `APPROVED` (assessment count, not distinct-store count — since `(storeId, round)` is unique this is equivalent in practice).
- `passedCount` — stores with status `SELECTED` or `CONDITIONAL_SELECTED`.
- `byProvince` — all stores grouped by `province`, sorted by count descending, `pct` rounded to 1 decimal.

---

### POST /stores
Create a new store.

**Access:** ADMIN, ENTREPRENEUR (`403 PERM_001` for ASSESSOR/MENTOR/JUDGE/ME_TEAM)

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
  "goals": "เพิ่มยอดขาย 30%",
  "ownerId": "cluser2"
}
```
`name`, `province`, `storeType`, `ownerName`, `phone`, `address` are required; `email`, `socialLinks`, `avgRevenue`, `mainProblems`, `goals`, `ownerId` are optional. `status` defaults to `REGISTERED` and cannot be set on create.

`ownerId` behavior depends on caller role:
- **ENTREPRENEUR**: the created store's `ownerId` is always the caller's own user id — any `ownerId` sent in the body is silently ignored.
- **ADMIN**: `ownerId` is used as-is if provided (to pre-assign the store to an entrepreneur), otherwise the store is created with `ownerId: null`.

Note `ownerName` (free-text name of the store's owner) is unrelated to `ownerId` (the linked `User` account) — both can be set independently.

**Response 201** — Full store object (same flat shape as `GET /stores/:id`)

**Errors**
- `403 PERM_001` — Caller is ASSESSOR/MENTOR/JUDGE/ME_TEAM
- `400 STORE_003` — `province` is not in the `GET /provinces` lookup table
- `422 VALID_001` — Validation failure

---

### PATCH /stores/:id
Update store information. Accepts any subset of the `POST /stores` body fields except `ownerId` (`PartialType(OmitType(CreateStoreDto, ['ownerId']))`) — `status` is not settable here (use `PATCH /stores/:id/status`), and ownership isn't reassignable here either.

**Access:** ADMIN (any store); ENTREPRENEUR (own store only — `403 PERM_001` on any store they don't own).

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

**Errors**
- `403 PERM_001` — Not ADMIN and not the owning ENTREPRENEUR
- `400 STORE_003` — `province` (if sent) is not in the `GET /provinces` lookup table
- `404 STORE_001` — Store not found

---

### PATCH /stores/:id/status
Update store status.

**Access:** ADMIN only

**Body**
```json
{
  "status": "SELECTED"
}
```

**Response 200** — Full updated store object (flat `Store` shape, not just `{ id, status, updatedAt }`)

**Errors**
- `403 PERM_001` — Not ADMIN
- `404 STORE_001` — Store not found
- `422 VALID_001` — `status` is not a valid `StoreStatus`

---

### DELETE /stores/:id
Delete store (relations cascade per Prisma schema).

**Access:** ADMIN (any store); ENTREPRENEUR (own store only)

**Response 200**
```json
{ "success": true, "data": null }
```

**Errors**
- `403 PERM_001` — Not ADMIN and not the owning ENTREPRENEUR
- `404 STORE_001` — Store not found
