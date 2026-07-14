---
name: write-tests
description: Generate unit tests (*.service.spec.ts) for a service method following THAI-RAP test conventions — mocked repository, happy path, not-found, forbidden, conflict cases. Use when writing or completing tests for a service.
---

# write-tests

Generate unit specs for service methods per project testing rules. Reference implementation: `src/modules/auth/auth.service.spec.ts`.

## Instructions

Ask (or infer from context):
1. Which service / method(s)?
2. Which RBAC roles can call it? (determines the forbidden case)

Then generate in `src/modules/<name>/<name>.service.spec.ts`:

### Setup Pattern

- `Test.createTestingModule` with the real service + mocked providers
- Repository mocked with `useValue`: every method the service calls as `jest.fn()`
- Type the mock as `jest.Mocked<XxxRepository>` via `module.get`
- `ConfigService`/`JwtService` mocked with a key→value map when needed
- Shared fixture objects at top of file (e.g. `mockUser`, `mockStore`) with ALL model fields — Prisma types are strict

```ts
describe('StoreService', () => {
  let service: StoreService;
  let repository: jest.Mocked<StoreRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreService,
        {
          provide: StoreRepository,
          useValue: {
            findById: jest.fn(),
            create: jest.fn(),
            // every method the service calls
          },
        },
      ],
    }).compile();

    service = module.get(StoreService);
    repository = module.get(StoreRepository);
  });
```

### Required Cases Per Method

Every service method gets its own `describe` block with, where applicable:

1. **Happy path** — mock repo returns data, assert result shape + repo called with expected args
2. **Not-found** — repo returns `null`, expect `NotFoundException` with the right `ERROR_CODES` value
3. **Forbidden** — call as a role that must be rejected (e.g. `ENTREPRENEUR` on someone else's store), expect `ForbiddenException`
4. **Conflict / invalid state** — duplicate create, already-submitted, etc., expect `ConflictException` / `BadRequestException`

### Assertion Rules

- Assert exceptions with class from `@common/exceptions/app.exception` — never NestJS built-ins:
  ```ts
  await expect(service.getStore('missing-id', adminPayload)).rejects.toThrow(NotFoundException);
  ```
- Assert error code when the method can throw the same exception class for different reasons
- Assert `repository.method` was/wasn't called (`toHaveBeenCalledWith`, `not.toHaveBeenCalled`) for guard-clause paths
- Never import or mock `PrismaService` in unit specs — if you need it, the code under test violates the repository rule; flag that instead

### JWT Payload Fixtures

```ts
const adminPayload = { sub: 'user-1', email: 'admin@example.com', role: Role.ADMIN };
const entrepreneurPayload = { sub: 'user-2', email: 'owner@example.com', role: Role.ENTREPRENEUR };
```

## Run

```bash
npm run test -- <name>.service.spec.ts
```

## Output

Show which methods got specs and which of the 4 cases each has. If a case doesn't apply (e.g. public method with no RBAC → no forbidden case), say so explicitly rather than silently skipping.
