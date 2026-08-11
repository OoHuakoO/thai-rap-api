# Activities Module — `/api/v1/activities`

ประมวลภาพกิจกรรม — the photo albums of what the programme ran: camps,
workshops, site visits, pitching days. One album per activity, each carrying its
own photos.

```
GET    /activities
GET    /activities/:id
POST   /activities
PATCH  /activities/:id
DELETE /activities/:id
POST   /activities/:id/photos
PATCH  /activities/:id/photos/:photoId
DELETE /activities/:id/photos/:photoId
```

## Access

**Reads answer every signed-in role** — there is no allow-list and no per-record
scope. This is the widest read in the project, wider than `/news`: a JUDGE and a
VIEWER both open it. The album carries no store's data and no committee
material, only a record of what the programme did.

**Writes are ADMIN / SUPER_ADMIN only** (`isAdminRole`, `403 PERM_001`
otherwise) — that covers the album and its photos.

There is no draft state. An album exists, and is visible, from the moment an
admin saves it.

---

## `Activity`

```json
{
  "id": "clact1",
  "title": "ค่ายอบรมผู้ประกอบการ รุ่นที่ 1",
  "description": "อบรมเข้มข้น 3 วัน ด้านการเงินและการตลาดสำหรับร้านอาหาร",
  "note": "ผู้เข้าร่วม 48 ร้าน จาก 12 จังหวัด",
  "activityDate": "2026-06-14T00:00:00.000Z",
  "location": "โรงแรมเซ็นทรา ศูนย์ราชการ กรุงเทพฯ",
  "photoCount": 12,
  "photos": [
    {
      "id": "clphoto1",
      "url": "/uploads/activities/clact1/photos/9f2c….jpg",
      "sortOrder": 0,
      "uploadedAt": "2026-06-15T04:12:00.000Z"
    }
  ],
  "createdById": "cluser1",
  "createdByName": "Admin User",
  "createdAt": "2026-06-15T04:10:00.000Z",
  "updatedAt": "2026-06-15T04:10:00.000Z"
}
```

`note` (หมายเหตุ) and `location` are nullable. `photos` is ordered
`sortOrder asc, uploadedAt asc` and carries no caption — a photo is the image
and its position, nothing else.

**`photos` is truncated on the list route and complete on the detail route** —
`GET /activities` sends the first 4 as a thumbnail strip
(`ACTIVITY_LIST_PHOTO_PREVIEW`), `GET /activities/:id` sends every one.
`photoCount` is the album's real total on both, so a client showing "n ภาพ"
must read that field, never `photos.length`.

---

### GET /activities
Paginated. Ordered `activityDate desc, createdAt desc`.

**Query Params**
| Param | Type | Default | Description |
|---|---|---|---|
| `search` | string | — | Matches `title` or `location` (contains) |
| `page` | number | 1 | `PaginationDto` |
| `limit` | number | 10 | Max 100 |

**Response 200** — `{ items: Activity[], meta: PaginationMeta }`

---

### GET /activities/:id
The whole album, every photo.

**Response 200** — `Activity`

**Errors** — `404 ACT_001`

---

### POST /activities
**Access:** ADMIN / SUPER_ADMIN

```json
{
  "title": "ค่ายอบรมผู้ประกอบการ รุ่นที่ 1",
  "description": "อบรมเข้มข้น 3 วัน ด้านการเงินและการตลาดสำหรับร้านอาหาร",
  "activityDate": "2026-06-14T00:00:00.000Z",
  "location": "โรงแรมเซ็นทรา ศูนย์ราชการ กรุงเทพฯ",
  "note": "ผู้เข้าร่วม 48 ร้าน จาก 12 จังหวัด"
}
```

`title` 1–200 chars, `description` 1–5000, `note` ≤ 2000, `location` ≤ 200.
`activityDate` is required ISO 8601. `createdById` comes from the JWT, never
from the body.

An album is created empty — photos are a separate call, so a create followed by
an upload is two requests.

**Response 201** — `Activity`

**Errors** — `403 PERM_001`, `422 VALID_002`

---

### PATCH /activities/:id
**Access:** ADMIN / SUPER_ADMIN

**Body** — any subset of the `POST` body. Omitted fields are left alone;
`createdById` never changes, so an edit by a second admin keeps the original
author.

**Response 200** — `Activity`

**Errors** — `403 PERM_001`, `404 ACT_001`, `422 VALID_002`

---

### DELETE /activities/:id
**Access:** ADMIN / SUPER_ADMIN

Deletes the album, its photo rows (schema `onDelete: Cascade`) and the files
behind them — `uploads/activities/<id>` is removed as a directory, and any photo
whose url points outside it is unlinked individually.

**Response 200** — `{ "success": true, "data": null }`

**Errors** — `403 PERM_001`, `404 ACT_001`

---

### POST /activities/:id/photos
**Access:** ADMIN / SUPER_ADMIN

`multipart/form-data`, repeated part **`files`** — note the plural: this is the
only upload route in the project that takes a batch, and a client sending
`file` uploads nothing. Max 20 per request (`FilesInterceptor`); each file is
capped at `FILE_MAX_SIZE_BYTES` (10 MB) and must match `PHOTO_MIME_REGEX`
(jpeg / png / webp) with a matching extension.

Uploads are appended after the photos already in the album — `sortOrder`
continues from the highest one stored.

**Response 201** — the whole `Activity`, photos included, so the caller does not
have to re-read it.

**Errors** — `400 FILE_001` (type), `400 FILE_002` (too large), `403 PERM_001`,
`404 ACT_001`

---

### PATCH /activities/:id/photos/:photoId
**Access:** ADMIN / SUPER_ADMIN

```json
{ "sortOrder": 0 }
```

`sortOrder` is the only writable field, and it is optional. A `photoId`
belonging to a different album is a `404 ACT_002`, not someone else's photo.

**No web caller today** — the app uploads in order and never reorders, so this
route exists for the capability, not for a screen.

**Response 200** — the single `ActivityPhoto`

**Errors** — `403 PERM_001`, `404 ACT_001`, `404 ACT_002`, `422 VALID_002`

---

### DELETE /activities/:id/photos/:photoId
**Access:** ADMIN / SUPER_ADMIN

Removes the row and the stored file.

**Response 200** — `{ "success": true, "data": null }`

**Errors** — `403 PERM_001`, `404 ACT_001`, `404 ACT_002`
