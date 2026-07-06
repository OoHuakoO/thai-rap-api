# THAI-RAP API — Implementation Plan

> อ้างอิง: `spec/` (API contract), `.claude/rules/project-conventions.md`
> ความคืบหน้าจริงอยู่ที่ [`progress.md`](progress.md) — ไฟล์นี้คือแผนก่อนเริ่มทำงาน ไม่ใส่สถานะ done/not-done

---

## Context

`docs/ba-stories.md` ใน `thai-rap-web` แบ่งระบบ THAI-RAP ทั้งหมดเป็น 13 epics ตรงกับ 12 module ใน `spec/` (+ Users) User ขอให้ทำ **Phase 1: Auth (login/register) + Store + Assessment scoring** ก่อน epic อื่นทั้งหมด เพราะเป็นหน้าจอที่ assessor ต้องใช้งานจริงก่อน (ลงทะเบียนร้าน → ให้คะแนนแบบประเมิน 50 ข้อ)

ตัดสินใจที่ล็อกไว้ก่อนเริ่ม:
- Register เปิดให้ทุก role ยกเว้น `ADMIN` (`RegisterDto` มี `@IsNotIn([Role.ADMIN])`)
- คำถามเป็นเลขรันต่อเนื่อง 1–50 ไม่ใช่แยกเลขต่อมิติ — อิงจาก red-flag question range ใน `project-conventions.md` (8–14, 21/22, 28–31, 35/36/39/41, 47/48, 49, 50) ที่ตรงกับผลรวมจำนวนคำถามสะสมต่อมิติพอดี (7,7,6,7,7,7,5,4) ขอบเขตมิติ: D1=1-7, D2=8-14, D3=15-20, D4=21-27, D5=28-34, D6=35-41, D7=42-46, D8=47-50

Deferred โดยตั้งใจใน Phase 1 (ยังไม่ใช่งานตอนนี้ อยู่ใน epic หลังๆ ของ `docs/ba-stories.md`): evidence photo upload (ไม่มี S3/GCS credentials ใน `.env.example`), Field Audit, IDP, Portfolio, Pitching, Ranking, Dashboard aggregates, OKR, Reports, assignment/ownership-scoped RBAC — Store/Assessment endpoint ใน Phase 1 ใช้ได้กับ `ADMIN` และ `ASSESSOR` เท่านั้น (สองบทบาทเดียวที่ UI รอบนี้ทำรองรับ) role อื่นได้ read access ที่ไม่เป็นอันตราย เขียนไม่ได้เลย ถูกบล็อกใน service layer ตาม convention เดียวกับ `auth`

---

## Phase 1 — Auth + Store + Assessment

### 1. Schema fix + seed data

- เพิ่ม `@@unique([assessmentId, questionId])` ใน model `Score` — ของเดิมไม่มี ทำให้ bulk score upsert สร้างแถวซ้ำต่อคำถามได้
- สร้าง `prisma/seed.ts` (ที่ `npm run db:seed` อ้างถึงอยู่แล้วแต่ไฟล์ไม่มี) — seed 8 `Dimension` + 50 `Question` จากข้อความไทยใน `docs/ระบบ THAI-RAP Restaurant Survival Diagnostic System.docx` §7 และค่า `nameEn`/`weight` จาก `spec/00-overview.md`
- รัน `npm run db:migrate -- --name score-unique-constraint` แล้ว `npm run db:seed`

### 2. `store` module (มิเรอร์โครงสร้าง `src/modules/auth/`)

ไฟล์: `store.module.ts`, `store.controller.ts`, `store.service.ts`, `store.repository.ts` (ที่เดียวที่แตะ `PrismaService`), `dto/create-store.dto.ts`, `dto/update-store.dto.ts`, `dto/query-store.dto.ts`

- `GET /stores` — paginated list (`buildPaginatedResult` จาก `src/shared/pagination.util.ts`), filter: search, province, storeType, status
- `GET /stores/:id`, `POST /stores` (ADMIN only), `PATCH /stores/:id` (ADMIN only รอบนี้), `DELETE /stores/:id` (ADMIN only)
- ใช้ `ERROR_CODES.STORE.*` (ขยาย `error-codes.const.ts` ถ้าจำเป็น) และ exception class จาก `@common/exceptions/app.exception` — ห้ามใช้ NestJS built-in
- Register `StoreModule` ใน `src/app.module.ts`

### 3. `assessment` module

