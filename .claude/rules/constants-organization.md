# Constants Organization

A constant belongs to exactly one of two places. Decide which before writing it.

---

## Module-Local Constants

A constant used only inside one `src/modules/<name>/` folder stays there —
declared at the top of the file that uses it (or a local `<name>.const.ts` if
several files in the same module need it).

```ts
// src/modules/assessment/assessment.service.ts
const TOTAL_QUESTIONS = 50;
```

```ts
// src/modules/assessment/assessment-scoring.util.ts
const MAX_SCORE_PER_QUESTION = 4;
```

These are domain rules specific to one module's business logic. They don't
belong in `common/` because no other module has a reason to import them.

---

## Shared Constants

A constant used by **more than one module**, or one that represents a
cross-cutting system limit (file size caps, pagination defaults, MIME
allow-lists), goes in `src/common/constants/`, never inline in a controller,
service, or repository.

```
src/common/constants/
├── index.ts               ← re-exports every file in this folder
├── error-codes.const.ts   ← ERROR_CODES
├── store.const.ts         ← STORE_TARGET_TOTAL
└── file-upload.const.ts   ← FILE_MAX_SIZE_BYTES, PHOTO_MIME_REGEX, ...
```

One file per concern, named `<concern>.const.ts`, always re-exported from
`index.ts`. Import from `@constants/index` — never a deep path into
`common/constants/`.

```ts
// ✓ src/modules/store/store.controller.ts
import { FILE_MAX_SIZE_BYTES, PHOTO_MIME_REGEX } from '@constants/index';
```

```ts
// ✗ Don't declare it again locally in the controller
const MAX_FILE_SIZE = 10 * 1024 * 1024;
```

```ts
// ✗ Don't reach past the barrel
import { FILE_MAX_SIZE_BYTES } from '@common/constants/file-upload.const';
```

---

## The Test: Would a Second Module Ever Need This?

- **Yes, and it's already used twice** → it belongs in `common/constants`
  right now. Two `10 * 1024 * 1024` literals in two controllers is not a
  coincidence — it's the same system limit, duplicated. Move it.
- **Yes, but only one module uses it today** → still fine to keep it local.
  Don't pre-emptively move something to `common/` "in case" another module
  needs it later — move it when a second module actually does.
- **No, it's inherent to one module's domain** (`TOTAL_QUESTIONS`,
  `MAX_SCORE_PER_QUESTION`, scoring thresholds) → keep it local. Moving
  domain-specific numbers into `common/` just to centralize them makes
  `common/constants` a junk drawer no one can navigate.

---

## Regex / Enum-like Constants

MIME-type allow-lists follow the same rule as numeric constants. If two
upload endpoints happen to accept the exact same file types, they should
import the **same regex constant** — not two regexes with identical bodies.
If they diverge in exactly one MIME type, they are two constants, not one
with a flag:

```ts
// ✓ Two real allow-lists, both named for what they gate
export const PHOTO_MIME_REGEX = /^image\/(jpeg|png|webp)$/;
export const STORE_DOCUMENT_MIME_REGEX = /^(image\/(jpeg|png|webp)|application\/pdf|...)$/;
```

---

## Checklist Before Adding a Constant

- [ ] Is this value already declared somewhere else in the codebase with the
      same meaning? If yes, import it — don't redeclare.
- [ ] Does more than one module need this, or is it a system-wide limit
      (size, timeout, pagination default)? → `src/common/constants/<concern>.const.ts`
- [ ] Is this specific to one module's business rules? → keep it local to
      that module
- [ ] New shared constant file is re-exported from `src/common/constants/index.ts`
- [ ] Imported via `@constants/index`, never a deep path
