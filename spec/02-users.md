# Users Module — `/api/v1/users`

Account administration: approving sign-ups, suspending accounts, and wiring users to stores.

## Access

**SUPER_ADMIN only.** Every route in this module starts with `assertCanManage`, which compares against `Role.SUPER_ADMIN` — not `ADMIN_ROLES`. An `ADMIN` gets `403 PERM_001` here like everyone else: ADMIN runs the programme, SUPER_ADMIN decides who gets into it.

The role check runs **before** the id is looked up, so a non-SUPER_ADMIN gets 403 even for a user id that doesn't exist. `assertNotSelf` also runs before the lookup on suspend / role / delete.

There is **no `POST /users`** — accounts are created only through `POST /auth/register`, and a user keeps the role they registered with unless a SUPER_ADMIN changes it here.

---

## `UserResult`

Every route except `stats` and `DELETE` returns this shape:

```json
{
  "id": "cluser1",
  "name": "นางสาวศิริวรรณ จันทร์ดี",
  "email": "siriwan.j@example.com",
  "role": "ASSESSOR",
  "status": "ACTIVE",
  "assignedStores": [{ "id": "clstore1", "code": "RAP69-001", "name": "ร้านอาหารสุขใจ" }],
  "ownedStores": [],
  "assignedStoreIds": ["clstore1"],
  "ownedStoreIds": [],
  "lastLogin": "2026-06-05T09:00:00.000Z",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-06-05T09:00:00.000Z"
}
```

`assignedStoreIds`/`ownedStoreIds` are derived from the two object arrays — the same data twice, so a client can bind a multi-select without mapping. No `password` field ever leaves the module.

`UserStatus`: `PENDING` | `ACTIVE` | `SUSPENDED`.

---

## Endpoints

### GET /users
Paginated, newest first.

**Query Params**
| Param | Type | Description |
|---|---|---|
| `page` | number | Default 1 |
| `limit` | number | Default 10, max 100 |
| `role` | Role enum | Exact match |
| `status` | UserStatus enum | Exact match |
| `search` | string (≤100) | Matches `name` or `email` |

**Response 200** — `{ items: UserResult[], meta }`

---

### GET /users/stats

**Response 200**
```json
{ "total": 128, "pending": 6, "active": 118, "suspended": 4 }
```
Counts across every role. No breakdown by role — compute it from `GET /users` if needed.

---

### GET /users/:id

**Response 200** — `UserResult`

**Errors** — `404 USER_001`

---

### PATCH /users/:id/approve
`PENDING` → `ACTIVE`. This is the gate `POST /auth/register` leaves every account behind: before it runs, login and refresh throw `AUTH_006`.

**Body** — none

**Response 200** — `UserResult`

**Errors**
- `409 USER_004` — Already `ACTIVE`
- `404 USER_001` — User not found

A `SUSPENDED` account can be approved back to `ACTIVE` — the transition is not restricted to `PENDING`.

---

### PATCH /users/:id/suspend
Rejecting a sign-up and suspending a working account are the same transition: → `SUSPENDED`. The account's refresh token is revoked in the same call, so a live session cannot keep minting access tokens for another seven days.

**Body** — none

**Response 200** — `UserResult`

**Errors**
- `400 USER_005` — Target is the caller
- `403 USER_003` — Target is a SUPER_ADMIN
- `409 USER_004` — Already `SUSPENDED`
- `404 USER_001` — User not found

---

### PATCH /users/:id/role

**Body**
```json
{ "role": "ASSESSOR" }
```
Any `Role` value is accepted by the DTO, `SUPER_ADMIN` included — the guard is on the *target*, not the new value.

**Response 200** — `UserResult`

**Errors**
- `400 USER_005` — Target is the caller
- `403 USER_003` — Target is a SUPER_ADMIN
- `400 USER_004` — Target still holds store links the new role cannot hold: `assignedStores` while the new role is not ASSESSOR/MENTOR, or `ownedStores` while the new role is not ENTREPRENEUR. Clear the list first with the two endpoints below.
- `404 USER_001` — User not found

---

### PATCH /users/:id/assigned-stores
Sets the assignment list an ASSESSOR scores against and a MENTOR reads against — the `ASSIGNED` data scope for both.

**Body**
```json
{ "storeIds": ["clstore1", "clstore2"] }
```
The **complete** list, not a delta: an omitted store is revoked, `[]` clears everything. Ids must be unique; at most `STORE_TARGET_TOTAL` (400) of them.

**Response 200** — `UserResult` with the new `assignedStores`

**Errors**
- `400 USER_006` — Target is not an ASSESSOR or a MENTOR (`ASSIGNMENT_SCOPED_ROLES`)
- `404 STORE_001` — At least one `storeId` doesn't exist (nothing is written)
- `404 USER_001` — User not found

---

### PATCH /users/:id/owned-stores
Sets `Store.ownerId` for the whole list — how an admin-registered store is handed to the entrepreneur who runs it.

**Body** — same `{ storeIds: [...] }` contract as above, same full-list semantics.

Ownership is single-holder in the schema, so a store already owned by someone else **moves**. That is a transfer, not a conflict, and it is not reported.

**Response 200** — `UserResult` with the new `ownedStores`

**Errors**
- `400 USER_006` — Target is not an ENTREPRENEUR
- `404 STORE_001` — At least one `storeId` doesn't exist
- `404 USER_001` — User not found

---

### DELETE /users/:id
Only for an account that has left no trace.

**Response 200** — `{ "success": true, "data": null }`

**Errors**
- `400 USER_005` — Target is the caller
- `403 USER_003` — Target is a SUPER_ADMIN
- `409 USER_004` — The user has scored assessments (`Assessment.assessorId` is a required relation — suspend instead, which keeps their scores attributable) or still owns stores
- `404 USER_001` — User not found
