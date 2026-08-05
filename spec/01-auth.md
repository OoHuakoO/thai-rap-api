# Auth Module — `/api/v1/auth`

Seven routes, all `POST`. There is **no `GET /auth/me`** and no change-password route — `AuthController` defines no `@Get` at all. A client that needs the current user's row reads the JWT payload (`sub`, `email`, `role`) or, for a SUPER_ADMIN, `GET /users/:id`.

```
POST /auth/register          [PUBLIC]
POST /auth/login             [PUBLIC]
POST /auth/refresh           [PUBLIC + jwt-refresh guard]
POST /auth/logout
POST /auth/forgot-password   [PUBLIC] 3/min
POST /auth/verify-otp        [PUBLIC] 10/min
POST /auth/reset-password    [PUBLIC] 10/min
```

---

### POST /auth/register [PUBLIC]

Creates a **PENDING** account. **No session is issued** — no tokens in the body, no refresh cookie. The account is inert until a SUPER_ADMIN runs `PATCH /users/:id/approve`; login and refresh both reject `PENDING` with 403 `AUTH_006`.

**Body**
```json
{
  "name": "นางสาวศิริวรรณ จันทร์ดี",
  "email": "siriwan.j@example.com",
  "password": "P@ssw0rd!",
  "role": "ENTREPRENEUR"
}
```
`name` 2–100 chars, `password` 8–128 chars. `role` must be in `SELF_REGISTERABLE_ROLES` — `VIEWER`, `ENTREPRENEUR`, `MENTOR`, `ASSESSOR`, `JUDGE`, `ME_TEAM`. `SUPER_ADMIN` and `ADMIN` are rejected: nobody self-nominates for the roles that manage everyone else.

**Response 201**
```json
{
  "user": {
    "id": "clxxxxx",
    "name": "นางสาวศิริวรรณ จันทร์ดี",
    "email": "siriwan.j@example.com",
    "role": "ENTREPRENEUR",
    "status": "PENDING",
    "lastLogin": null,
    "createdAt": "2026-06-05T09:00:00.000Z",
    "updatedAt": "2026-06-05T09:00:00.000Z"
  }
}
```
The `User` model has no `phone`, `department`, `avatar` or `provinces` column — they can never appear here.

**Errors**
- `409 USER_002` — Email already exists
- `422 VALID_002` — `role` not self-registerable, or other validation failure

---

### POST /auth/login [PUBLIC]

Returns the access token in the body and sets the refresh token as an httpOnly cookie (`refreshToken`) — it is never in the JSON.

**Body**
```json
{ "email": "admin@example.com", "password": "P@ssw0rd!" }
```

**Response 200**
```json
{
  "user": {
    "id": "clxxxxx",
    "name": "Admin User",
    "email": "admin@example.com",
    "role": "ADMIN",
    "status": "ACTIVE",
    "lastLogin": "2026-06-05T09:00:00.000Z",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-06-05T09:00:00.000Z"
  },
  "tokens": { "accessToken": "eyJhbGciOiJIUzI1NiIs...", "expiresIn": 900 }
}
```
`user` is the whole row minus `password`. Cookie flags: `httpOnly`, `sameSite` from `auth.cookieSameSite` (default `lax`), `secure` only in production, `maxAge` 7 days.

**Errors**
- `401 AUTH_001` — Email unknown or password wrong (one code for both — the response must not distinguish them)
- `403 AUTH_005` — Account suspended
- `403 AUTH_006` — Account still pending approval

---

### POST /auth/refresh [PUBLIC]

Rotates the refresh token. Validated by `JwtRefreshStrategy` (Passport name `jwt-refresh`), which reads the token **only from the httpOnly cookie** — no request body, and it is not read from the `Authorization` header.

**Body** — none

**Response 200**
```json
{ "accessToken": "eyJhbGciOiJIUzI1NiIs...", "expiresIn": 900 }
```
A fresh refresh token replaces the cookie; it is not returned in the body.

**Errors**
- `401 AUTH_004` — Missing, invalid, expired or revoked
- `403 AUTH_005` / `403 AUTH_006` — Account suspended or pending (status is re-checked on every refresh)
- `404 USER_001` — Token valid but the user row is gone

---

### POST /auth/logout

Revokes the stored refresh token and clears the cookie. Requires a valid access token.

**Response 200** — `{ "success": true, "data": null }`

---

## Password Reset

Three calls. The OTP travels once: it is exchanged for a short-lived reset token, and only that token can set a password.

### POST /auth/forgot-password [PUBLIC] — 3/min

**Body** `{ "email": "siriwan.j@rbru.ac.th" }`

Always answers **200 with `data: null`**, whether or not the address is registered — the response must not reveal which. A 6-digit OTP is mailed and stored as a bcrypt hash with a 10-minute expiry (`mail.otpExpiresInMinutes`). Suspended accounts are silently skipped.

**Errors** — `429 RATE_001` only.

---

### POST /auth/verify-otp [PUBLIC] — 10/min

**Body**
```json
{ "email": "siriwan.j@rbru.ac.th", "otp": "482915" }
```
`otp` must be exactly 6 digits.

**Response 200**
```json
{ "resetToken": "eyJhbGciOiJIUzI1NiIs...", "expiresIn": 600 }
```
The OTP row is marked consumed. `resetToken` is signed with a secret derived from the access secret (HMAC over the purpose string), so it cannot be replayed against `JwtAuthGuard` as an access token.

**Errors**
- `400 AUTH_007` — OTP wrong, already consumed, or no request outstanding (an unknown email also lands here, not `USER_001`). A wrong OTP increments the attempt counter.
- `400 AUTH_008` — OTP expired
- `400 AUTH_009` — More than 5 wrong attempts (`mail.otpMaxAttempts`); a new OTP must be requested

---

### POST /auth/reset-password [PUBLIC] — 10/min

**Body**
```json
{ "resetToken": "eyJhbGciOiJIUzI1NiIs...", "password": "N3wP@ssw0rd!" }
```
The OTP is **not** accepted here. `password` 8–128 chars.

**Response 200** — `{ "success": true, "data": null }`

On success the OTP row is deleted (so one verify can reset once) and the account's refresh token is revoked — every existing session dies with the old password.

**Errors**
- `401 AUTH_010` — Reset token invalid, expired, wrong purpose, or its OTP row is gone
- `404 USER_001` — Token valid but the user row is gone
