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
  "user": {
    "id": "clxxxxx",
    "name": "Admin User",
    "email": "admin@example.com",
    "role": "ADMIN",
    "status": "ACTIVE"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 900
  }
}
```

**Errors**
- `401` — Invalid credentials
- `403` — Account suspended / pending

---

### POST /auth/register [PUBLIC]
Register new user. No `phone` field. `role` accepts any `Role` **except `ADMIN`** (`@IsNotIn([Role.ADMIN])`) — self-registration cannot create an admin account.

**Body**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secret123",
  "role": "ENTREPRENEUR"
}
```

**Response 201** — same shape as `POST /auth/login` (`{ user, tokens }`); registering logs the user in immediately.

**Errors**
- `409 CONFLICT` — Email already exists
- `422` — `role` is `ADMIN`, or other validation failure

---

### POST /auth/refresh [PUBLIC]
Exchange refresh token for new access token. The refresh token is validated via a dedicated `JwtRefreshStrategy` reading it from the **body**, not the `Authorization` header.

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
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900
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
