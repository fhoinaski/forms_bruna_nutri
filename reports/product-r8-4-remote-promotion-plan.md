# R8.4 — Remote promotion plan (read-only audit)

Audit date: 2026-08-30. Scope: repository and deployment configuration inspection only. No remote command was run because this checkout has neither Cloudflare credentials nor a configured Cloudflare deployment client. Remote mutations: **0**.

## 1. Remote architecture

| Component | Evidence | Actual configuration |
| --- | --- | --- |
| FRONTEND_RUNTIME | `package.json`, `next.config.ts` | Next.js 16 / React 19, Node.js runtime routes. |
| BACKEND_RUNTIME | App Router route handlers declare `runtime = "nodejs"` | Same Next.js application process. |
| D1_RUNTIME | `lib/d1/client.ts` | Cloudflare D1 HTTP API, configured by `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, and `CLOUDFLARE_D1_API_TOKEN`; it is not a Worker binding. |
| R2_RUNTIME | `lib/storage/patient-files.ts` | Vercel Node adapter using Cloudflare R2's S3-compatible API and server-only `R2_*` credentials; no Worker global binding. |
| DEPLOY_PLATFORM | `.github/workflows/deploy.yml` | Vercel: preview via `vercel deploy`, production via `vercel deploy --prod`. |
| DEPLOY_WORKFLOW | `.github/workflows/ci.yml`, `.github/workflows/deploy.yml` | CI on `main`; deploy workflow starts after successful CI on `main` or manually. |

No `wrangler.toml`, `wrangler.json`, `wrangler.jsonc`, Cloudflare Worker/Pages project configuration, or R2 adapter exists in the repository. A Vercel Node runtime does not receive a Cloudflare Worker `globalThis.PATIENT_FILES_BUCKET` binding. This is a deterministic operational incompatibility: provisioning an R2 bucket alone cannot make the current Vercel deployment serve the R8.4 file routes.

## 2. Environment identity

`REMOTE_ENVIRONMENT: unknown`
`REMOTE_ENVIRONMENT_CONFIDENCE: LOW`

The repository specifies intended identities, not observed remote state: the runbook requires `forms_bruna_nutri_staging` in GitHub Environment `staging` and `forms_bruna_nutri` in `production`. The checkout has no `.env.local` and none of the three Cloudflare credentials is exported. GitHub Environment secrets, Vercel project/environment bindings, Cloudflare account configuration, and current deployments were therefore not readable here.

The historical D1 ID `5a1f3b97-ba6f-48b0-af09-811117d67d68` is not asserted as a current target. No Worker/project name or remote R2 binding can be established from current configuration.

## 3. D1 state

- Binding name in application code: no Worker binding; HTTP configuration variables above.
- D1 database name/ID/environment: **unknown remotely**.
- No repository migration command was used. `migrate:d1:status` is **not read-only**: its script first executes `CREATE TABLE IF NOT EXISTS schema_migrations`; it is forbidden for a remote audit.
- Safe future read-only check, after read-only credential authorization: query only `sqlite_master`, `PRAGMA table_info(...)`, and an already-existing `schema_migrations` table. Do not invoke the repository migration runner.

## 4. Migration 0073 state

Migration: `db/20260829_0073_patient_portal_deliverables.sql`.

- `MIGRATION_0073_METADATA_PRESENT: unknown`
- `MIGRATION_0073_SCHEMA_PRESENT: unknown`
- Additive only: **yes**. It creates `patient_education_publications` and `patient_files`, three indexes, foreign keys, `DRAFT`/`PRIVATE` defaults, and check constraints.
- Existing rows modified: **no**; automatic patient publication: **no**; automatic file publication: **no**; destructive operation: **no**.

Before a future promotion, run only this read-only SQL against an explicitly identified target:

```sql
SELECT name, type FROM sqlite_master
WHERE name IN ('schema_migrations', 'patient_education_publications', 'patient_files',
               'idx_patient_education_publications_patient_status',
               'idx_patient_education_publications_card', 'idx_patient_files_patient_status');
