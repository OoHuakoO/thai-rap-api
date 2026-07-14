# THAI-RAP API — Project Conventions

## Stack
NestJS 10 + TypeScript, Prisma 5 (MySQL), JWT (access + refresh), class-validator, Swagger, Winston.

---

## Module Structure
Every feature lives under `src/modules/<name>/`:
```
<name>.module.ts
<name>.controller.ts
<name>.service.ts
<name>.repository.ts   ← all Prisma calls here only
dto/
  create-<name>.dto.ts
  update-<name>.dto.ts
  query-<name>.dto.ts  ← query params / filters
```
Register in `src/app.module.ts`.

---

## Path Aliases
Always use `@common/`, `@modules/`, `@shared/`, `@database/`, `@config/`, `@constants/`. Never relative `../../`.

---

## API Response Envelope
```ts
// success — TransformInterceptor wraps automatically, return raw data from controllers
{ success: true, data: T }

// error — GlobalExceptionFilter handles automatically
{ success: false, error: { code: string, message: string, details?: [] } }
```

---

## Constants
All error codes live in `src/common/constants/error-codes.const.ts`. Never hardcode error code strings inline.

```ts
import { ERROR_CODES } from '@constants/index';

throw new NotFoundException(ERROR_CODES.STORE.NOT_FOUND, 'Store not found');
throw new ConflictException(ERROR_CODES.ASSESS.DUPLICATE, 'Assessment already exists');
```

When adding a new domain, add its codes to `ERROR_CODES` in `error-codes.const.ts` first.

---

## Exceptions
Never throw NestJS built-ins. Always use subclasses from `@common/exceptions/app.exception`:
```ts
import {
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@common/exceptions/app.exception';
import { ERROR_CODES } from '@constants/index';

throw new NotFoundException(ERROR_CODES.STORE.NOT_FOUND, 'Store not found');
throw new ConflictException(ERROR_CODES.ASSESS.DUPLICATE, 'Assessment already exists for this round');
throw new BadRequestException(ERROR_CODES.ASSESS.INVALID_STATE, 'All 50 questions must be scored before submitting');
throw new ForbiddenException(ERROR_CODES.PERM.FORBIDDEN, 'Not assigned to this store');
```

### Error Code Catalog

| Prefix | Range | Domain |
|--------|-------|--------|
| `AUTH_` | 001–099 | Authentication / tokens |
| `USER_` | 001–099 | User entity |
| `STORE_` | 001–099 | Store entity |
| `ASSESS_` | 001–099 | Assessment / Score / Evidence |
| `FLAG_` | 001–099 | Red Flag |
| `PITCH_` | 001–099 | Pitching Score |
| `IDP_` | 001–099 | IDP / Mentoring |
| `AUDIT_` | 001–099 | Field Audit |
| `PORT_` | 001–099 | Portfolio |
| `RANK_` | 001–099 | Ranking |
| `RPT_` | 001–099 | Reports |
| `VALID_` | 001–099 | Validation / DTO |
| `PERM_` | 001–099 | Permission / RBAC |
| `FILE_` | 001–099 | File upload |
| `DB_` | 001–099 | Database / Prisma |
| `SYS_` | 001–099 | Unexpected / internal |

---

## Auth & Guards
- All routes JWT-protected by default (global `JwtAuthGuard`).
- Public routes: `@Public()` from `@common/decorators/public.decorator`.
- Current user: `@CurrentUser()` from `@common/decorators/current-user.decorator`.

---

## RBAC Enforcement

Role checks happen in the **service layer**, not the controller.

```ts
// service method pattern
async getStore(id: string, user: JwtPayload): Promise<Store> {
  const store = await this.storeRepo.findById(id);
  if (!store) throw new NotFoundException('STORE_001', 'Store not found');

  if (user.role === Role.ENTREPRENEUR && store.ownerId !== user.sub) {
    throw new ForbiddenException('PERM_001', 'Access denied');
  }
  if (user.role === Role.ASSESSOR && !store.assignedUsers.some(u => u.id === user.sub)) {
    throw new ForbiddenException('PERM_002', 'Not assigned to this store');
  }
  return store;
}
```

Never trust role from request body. Always use `@CurrentUser()` JWT payload.

---

## Prisma Rules

### Repository Only
Only `*.repository.ts` files import `PrismaService`. Services inject the repository.

