# Auth Module — `/api/v1/auth`

## Endpoints

### POST /auth/login [PUBLIC]
Login with email + password. Returns an access token in the body and sets the refresh token as an httpOnly cookie (`refreshToken`) — it is never returned in the JSON body.

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
    "expiresIn": 900
  }
}
```

**Errors**
- `401 AUTH_001` — Invalid credentials
- `403 AUTH_005` — Account suspended
- `403 AUTH_006` — Account pending activation

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

**Response 201** — same shape as `POST /auth/login` (`{ user, tokens: { accessToken, expiresIn } }`, refresh token set as httpOnly cookie); registering logs the user in immediately.

**Errors**
- `409 USER_002` — Email already exists
- `422 VALID_002` — `role` is `ADMIN`, or other validation failure

---

### POST /auth/refresh [PUBLIC]
Exchange refresh token for a new access token. The refresh token is validated via a dedicated `JwtRefreshStrategy` (Passport strategy name `jwt-refresh`) that reads it only from the **httpOnly cookie** (`refreshToken`) — there is no request body, and it is not read from the `Authorization` header.

**Body** — none

**Response 200**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900
}
```
A new refresh token is issued and set as the `refreshToken` cookie; it is not returned in the body.

**Errors**
- `401 AUTH_004` — Refresh token missing, invalid, expired, or revoked

---

### POST /auth/logout
Revoke current refresh token and clear the `refreshToken` cookie. Requires valid access token (`Authorization: Bearer`).

**Response 200**
```json
{ "success": true, "data": null }
```

---

### GET /auth/me
Returns the currently authenticated user. Requires valid access token.

**Response 200**
```json
{
  "id": "clxxxxx",
  "name": "Admin User",
  "email": "admin@example.com",
  "role": "ADMIN",
  "status": "ACTIVE",
  "lastLogin": "2026-06-05T09:00:00.000Z",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-06-05T09:00:00.000Z"
}
```
The `User` model has no `phone`, `department`, `avatar`, or `provinces` fields — they do not exist anywhere in the schema and can never appear in this response.

---

`PATCH /auth/me/password` (change own password) is **not implemented** — no route, service method, or DTO exists.
