# Product R8.4 — local implementation QA

## Scope completed locally

- One additive migration: `20260829_0073_patient_portal_deliverables.sql`.
- Patient-scoped orientation publications with immutable delivery snapshots.
- Private patient-file metadata and a single `PATIENT_FILES_BUCKET` R2 contract.
- Admin upload starts as `PRIVATE`; publication/revocation is explicit.
- Portal list and download routes derive identity from the server-side portal session. Download metadata is scoped by both patient and file ID before the private object is read.

## Checks

- `npm test -- --run tests/patient-files-storage.test.ts tests/patient-files-authorization.test.ts`: PASS, 3/3.
- Changed-file ESLint: PASS (no errors).
- `npm run migrate:d1:check`: PASS, 74 migrations validated.
- Full-worktree ESLint could not finish within the desktop command's 30-second interactive execution cap; this is an environment execution limit, not a reported lint error.

## Explicitly not performed

- No R2 bucket was created or configured remotely.
- No remote R8.4 migration was applied.
- No production object or patient data was written.