โครงไฟล์เดียวกัน บวก `dimension.controller.ts` (read-only, `GET /dimensions`, `GET /dimensions/:id/questions`, `GET /questions`)

- `POST /assessments` — สร้าง DRAFT ต่อ `(storeId, round)`; `@@unique([storeId, round])` มีอยู่แล้ว ทำให้สร้างซ้ำ 409 (`ERROR_CODES.ASSESS.DUPLICATE`) โดยธรรมชาติ
- `GET /assessments/:id` — คืน assessment พร้อม 50 คำถาม join กับ score ที่มี (คำถามที่ยังไม่ให้คะแนนคืน `rawScore: null`)
- `PUT /assessments/:id/scores/:questionId` — upsert คะแนนเดียว (0–4, นอกช่วง reject `422 SCORE_OUT_OF_RANGE`); reject ถ้า assessment `SUBMITTED` แล้ว (`400 ASSESSMENT_SUBMITTED`)
- `POST /assessments/:id/scores/bulk` — upsert หลายคะแนนพร้อมกัน (array body)
- `GET /assessments/:id/scores/progress` — `{ scored: number, total: 50 }`
- `POST /assessments/:id/submit` — reject ถ้า `scored < 50`; ไม่งั้นรันใน `$transaction` เดียว: คำนวณ dimension score ต่อมิติ, weighted total, zone, รัน red-flag detection (สูตร/ฟังก์ชัน `detectRedFlags()` ตาม `project-conventions.md` ทั้งหมด) แล้ว set `status = SUBMITTED`, `submittedAt`, สร้าง `RedFlag` rows, คืน assessment พร้อม `totalScore`, zone ที่คำนวณแล้ว, และ `redFlags`
- `DELETE /assessments/:id` — DRAFT เท่านั้น
- Business/scoring logic อยู่ใน `AssessmentService` เท่านั้น ห้ามอยู่ใน controller/repository

### 4. Tests

เพิ่ม `test/store.e2e-spec.ts` และ `test/assessment.e2e-spec.ts` มิเรอร์โครงสร้าง `test/auth.e2e-spec.ts` เดิม (`ValidationPipe` setup เดียวกัน, `supertest`, assert envelope `{success,data}`/`{success,error}`) ครอบคลุม: happy path create→score→submit, 422 out-of-range, 400 score หลัง submit, 409 duplicate `(storeId, round)`

**Verification:**
```
npm run db:migrate -- --name score-unique-constraint
npm run db:seed
npm run test
npm run test:e2e
```
ทดสอบ manual ผ่าน Swagger (`/api/docs`) หรือ curl: register → login → create store (ADMIN) → create assessment (ASSESSOR) → bulk-score ครบ 50 → submit → เช็ค response มี `totalScore`, zone ถูกต้อง, `redFlags` ตรงที่คาด

---

## Phase 2+ — Backlog (ยังไม่วางแผนรายละเอียด)

เรียงตามลำดับ epic ใน `spec/README.md`, endpoint list เต็มดูที่นั่น:

1. **Users** (02) — CRUD, role management, assign stores, avatar
2. **Red Flags standalone** (05) — CRUD/filter/resolve แยกจาก auto-detection ที่มีอยู่แล้วใน submit
3. **Pitching** (06) — judge scores 5 criteria × 20 pts, aggregate per store
4. **Ranking** (07) — IRS formula, top 20, recalculate, finalize
5. **IDP + Mentoring** (08) — 7/30/90 day plans, mentoring logs
6. **Field Audit** (09) — on-site checklist, evidence upload, T2 round
7. **Portfolio** (10) — 8-dimension portfolio, file upload
8. **Dashboard** (11) — overview/province/dimension stats, OKR progress
9. **Reports** (12) — async generation, PDF/Excel/CSV/JSON download

ก่อนเริ่มโมดูลที่ต้องอัปโหลดไฟล์ (Store photos, Assessment evidence, Field Audit evidence, Portfolio files) ต้องเลือก storage provider ก่อน (S3/GCS/Cloudinary) และตั้งค่า credentials ใน `.env` — ตอนนี้ยังไม่มี

แต่ละโมดูลใหม่ให้ตามโครงสร้างเดียวกับ Phase 1: `<name>.module/controller/service/repository.ts` + `dto/`, RBAC ใน service layer, error codes ใหม่ต้องเพิ่มใน `error-codes.const.ts` ก่อนใช้, e2e test ครบ happy/not-found/forbidden/conflict ต่อ endpoint
