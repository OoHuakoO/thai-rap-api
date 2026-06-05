# Auth Module — `/api/v1/auth`

## Endpoints

### POST /auth/login [PUBLIC]
Login with email + password. Returns access token and refresh token.

**Body**
```json
{
  "email": "admin@example.com",
  "password": "secret123"
}
```

**Response 200**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "clxxxxx",
    "name": "Admin User",
    "email": "admin@example.com",
    "role": "ADMIN",
    "status": "ACTIVE"
  }
}
```

**Errors**
- `401` — Invalid credentials
- `403` — Account suspended / pending

---

### POST /auth/register [PUBLIC]
Register new user. Default status is `PENDING` (Admin must activate).

**Body**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secret123",
  "phone": "0812345678",
  "role": "ENTREPRENEUR"
}
```

**Response 201**
```json
{
  "id": "clxxxxx",
  "name": "John Doe",
  "email": "john@example.com",
  "role": "ENTREPRENEUR",
  "status": "PENDING"
}
```

**Errors**
- `409 CONFLICT` — Email already exists

---

### POST /auth/refresh [PUBLIC]
Exchange refresh token for new access token.

**Body**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response 200**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Errors**
- `401` — Refresh token invalid or expired

---

### POST /auth/logout
Revoke current refresh token. Requires valid access token.

**Response 200**
```json
{ "message": "Logged out successfully" }
```

---

### GET /auth/me
Returns the currently authenticated user.

**Response 200**
```json
{
  "id": "clxxxxx",
  "name": "Admin User",
  "email": "admin@example.com",
  "role": "ADMIN",
  "status": "ACTIVE",
  "phone": "0812345678",
  "department": "PMO",
  "avatar": "https://cdn.example.com/avatars/clxxxxx.jpg",
  "provinces": ["ชลบุรี", "ระยอง"],
  "lastLogin": "2026-06-05T09:00:00.000Z"
}
```

---

### PATCH /auth/me/password
Change own password.

**Body**
```json
{
  "currentPassword": "oldSecret",
  "newPassword": "newSecret123"
}
```

**Response 200**
```json
{ "message": "Password changed successfully" }
```

**Errors**
- `400` — Current password incorrect
