---
name: add-error-code
description: Add a new error code to ERROR_CODES in error-codes.const.ts — correct domain prefix, next free number, no duplicate values. Use when a new exception needs a code that doesn't exist yet.
---

# add-error-code

Add a new code to `src/common/constants/error-codes.const.ts` following the catalog in `.claude/rules/project-conventions.md` §Error Code Catalog.

## Instructions

1. **Pick the domain prefix** from the catalog (`AUTH_`, `USER_`, `STORE_`, `ASSESS_`, `FLAG_`, `PITCH_`, `IDP_`, `AUDIT_`, `PORT_`, `RANK_`, `RPT_`, `VALID_`, `PERM_`, `FILE_`, `DB_`, `SYS_`). One domain per code — if none fits, the catalog table in the rule needs a new row first; propose it to the user.

2. **Read the current file** and find the highest number used in that domain. New code = highest + 1, zero-padded to 3 digits. Numbers stay in 001–099 (`DB_999` is a legacy exception — don't copy it).

3. **Check for duplicate values** in the whole object before adding — two keys must never share the same code string. (Known existing violation: `VALID.BAD_REQUEST` and `VALID.VALIDATION_FAILED` are both `'VALID_001'` — don't add a third.)

4. **Key naming**: SCREAMING_SNAKE, describes the condition not the HTTP status — `NOT_FOUND`, `DUPLICATE`, `INVALID_STATE`, `ALREADY_SUBMITTED`. Not `ERROR_404`.

5. **Add to the domain's object**, keeping numeric order:

```ts
STORE: {
  NOT_FOUND: 'STORE_001',
  DUPLICATE: 'STORE_002',
  INVALID_PROVINCE: 'STORE_003',
  DOCUMENT_NOT_FOUND: 'STORE_004',
  COVER_NOT_FOUND: 'STORE_005',   // ← new
},
```

6. **New domain** (e.g. first `RANK_` code): add a new top-level object with a `// <Domain>` comment header matching the existing style, starting at `001`.

7. **Use it** via the constant, never the string:

```ts
import { ERROR_CODES } from '@constants/index';
throw new NotFoundException(ERROR_CODES.STORE.COVER_NOT_FOUND, 'Cover image not found');
```

## Rules

- Never renumber or delete an existing code — clients may already match on it
- Never reuse a number within a domain, even if its key was removed
- One code per distinct failure condition — don't overload one code with two meanings

## Output

Show the diff of `error-codes.const.ts` and the throw site(s) that use the new code.
