# API Contract — Keep the Web App in Sync

The frontend lives in a sibling repo: `../thai-rap-web` (Next.js). It mirrors
this API's wire format in its own code — mocks, types, and upload `accept`
attributes. Any change to what goes over the wire is a **two-repo change**.

---

## Changes That Require a Web-Side Sweep

| API change | Where to check in `../thai-rap-web` |
|------------|--------------------------------------|
| Error code value or meaning (`ERROR_CODES`) | `mocks/handlers/*.ts` (MSW handlers return hardcoded codes), any UI matching on `error.code` |
| Response shape (fields added/removed/renamed, envelope) | `types/`, `features/*/types/*.types.ts`, `mocks/handlers/` |
| Upload MIME allow-list or size limit (`file-upload.const.ts`) | `accept="..."` attributes in `features/*/components/`, `utils/validate-file-size.ts` |
| Route path, method, or status code | `features/*/services/*.service.ts`, `mocks/handlers/` |
| Enum values (Role, status, Round, zone names) | `types/`, `constants/` |
| Validation limits (`@Max`, `@MaxLength`, ...) | form validation in `features/*/components/` |

Search the web repo before declaring the change done:

```bash
grep -rn "<old-value>" ../thai-rap-web --include="*.ts" --include="*.tsx" --exclude-dir=node_modules
```

---

## Rules

- **Error codes are a public contract.** Never renumber, reuse, or repurpose
  an existing code — clients match on the string. Add a new code instead
  (see `/add-error-code`).
- **Browser `accept` is not validation.** The API-side MIME regex is the real
  gate; the web `accept` attribute is UX. They must still agree — a type the
  web offers but the API rejects is a bug, and vice versa.
- **MSW mocks are the web team's source of truth** for API behavior during
  frontend dev. A wire-format change that skips `mocks/handlers/` ships a lie
  to the frontend.
- If the change is breaking (removed field, changed code, tightened limit),
  say so explicitly in the summary so the user can coordinate deploys.

---

## Known Sync Points (as of 2026-07)

- 422 validation errors return `VALID_002` (`VALIDATION_FAILED`); generic 400
  is `VALID_001` (`BAD_REQUEST`). Web mock: `mocks/handlers/user.handlers.ts`.
- Store documents accept pdf / xlsx / docx / csv only (no images) — matches
  `accept` in `features/store/components/store-document-manager.tsx`.
