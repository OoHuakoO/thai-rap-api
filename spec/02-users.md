# Users Module — `/api/v1/users`

All endpoints require `ADMIN` role unless noted.

## Endpoints

### GET /users
List all users with pagination and filtering.

**Access:** ADMIN

**Query Params**
| Param | Type | Description |
|---|---|---|
| `page` | number | Page number |
| `limit` | number | Items per page |
| `search` | string | Search by name or email |
| `role` | Role enum | Filter by role |
| `status` | UserStatus enum | Filter by status |

**Response 200**
```json
{
  "items": [
    {
      "id": "clxxxxx",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "role": "ASSESSOR",
      "status": "ACTIVE",
      "phone": "0891234567",
      "department": "Field Team",
      "provinces": ["ชลบุรี"],
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 10, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

### GET /users/:id
Get user detail.

**Access:** ADMIN, or own user (any role)

**Response 200**
```json
{
  "id": "clxxxxx",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "role": "ASSESSOR",
  "status": "ACTIVE",
  "phone": "0891234567",
  "department": "Field Team",
  "provinces": ["ชลบุรี"],
  "avatar": null,
  "permissions": [],
  "lastLogin": "2026-06-04T08:00:00.000Z",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "assignedStores": [
    { "id": "clstore1", "name": "ร้านอาหารสุขใจ", "province": "ชลบุรี" }
  ]
}
```

---

### POST /users
Create new user directly (Admin only, bypasses email registration).

**Access:** ADMIN

**Body**
```json
{
  "name": "Mentor A",
  "email": "mentor@example.com",
  "password": "tempPass123",
  "phone": "0801234567",
  "role": "MENTOR",
  "department": "Mentoring Team",
  "provinces": ["ระยอง", "จันทบุรี"],
  "status": "ACTIVE"
}
```

**Response 201** — Same as GET /users/:id (without assignedStores)

**Errors**
- `409` — Email already exists

---

### PATCH /users/:id
Update user profile or status.

**Access:** ADMIN (full), own user (name/phone/avatar only)

**Body** (all fields optional)
```json
{
  "name": "Updated Name",
  "phone": "0899999999",
  "department": "New Department",
  "status": "ACTIVE",
  "role": "MENTOR",
  "provinces": ["ชลบุรี", "ระยอง"],
  "permissions": []
}
```

**Response 200** — Updated user object

**Errors**
- `403` — Non-admin attempting to change role/status/provinces

---

### DELETE /users/:id
Soft-delete user by setting status to SUSPENDED.

**Access:** ADMIN

**Response 200**
```json
{ "message": "User suspended" }
```

**Errors**
- `400` — Cannot suspend own account

---

### POST /users/:id/assign-stores
Assign stores to an assessor or mentor.

**Access:** ADMIN

**Body**
```json
{
  "storeIds": ["clstore1", "clstore2"]
}
```

**Response 200**
```json
{
  "assigned": 2,
  "storeIds": ["clstore1", "clstore2"]
}
```

---

### DELETE /users/:id/assign-stores
Remove store assignments from a user.

**Access:** ADMIN

**Body**
```json
{
  "storeIds": ["clstore1"]
}
```

**Response 200**
```json
{ "removed": 1 }
```

---

### PATCH /users/:id/avatar
Upload user avatar image.

**Access:** ADMIN, or own user

**Content-Type:** `multipart/form-data`

**Body**
| Field | Type | Required |
|---|---|---|
| `file` | image (jpg/png, max 2MB) | Yes |

**Response 200**
```json
{ "avatarUrl": "https://cdn.example.com/avatars/clxxxxx.jpg" }
```
