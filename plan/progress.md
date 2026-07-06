# THAI-RAP API — Progress

> อัปเดต: 2026-07-06

---

## สถานะปัจจุบัน

**Phase 1 (✅ done)** — Login/Register + Store + Assessment scoring, ทำก่อน epic อื่นทั้งหมดตามคำขอ user (`"ทำระบบ login regis กับ แบบประเมินหน้าร้านก่อน"`). ดู `docs/ba-stories.md` ใน `thai-rap-web` สำหรับ epic breakdown เต็ม (13 epics)

| Module | Status |
|---|---|
| Auth (01) | ✅ Pre-existing ก่อน Phase 1, spec แก้ให้ตรง response shape จริง |
| Users (02) | ⏳ Not started |
| Stores (03) | ✅ CRUD + status, ADMIN-only writes. Photos เลื่อนออก (ไม่มี file storage) |
| Assessments (04) | ✅ Dimensions/Questions seed, scoring, submit (score/zone/red-flag calc), progress. Evidence upload + analysis/comparison endpoints เลื่อนออก |
| Red Flags (05) | ⏳ Auto-detection อย่างเดียว (รันใน `submit`); standalone CRUD/filter/resolve endpoints ยังไม่ทำ |
| Pitching (06) | ⏳ Not started |
| Ranking (07) | ⏳ Not started |
| IDP (08) | ⏳ Not started |
| Field Audit (09) | ⏳ Not started |
| Portfolio (10) | ⏳ Not started |
| Dashboard (11) | ⏳ Not started |
| Reports (12) | ⏳ Not started |

Verification: `npm run build` clean, `npm run test` 4/4, `npm run test:e2e` 22/22 (`test/auth.e2e-spec.ts`, `test/store.e2e-spec.ts`, `test/assessment.e2e-spec.ts`).

Deferred ทั้งระบบใน Phase 1: file upload ทุกชนิด (ไม่มี S3/GCS credentials ตั้งค่าไว้ — `.env.example` ไม่มี), assignment-scoped RBAC (`Store.assignedUsers` relation มีอยู่ในสคีมาแต่ยังไม่บังคับใช้ — `ADMIN`/`ASSESSOR` คนไหนก็ทำกับร้านไหนก็ได้)

---

## Phase 1 — รายละเอียดต่อโมดูล

### Auth (`src/modules/auth/`) — ✅ Pre-existing, spec แก้ไข

โมดูลนี้มีอยู่ก่อน Phase 1 แล้วและทำงานได้เต็มรูปแบบ สิ่งที่แก้รอบนี้คือ **spec เดิมผิด ไม่ใช่โค้ดผิด** — พบว่า `thai-rap-web` เขียนโค้ดตาม shape ผิด (flat `{accessToken, refreshToken, user}` และมี field `phone` ที่ backend ไม่มีจริง) ตอนเช็ค integration จริง แก้ spec ให้ตรงโค้ด ไม่ใช่แก้โค้ดตาม spec เดิม:

- response จริงคือ `{ user, tokens: { accessToken, refreshToken, expiresIn } }` ทั้ง login และ register
- `RegisterDto` ไม่มี `phone`, `role` ใช้ `@IsNotIn([Role.ADMIN])` — สมัครเองเป็น ADMIN ไม่ได้
- `POST /auth/refresh` อ่าน refresh token จาก **request body** (`ExtractJwt.fromBodyField('refreshToken')`) ไม่ใช่ `Authorization` header

### Stores (`src/modules/store/`) — ✅ Implemented

**ทำแล้ว**
- `GET /stores` — pagination + `search` / `province` / `storeType` / `status` filters (ยังไม่มี `hasRedFlag`/`zone`/`round` filter ตามที่ spec เดิมตั้งเป้าไว้)
- `GET /stores/:id` — full store object (ยังไม่มี `assignedAssessors`, `assessmentSummary`, `redFlags` rollup — ต้องดึงแยกผ่าน `GET /assessments?storeId=`)
- `POST /stores`, `PATCH /stores/:id`, `PATCH /stores/:id/status`, `DELETE /stores/:id` — **ADMIN only** (ยังไม่มี ENTREPRENEUR self-service update)

**ยังไม่ทำ**
- `POST/DELETE /stores/:id/photos` — ไม่มี file storage configured
- `hasRedFlag`, `zone`, `round` query filters บน `GET /stores`
- `assignedAssessors` / assignment-scoped RBAC (`ASSESSOR`/`MENTOR`/`ENTREPRENEUR` อ่านได้หมด, เขียนได้แค่ `ADMIN` — ดู `assertCanWrite` ใน `store.service.ts`)
- ENTREPRENEUR self-service `PATCH /stores/:id` สำหรับร้านตัวเอง

Error codes: `STORE_001 NOT_FOUND`, `STORE_002 DUPLICATE`

e2e: `test/store.e2e-spec.ts` (create/list/get/404/update/update-status/delete/403-for-non-admin)

### Assessments (`src/modules/assessment/`) — ✅ Implemented

Seed data (8 dimensions, 50 questions) อยู่ที่ `prisma/seed.ts`