```ts
// CORRECT
@Injectable()
export class StoreService {
  constructor(private readonly storeRepo: StoreRepository) {}
}

// WRONG — never do this in service
constructor(private readonly prisma: PrismaService) {}
```

### Select Only Required Fields
Never use implicit `findMany()` without a `select` on large models.

```ts
// CORRECT
findAll() {
  return this.prisma.store.findMany({
    select: {
      id: true, name: true, province: true, status: true,
      // only what the caller needs
    },
  });
}

// WRONG — returns all fields including unused ones
findAll() {
  return this.prisma.store.findMany();
}
```

### Avoid N+1 Queries
Use `include` or nested `select` instead of looping with separate queries.

```ts
// CORRECT — single query with include
this.prisma.assessment.findMany({
  include: { store: { select: { id: true, name: true } }, assessor: { select: { id: true, name: true } } },
});

// WRONG — N+1
const assessments = await this.prisma.assessment.findMany();
for (const a of assessments) {
  a.store = await this.prisma.store.findUnique({ where: { id: a.storeId } });
}
```

### Transactions
Use `$transaction` for operations that must succeed or fail together.

```ts
// Example: submit assessment → update scores status + auto-generate red flags
await this.prisma.$transaction(async (tx) => {
  await tx.assessment.update({ where: { id }, data: { status: 'SUBMITTED', totalScore, submittedAt: new Date() } });
  await tx.score.updateMany({ where: { assessmentId: id }, data: { status: 'SCORED' } });
  await tx.redFlag.createMany({ data: redFlagsToCreate });
});
```

### Upsert Pattern
Use `upsert` for entities with unique compound keys (e.g., Portfolio per store+dimension).

```ts
this.prisma.portfolio.upsert({
  where: { storeId_dimensionId: { storeId, dimensionId } },
  create: { storeId, dimensionId, ...data },
  update: { ...data },
});
```

### Typed Inputs
Always use Prisma generated types.

```ts
import { Prisma } from '@prisma/client';

async create(data: Prisma.StoreCreateInput) { ... }
async update(id: string, data: Prisma.StoreUpdateInput) { ... }
```

---

## DTOs

- Every field needs `class-validator` decorator + `@ApiProperty()`.
- `whitelist: true` and `forbidNonWhitelisted: true` are global — extra fields are rejected.
- Query param DTOs extend `PaginationDto` when they include page/limit.
- Use `@IsEnum(Round)`, `@IsUUID()`, `@IsInt()`, `@Min(0)`, `@Max(4)` for constrained fields.
- Optional fields: `@IsOptional()` before other decorators.

```ts
export class CreateScoreDto {
  @ApiProperty({ example: 3, minimum: 0, maximum: 4 })
  @IsInt()
  @Min(0)
  @Max(4)
  rawScore: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
```

---

## Pagination
Use `buildPaginationMeta` from `@shared/pagination.util`.

```ts
const [items, total] = await Promise.all([
  this.storeRepo.findAll(query),
  this.storeRepo.count(query),
]);
return { items, meta: buildPaginationMeta(total, query.page, query.limit) };
```

---

## File Upload
- Max size and allowed-type regexes live in `src/common/constants/file-upload.const.ts` — never inline a byte count or MIME regex in a controller. See [constants-organization.md](constants-organization.md).
- Current limit: `FILE_MAX_SIZE_BYTES` (10 MB). Current type sets: `PHOTO_MIME_REGEX`, `STORE_DOCUMENT_MIME_REGEX`, `ASSESSMENT_EVIDENCE_MIME_REGEX`.
- Use `FileInterceptor` / `FilesInterceptor` from `@nestjs/platform-express`.
- Validate with `FileTypeValidator` + `MaxFileSizeValidator` in `ParseFilePipe`.
- Store in cloud (S3/GCS); never store binary in DB. Save URL to DB.
- Throw `BadRequestException('FILE_001', ...)` for invalid type or `('FILE_002', ...)` for too large.

