# Product R8.4 — local implementation QA

## Scope completed locally

- One additive migration: `20260829_0073_patient_portal_deliverables.sql`.
- Patient-scoped orientation publications with immutable delivery snapshots.
- Private patient-file metadata and a Vercel Node Cloudflare R2 S3-compatible contract.
- Admin upload starts as `PRIVATE`; publication/revocation is explicit.
- Portal list and download routes derive identity from the server-side portal session. Download metadata is scoped by both patient and file ID before the private object is read.

## Runtime storage contract

Server-only Vercel configuration: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_PATIENT_FILES_BUCKET`. No `NEXT_PUBLIC_` variable, Worker global binding, public URL, or persisted presigned URL is used. Missing storage configuration/provider failure returns generic 503; authorization remains server-side before stream access.

## Checks

- Focused R2/storage/authorization tests: PASS, 9/9.
- `npm run lint`: PASS.
- `npx tsc --noEmit --incremental false`: PASS.
- `npm run migrate:d1:check`: PASS, 74 migrations validated.
- `npm run build`: compiled successfully with Next 16.3/Turbopack. This output mode does not produce `.next/BUILD_ID`; build freshness now derives `manifest-11170774a544d351` from required `.next/build-manifest.json`, recorded with current git SHA in `.next/e2e-build-info.json`.

## Explicitly not performed

- No R2 bucket was created or configured remotely.
- No remote R8.4 migration was applied.
- No production object or patient data was written.