**ทำแล้ว**
- `GET /dimensions`, `GET /dimensions/:id/questions`, `GET /questions?dimensionId=`
- `POST /assessments` (สร้าง DRAFT ต่อ storeId+round), `GET /assessments`, `GET /assessments/:id`
- `PUT /assessments/:id/scores/:questionId` (upsert เดี่ยว), `POST /assessments/:id/scores/bulk` (upsert หลายข้อ)
- `GET /assessments/:id/scores/progress` → `{ scored, total }` เท่านั้น (ยังไม่มี `pending`/`byDimension` breakdown)
- `POST /assessments/:id/submit` — คำนวณ dimension score / weighted total / zone / red-flag ใน transaction เดียว, set `SUBMITTED` + `submittedAt`
- `DELETE /assessments/:id` — DRAFT เท่านั้น
- สิทธิ์เขียน: **ADMIN หรือ ASSESSOR** (`assertCanWrite` ใน `assessment.service.ts`) — ยังไม่มี assignment scoping ต่อร้าน
- `Score` มี `@@unique([assessmentId, questionId])` — bulk upsert สร้างแถวซ้ำต่อคำถามไม่ได้

**ยังไม่ทำ**
- Evidence upload (`POST/DELETE .../evidences`) — ไม่มี file storage
- `GET /assessments/:id/analysis`, `GET /stores/:storeId/assessments/comparison` — endpoint เทียบรอบ
- `byDimension` breakdown บน progress endpoint
- `assessorId` filter / assessor name enrichment บน `GET /assessments` list
- Assignment-scoped RBAC (MENTOR/ENTREPRENEUR อ่านได้, ASSESSOR จำกัดแค่ร้านที่ assign)

Error codes: `ASSESS_001 NOT_FOUND`, `ASSESS_002 DUPLICATE`, `ASSESS_003 INVALID_STATE` (delete/non-draft), `ASSESS_004 SUBMITTED` (แก้คะแนนหลัง submit), `ASSESS_005 NOT_ALL_SCORED`, `ASSESS_006 SCORE_OUT_OF_RANGE`, `ASSESS_007 QUESTION_NOT_FOUND`

e2e: `test/assessment.e2e-spec.ts` — happy path เต็ม (create → duplicate 409 → single score → out-of-range 422 → bulk-score ครบ 50 → progress → submit ได้ `totalScore≈97.857`/`zone===Model Zone`/red flag `LEGAL CRITICAL [13]` → post-submit edit/delete โดนปฏิเสธทั้งคู่)

---

## Config fix — เชื่อมต่อ FE↔BE จริง ✅ DONE (2026-07-06)

พบว่า `thai-rap-web/.env.local` ตั้ง `NEXT_PUBLIC_ENABLE_MOCKS=true` มาตลอด → ทุก dev/smoke test ก่อนหน้าใช้ MSW mock ไม่เคยชนกับ backend จริงเลย พอลองปิด mock เจอ 2 จุดพัง:

- Port ไม่ตรง: backend `.env` ตั้ง `PORT=4000`, frontend เคยตั้ง `NEXT_PUBLIC_API_URL=http://localhost:3001`
- ไม่มี `/api/v1` prefix ใน baseURL ของ frontend เลย ทั้งที่ backend ตั้ง global prefix `api/v1`

แก้ฝั่ง frontend แล้ว (`http://localhost:4000/api/v1`, mocks=false) ยืนยันด้วย curl ตรงกับ backend จริง: login → register → create store → create assessment → bulk score 50 → submit → ได้ `totalScore/zone/redFlags` ถูกต้องครบ flow

---

## Infra / เบื้องหลังที่แก้ระหว่างทาง (ไม่ใช่ feature ใหม่ แต่จำเป็นก่อนเริ่ม Phase 1)

- Prisma client เวอร์ชันชนกับ CLI (`^5.13.0` vs CLI `7.x`) → bump `@prisma/client` เป็น `^7.8.0`
- Prisma 7 breaking change — `PrismaClient` ไม่รับ `datasourceUrl` อีกต่อไป ต้องใช้ driver adapter → ติดตั้ง `@prisma/adapter-mariadb` + `mariadb`, แก้ `PrismaService`/`prisma/seed.ts`
- `test/jest-e2e.json` ขาด `@constants` path alias มาก่อนแล้ว (ไม่เกี่ยวกับงานนี้ เจอระหว่างรัน e2e ครั้งแรก) — เพิ่มแล้ว
- `test/auth.e2e-spec.ts` เดิมพังอยู่ (import ผิด + สมัคร role ADMIN ซึ่ง DTO บล็อก) — แก้เป็น dynamic email + role ASSESSOR

---

## Next

02 Users, 05 Red Flags (standalone CRUD), 06 Pitching, 07 Ranking, 08 IDP, 09 Field Audit, 10 Portfolio, 11 Dashboard, 12 Reports — ดูรายละเอียดใน `plan/plan.md` (Phase 2+) และ endpoint list เต็มใน `spec/README.md`

ก่อนเริ่มงานที่ต้องอัปโหลดไฟล์ (photos, evidence, portfolio files) ต้องตัดสินใจ storage provider ก่อน (S3/GCS/Cloudinary) — `thai-rap-web/plan/progess.md` เคยตัดสินใจไว้ว่าจะใช้ Cloudinary ฝั่ง frontend แต่ backend ยังไม่มี credentials/config รองรับ