```ts
import { FILE_MAX_SIZE_BYTES, FILE_MAX_SIZE_MB, PHOTO_MIME_REGEX, ERROR_CODES } from '@constants/index';

@Post('evidence')
@UseInterceptors(FileInterceptor('file'))
async uploadEvidence(
  @UploadedFile(
    new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: FILE_MAX_SIZE_BYTES }),
        new FileTypeValidator({ fileType: PHOTO_MIME_REGEX }),
      ],
      exceptionFactory: (error) =>
        error.toLowerCase().includes('size')
          ? new BadRequestException(ERROR_CODES.FILE.TOO_LARGE, `File exceeds the ${FILE_MAX_SIZE_MB} MB limit`)
          : new BadRequestException(ERROR_CODES.FILE.INVALID_TYPE, 'File type is not allowed'),
    }),
  )
  file: Express.Multer.File,
) { ... }
```

If a new upload flow needs a genuinely different size or MIME set, add a new named constant to `file-upload.const.ts` first — don't type a new literal inline.

---

## Score Calculation (Business Logic)

Score calculation lives in `AssessmentService`, not the controller or repository.

### Dimension Score
```ts
dimensionScore(%) = (Σ raw scores in dimension / max possible score in dimension) × 100
// max possible score = questionCount × 4
```

### Weighted Total Score
```ts
totalScore = Σ (dimensionScore × weight / 100)
// weight is stored in Dimension.weight (integer, e.g. 12 for 12%)
```

### Development Score
```ts
improvementDelta = T1.totalScore - T0.totalScore
improvementRate(%) = (T0.totalScore === 0) ? null : ((T1 - T0) / T0) × 100
```

### Score Zone
```ts
function getZone(score: number): string {
  if (score < 40) return 'Red Zone';
  if (score < 60) return 'Survival Zone';
  if (score < 75) return 'Improve Zone';
  if (score < 85) return 'Growth Zone';
  return 'Model Zone';
}
```

---

## Red Flag Detection

Run automatically inside the submit assessment transaction.

```ts
// Called after scores are committed
function detectRedFlags(scores: Score[]): RedFlagCreate[] {
  const flags: RedFlagCreate[] = [];
  const byQ = (qNo: number) => scores.find(s => s.question.questionNo === qNo)?.rawScore ?? 0;

  const foodSafetyAvg = avg(scores.filter(s => s.question.questionNo >= 8 && s.question.questionNo <= 14).map(s => s.rawScore));
  if (foodSafetyAvg < 2) flags.push({ type: 'FOOD_SAFETY', severity: 'WARNING', triggerQuestions: [8,9,10,11,12,13,14] });

  if ([28,29,30,31].some(q => byQ(q) <= 1))
    flags.push({ type: 'FINANCIAL', severity: 'CRITICAL', triggerQuestions: [28,29,30,31].filter(q => byQ(q) <= 1) });

  if ([35,36,39,41].some(q => byQ(q) <= 1))
    flags.push({ type: 'OPERATION', severity: 'WARNING', triggerQuestions: [35,36,39,41].filter(q => byQ(q) <= 1) });

  if ([21,22].some(q => byQ(q) <= 1))
    flags.push({ type: 'MARKET', severity: 'WARNING', triggerQuestions: [21,22].filter(q => byQ(q) <= 1) });

  if (byQ(13) === 0) flags.push({ type: 'LEGAL', severity: 'CRITICAL', triggerQuestions: [13] });
  if (byQ(47) < 2 || byQ(48) < 2) flags.push({ type: 'OWNER_READINESS', severity: 'WARNING', triggerQuestions: [47,48].filter(q => byQ(q) < 2) });
  if (byQ(49) < 2) flags.push({ type: 'EVIDENCE', severity: 'WARNING', triggerQuestions: [49] });
  if (byQ(50) < 2) flags.push({ type: 'GROWTH', severity: 'WARNING', triggerQuestions: [50] });

  return flags;
}
```

---

## Ranking (Incubation Readiness Score)

```ts
IRS = (T1_totalScore × 0.40)
    + (improvementDelta × 0.25)      // (T1 - T0), not rate
    + (pitchingAvgScore × 0.20)
    + (mindsetScore × 0.10)          // normalize Q47+Q48 to 0–100
    + (evidenceScore × 0.05)         // normalize Q49 to 0–100
```

Ranking lives in `RankingService`. On `POST /ranking/finalize`, update all Store.status in one transaction.

---

## Comments
No explanatory comments. Add a comment only when the WHY is non-obvious (hidden constraint, workaround). No JSDoc blocks.

---

## Testing
- Unit tests only: `*.service.spec.ts`. Mock the repository — never `PrismaService`.
- No e2e/integration tests in this project.
- Each service method must have: happy path, not-found case, forbidden case, conflict case.