PRAGMA table_info(patient_education_publications);
PRAGMA table_info(patient_files);
SELECT id, checksum, applied_at FROM schema_migrations
WHERE id = '20260829_0073_patient_portal_deliverables.sql';
```

The final statement must be omitted if `schema_migrations` does not already exist. These checks distinguish metadata from actual schema.

## 5. R2 state

- `R2_BUCKET_REQUIRED: yes`
- `R2_BUCKET_PRESENT: unknown`
- No bucket name, bucket purpose, public domain, or Cloudflare R2 configuration is present locally.
- A bucket must not be reused if its purpose is unclear. Preferred separate private buckets: `bruna-nutri-patient-files-staging` and `bruna-nutri-patient-files-production`.
- Required posture: no public custom domain, no anonymous access, application-only credentials/binding, opaque keys, no persistent signed URLs, and no patient information in a bucket name. Object keys are already opaque enough at the filename layer (`patients/{patient-id}/{file-id}/document.ext`); object listing must remain unavailable to clients.

## 6. PATIENT_FILES_BUCKET state

- Local config: absent.
- Staging config: unknown.
- Production config: unknown.
- Worker runtime configuration: absent from the repository.

The implementation fails closed: uploads/downloads call `getPatientFilesBucket()` and throw if the binding is unavailable; it does not create storage or return public URLs. Portal list endpoints expose only `PUBLISHED` records and omit `object_key`; unauthorized download is `401`, unpublished/non-owned records are `404`. The portal page converts failed list requests to empty lists, so unrelated portal functions continue, but admin/portal deliverables routes require the migration tables at request time and will error if migration 0073 is missing.

**Resolved by AUTH_0 locally:** R8.4 now uses a reviewed server-side R2 S3-compatible Node adapter, with `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_PATIENT_FILES_BUCKET` expected only in Vercel server configuration. It no longer depends on a Worker global binding. Remote bucket, credentials, and Vercel variables remain unprovisioned.

## 7. Current deployment state

Code evidence: SHA `a98a1e963f7e385b685a4fe079fdd6c7630e734e` is reachable from `origin/main` (current known main `2c023c951d70b362ad1f76c0525bb79eb96ac833`); CI #149 for that exact SHA is reported successful.

- `R8_4_MAIN_DEPLOYED_TO_STAGING: unknown`
- `R8_4_MAIN_DEPLOYED_TO_PRODUCTION: unknown`

After CI succeeds on `main`, the workflow applies migrations to `staging`, deploys a Vercel preview, runs HTTP smoke and read-only D1 sanity. Production depends on staging and the GitHub `production` Environment; it additionally checks `PRODUCTION_DEPLOY_APPROVAL_CONFIGURED == true`, then applies production migrations, deploys Vercel production, and runs smoke/sanity. The workflow contains no R2 provisioning or binding action.

## 8. Safe promotion order

1. **Read-only identity gate:** identify the exact staging and production Vercel projects, GitHub Environment secrets, Cloudflare account, D1 name/ID, and existing R2 buckets/bindings.
2. **A — provision:** create one new private bucket per environment only after its purpose/name is approved.
3. **B — configure:** configure the server-only R2 S3 credentials and `R2_PATIENT_FILES_BUCKET` separately in Vercel staging/production; verify no public domain/policy.
4. **C — schema:** apply 0073 to staging, verify migration metadata and schema with read-only SQL, then promote through the protected production workflow.
5. **D — deploy:** deploy the exact compatible, CI-approved code through staging and then protected production.
6. **E — smoke:** use only a synthetic, explicitly authorized test patient and harmless small file.

Migration must be available before any traffic reaches deliverables list/admin routes; a functional storage adapter/binding must be available before upload/download smoke. The current main deployment should avoid operating this feature until both are true.

## 9. First remote mutation

No executable remote mutation command is safe until the deployment-runtime decision is made. The first authorized mutation **after** that decision should be:

```bash
npx wrangler r2 bucket create bruna-nutri-patient-files-staging
```

This command is illustrative only, was **not run**, and applies only if the approved architecture uses Cloudflare’s binding model. For a Vercel-compatible adapter, bucket provisioning should use the organization’s approved Cloudflare API/IaC path instead. Stop before either action until `AUTH_A` is granted.

## 10. Risks

- Current runtime/binding mismatch makes every file upload/download unavailable; bucket creation alone would not fix it.
- Staging/production D1 identities cannot be verified from checkout configuration; never reuse the historical ID by assumption.
- The deploy workflow applies migrations automatically once it receives environment secrets. Confirm environment separation and reviewers before triggering it.
- Migration 0073 missing while R8.4 routes are live produces database errors in deliverables endpoints (the portal UI degrades to empty sections, but admin routes do not provide a schema fallback).
- R2 objects and metadata may be sensitive health-related material; no staging write may target production storage.
- Current application limit is 10 MiB per file and accepts PDF, JPEG, PNG, and WEBP. Platform request limits and current R2 policies remain unverified remotely.

## 11. Rollback

- **Application:** use Vercel’s prior successful deployment rollback; do not change D1 data as part of an app rollback.
- **Schema:** retain the additive 0073 tables; prefer a reviewed forward fix rather than destructive rollback.
- **Storage:** remove the runtime binding/credentials or roll back the application route; preserve bucket and objects. Do not delete patient objects as normal rollback.
- **Observability:** inspect Vercel deployment/function errors and Cloudflare audit/R2 errors with request IDs only. Logs must exclude tokens, cookies, signed URLs, file contents, object keys tied to patients, and patient metadata.

## 12. Smoke test plan

Do not execute until all authorizations are granted.

1. Select a synthetic, explicitly authorized test patient; do not use a clinical document.
2. Admin uploads a harmless small PDF/image and verifies status `PRIVATE`.
3. Confirm the authenticated patient cannot list or download it.
4. Publish it; authenticate as that patient; verify listing and protected download.
5. Revoke it; verify it disappears and the direct download route returns denied/not found.
6. Publish a test orientation, verify the patient sees its snapshot, change only a safe test catalog fixture if authorized, verify snapshot immutability, then revoke and verify hiding.
7. Review Vercel/Cloudflare errors without sensitive payloads; confirm no public object URL/domain was created.

## 13. Required authorizations

- `AUTH_0`: select and authorize the runtime architecture/adaptor needed to make private R2 usable from the Vercel deployment (this is a code/config change, not authorized by this audit).
- `AUTH_A`: create dedicated private staging/production R2 buckets.
- `AUTH_B`: configure the selected runtime’s `PATIENT_FILES_BUCKET` capability/credentials separately per environment.
- `AUTH_C`: apply migration `20260829_0073_patient_portal_deliverables.sql` to explicitly identified staging, then production.
- `AUTH_D`: deploy/redeploy the compatible code through the protected Vercel workflow.
- `AUTH_E`: perform synthetic-patient smoke-test writes/uploads/publication/revocation.

## Final markers

```text
PRODUCT_R8_4_CODE_RELEASE_READY: sim
PRODUCT_R8_4_CI_EXACT_REVISION: PASS
PRODUCT_R8_4_REMOTE_ENVIRONMENT: unknown
PRODUCT_R8_4_REMOTE_ENVIRONMENT_CONFIDENCE: LOW
PRODUCT_R8_4_REMOTE_D1_DATABASE: unknown
PRODUCT_R8_4_MIGRATION_0073_REMOTE_PRESENT: unknown
PRODUCT_R8_4_R2_BUCKET_REQUIRED: sim
PRODUCT_R8_4_R2_BUCKET_PRESENT: unknown
PRODUCT_R8_4_PATIENT_FILES_BINDING_PRESENT: unknown
PRODUCT_R8_4_MAIN_DEPLOYED: unknown
PRODUCT_R8_4_REMOTE_PROMOTION_PLAN_READY: sim
PRODUCT_R8_4_REMOTE_MUTATIONS_THIS_RUN: 0
PRODUCT_R8_4_PRODUCTION_STORAGE_WRITES: 0
PRODUCT_R8_4_REMOTE_SCHEMA_PROMOTED: nao
PRODUCT_R8_4_COMPLETE: nao
PRODUCT_R8_5_SAFE_TO_START: nao
```
