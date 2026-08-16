# Deployment Runbook

## Scope

Normal deploys move code, validate schema compatibility, run safe migrations, and run read-only smoke checks.

`USDA_ALLOWLIST_V1` is a versioned data import. It must not run automatically in CI, staging deploys, or production deploys.

## GitHub Environments

Create two GitHub environments:

- `staging`
- `production`

Recommended protection:

- `staging`: restrict secrets to the staging D1 database and staging/preview URL.
- `production`: require manual approval before deployment, restrict deploy branch to `main`, and keep production secrets separate.

## Required Secrets

Set these per environment, never as ambiguous shared database IDs:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_API_TOKEN`
- `CLOUDFLARE_D1_DATABASE_ID`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `AUTH_SECRET`
- `MFA_ENCRYPTION_KEY`
- `CLIENT_PORTAL_SECRET`
- `BLOG_AGENT_TOKEN`
- `SMOKE_ADMIN_EMAIL` optional, for authenticated smoke
- `SMOKE_ADMIN_PASSWORD` optional, for authenticated smoke
- `SMOKE_ADMIN_MFA_CODE` optional, only if the smoke account has MFA enabled

Set this environment variable per environment:

- `EXPECTED_D1_DATABASE_NAME`: `forms_bruna_nutri_staging` for staging, `forms_bruna_nutri` for production.
- `NEXT_PUBLIC_BASE_URL`: environment URL.
- `PRODUCTION_DEPLOY_APPROVAL_CONFIGURED`: set to `true` in the `production` environment only after required reviewers/protection rules are configured. Production deploy fails before migration/deploy while this is absent or not `true`.

## PR Pipeline

`.github/workflows/ci.yml` runs on pull requests and `main` pushes:

- `npm ci`
- repository artifact check
- `npm run migrate:d1:check`
- `npm run schema:runtime-check`
- `npm run lint`
- `npm test`
- `npx tsc --noEmit --incremental false`
- `npm run build`
- desktop Playwright E2E

PR jobs use placeholder D1 env vars and do not write to a remote D1 database.

## Staging Pipeline

`.github/workflows/deploy.yml` starts after `CI` succeeds on `main`, or manually by `workflow_dispatch`.

Staging does:

- deterministic install
- artifact guard
- migration file validation
- apply migrations to the staging D1 database only
- `migrate:d1:status`
- build
- Vercel preview/staging deploy
- HTTP smoke
- read-only D1 USDA sanity

Staging deploy does not run `food-kb:usda-full-staging` or any allowlist import.

## Production Pipeline

Production starts only after staging completes and the `production` environment approval rules pass.

Production does:

- deterministic install
- artifact guard
- migration file validation
- pre-deploy read-only USDA sanity
- apply versioned migrations
- `migrate:d1:status`
- build
- Vercel production deploy
- HTTP smoke
- post-deploy read-only USDA sanity

Production sanity expects:

- `USDA_ALLOWLIST_V1` batch completed
- USDA foods: `2895`
- USDA nutrients: `85971`
- USDA FTS rows: `2895`
- orphan nutrients: `0`
- orphan FTS: `0`

## Migration Strategy

Schema migrations live in `db/` and are validated by `scripts/migrate-d1.mjs`.

Rules:

- PR only validates migration files.
- Staging applies migrations before smoke tests.
- Production applies migrations only after CI and staging smoke pass.
- Destructive DDL remains blocked unless the migration carries the explicit destructive marker already enforced by the migration checker.
- Production deploys use `concurrency: production-deploy` to avoid simultaneous migration runs.

## USDA Import Protection

The normal pipeline must never run:

- `npm run food-kb:usda-full-staging`
- `npm run food-kb:usda-staging-benchmark`
- `npm run food-kb:usda-pilot`
- `npm run food-kb:import`

USDA data rollback is manual only. The deploy pipeline checks the existing batch and row counts; it does not repair divergence by reimporting.

## Smoke Checks

HTTP smoke is implemented in `scripts/ci/http-smoke.mjs`.

Always checks:

- homepage
- `/api/health`

When smoke admin credentials are configured, it also checks:

- admin login
- dashboard access
- TACO search for `arroz`
- explicit USDA search for `rice`

D1 sanity is implemented in `scripts/ci/d1-usda-sanity.mjs` and is read-only.

## Rollback Strategy

App rollback:

- rollback to a previous Vercel deployment.
- do not alter D1 data during app rollback.

Schema rollback:

- avoid destructive migrations.
- prefer forward fixes.
- if a migration must be reverted, prepare a reviewed migration and run it through staging first.

USDA data rollback:

- manual operation only.
- remove exactly batch `USDA_ALLOWLIST_V1`.
- do not couple USDA data rollback to app deploy rollback.

Manual rollback SQL:

```sql
DELETE FROM food_catalog_usda_foods_fts
 WHERE food_id IN (
   SELECT id FROM food_catalog_usda_foods
    WHERE import_run_id = 'USDA_ALLOWLIST_V1'
 );

DELETE FROM food_catalog_usda_foods
 WHERE import_run_id = 'USDA_ALLOWLIST_V1';

UPDATE import_batches
   SET status = 'ROLLED_BACK',
       updated_at = CURRENT_TIMESTAMP
 WHERE id = 'USDA_ALLOWLIST_V1';
```

## Artifacts

Do not commit:

- `food_knowledge_base_v3.sqlite`
- pilot/staging SQLite exports
- `.sqlite`, `.sqlite3`, `.db`
- build/test artifacts
- `.env*`

`.gitignore` already blocks these classes. CI also runs `npm run ci:artifact-check` to reject tracked SQLite files and files larger than 10 MB.

## Manual Commands

Check migration files only:

```bash
npm run migrate:d1:check
```

Check D1 status for an explicitly selected database:

```bash
CLOUDFLARE_D1_DATABASE_ID=<database-id> npm run migrate:d1:status
```

Run read-only USDA sanity:

```bash
EXPECTED_D1_DATABASE_NAME=forms_bruna_nutri \
EXPECTED_USDA_FOODS=2895 \
EXPECTED_USDA_NUTRIENTS=85971 \
EXPECTED_USDA_FTS=2895 \
REQUIRE_USDA_BATCH=true \
npm run ci:d1-usda-sanity
```
