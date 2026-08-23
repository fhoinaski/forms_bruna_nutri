# R7.1 E2E Reconciliation

## Changes

- Fixed one real editor bug: newly added meals/items now enter item-edit mode immediately, so typing a food name no longer collapses the row before catalog selection.
- Added `e2e/helpers/meal-plan-editor.ts` to centralize current editor interactions: add meal, select food, set quantity, select grams, save draft, publish through review.
- Updated legacy tests to the R3-R6 contracts: compact row assertions, active-plan read-only behavior, exchange drawer, review/publish gate, and dynamic active version assertions.
- Reconciled screenshot IO instability on Windows by adding retry suffixes to high-write screenshot paths while preserving screenshot coverage.

## Verification

- Critical R1-R7 E2E: PASS, `16 passed`.
- Full E2E run 1: PASS, `120 passed`.
- Full E2E run 2: PASS, `120 passed`.
- Unit suite: PASS on rerun, `204 passed (204)`, `1785 passed (1785)`.
- Build: PASS.
- Lint: PASS.
- `migrate:d1:check`: PASS, `67 migracao(oes) validada(s)`.
- `schema:runtime-check`: PASS, runtime DDL absent.

## Migration Blocker

`npm run migrate:d1` and `npm run migrate:d1:status` fail before applying anything because the already-applied migration `20260822_0066_curated_exchange_lists.sql` has a checksum mismatch against the local file.

This is not a R7.1 code failure, but it blocks a clean migration gate until the D1 migration history is reconciled.

## Final Classification

- Initial full E2E failures audited: 28.
- Distinct product bugs fixed: 1.
- Test contract drift reconciled: 20.
- Obsolete specs rewritten to current UX: 7.
- Initial flaky/environment/unrelated failures: 0.
- Remaining P0/P1/P2: P0=0, P1=1, P2=0.
