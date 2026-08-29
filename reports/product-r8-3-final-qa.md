# Product R8.3 — Final QA log

## Meal-plan draft suite observation

- Full-suite observation: `tests/ai-meal-plan-draft-agent.test.ts` had one failure in the initial parallel `vitest run`.
- Isolated reproduction: `npx vitest run tests/ai-meal-plan-draft-agent.test.ts --reporter=verbose` passed **26/26**.
- R8.3 made no changes to Meal Plan, Nutrition Engine, Consultation, or Clinical Copilot code.
- Official-gate retry: `npx vitest run --reporter=dot` passed with **243 test files / 2,049 tests** in **37.23s**. The prior failure did not recur. A final post-auth-guard run also passed **243 / 2,049** in **51.77s**.
- Classification: `UNKNOWN_FLAKE` — possible concurrency or test-environment instability. It was not reproducible on the isolated run or on the complete retry, so worker/timing/fixture/DB/trace/screenshot/request-log capture was not applicable. No product or test-infrastructure fix is justified without deterministic reproduction.

MEAL_PLAN_DRAFT_ISOLATED: 26/26 PASS
MEAL_PLAN_CODE_CHANGED_BY_R8_3: nao
FULL_SUITE_FLAKE_CLASSIFICATION: UNKNOWN_FLAKE
DETERMINISTIC_R8_3_REGRESSION: nao
PRODUCT_R8_3_CLINICAL_REGRESSION: PASS

## Portal authentication and deployment compatibility

- The final E2E migration uses `createActivePortalAccess`, then the real `/api/portal/login` password/session lifecycle. It no longer uses the retired raw `code` contract or injects a portal session.
- Focused E2E validation: **38/38 passed** on Chromium Desktop across the portal, active delivery, publication gate, substitutions, AI guardrails, and meal-plan compatibility specs.
- A production observation showed `GET /api/admin/clients/:id/portal-access` returning HTTP 500 before the R8.3 migration was applied. The cause was a read of R8.3 session/schema fields unavailable in the older database.
- The endpoint now performs a read-only schema readiness check. Before the approved migration it returns a safe `schema_ready: false` state, disables portal actions in the workspace, and returns HTTP 409 for attempted mutations. No remote migration was applied and no credential, session, or clinical record was changed.
- React error #418 was traced to server/browser date formatting using different local time zones during hydration. Workspace date formatting is now deterministic in `America/Sao_Paulo`, while date-only values remain calendar dates.
- Verification after both corrections: `npx tsc --noEmit`, the temporary-password security test, and `npm run build` passed.
