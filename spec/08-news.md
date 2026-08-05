# News Module — `/api/v1/news`

ข่าวประชาสัมพันธ์ — the announcements shown on the news page and, unchanged, as the dashboard's activity feed.

```
GET    /news
GET    /news/:id
POST   /news
PATCH  /news/:id
DELETE /news/:id
```

## Access

**Reads answer any signed-in role** — neither takes a user to narrow on, and there is no store to scope by. **Writes are ADMIN / SUPER_ADMIN only** (`403 PERM_001` for everyone else).

`GET /dashboard/activities` maps `NewsService.listForFeed(10)` in-process, so anything published here appears there immediately (`GENERAL` → `announcement`, `EVENT` → `event`, `ALERT` → `warning`).

---

## `NewsItem`

```json
{
  "id": "clnews1",
  "type": "GENERAL",
  "title": "อัปเดตเกณฑ์การประเมินโครงการ ปี 2569",
  "description": "มีผลตั้งแต่วันที่ 18 พ.ค. 2569 เป็นต้นไป",
  "urgent": false,
  "publishedAt": "2026-05-18T00:00:00.000Z",
  "authorId": "cluser1",
  "authorName": "Admin User"
}
```

`NewsType`: `GENERAL` (ประชาสัมพันธ์ทั่วไป) | `EVENT` (กิจกรรม) | `ALERT` (การแจ้งเตือน).

---

### GET /news
A **bare array**, not a paginated envelope. Ordered `urgent desc, publishedAt desc` — urgent items are pinned to the top.

**Query Params**
| Param | Type | Default | Description |
|---|---|---|---|
| `type` | NewsType enum | — | Filter to one category |
| `limit` | number | 20 | Max 100 |

There is no `page` and no `search`.

**Response 200** — `NewsItem[]`

---

### GET /news/:id

**Response 200** — `NewsItem`

**Errors** — `404 NEWS_001`

---

### POST /news
**Access:** ADMIN / SUPER_ADMIN

**Body**
```json
{
  "type": "GENERAL",
  "title": "อัปเดตเกณฑ์การประเมินโครงการ ปี 2569",
  "description": "มีผลตั้งแต่วันที่ 18 พ.ค. 2569 เป็นต้นไป",
  "urgent": false,
  "publishedAt": "2026-05-18T00:00:00.000Z"
}
```
`title` 1–200 chars, `description` 1–2000. `urgent` defaults to `false`; `publishedAt` (ISO 8601) defaults to now — a future date does **not** hide the item, it only sorts it first.

`authorId` is taken from the JWT, never from the body.

**Response 201** — `NewsItem`

**Errors** — `403 PERM_001`, `422 VALID_002`

---

### PATCH /news/:id
**Access:** ADMIN / SUPER_ADMIN

**Body** — any subset of the `POST` body. Omitted fields are left as they are; `authorId` never changes, so an edit by a second admin keeps the original author.

**Response 200** — `NewsItem`

**Errors** — `403 PERM_001`, `404 NEWS_001`, `422 VALID_002`

---

### DELETE /news/:id
**Access:** ADMIN / SUPER_ADMIN

**Response 200** — `{ "success": true, "data": null }`

**Errors** — `403 PERM_001`, `404 NEWS_001`
