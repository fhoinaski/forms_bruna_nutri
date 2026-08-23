# R7.1 Full E2E Failure Audit

Base log: `reports/meal-plan-r7-1-full-e2e-run-initial.log`

Initial result: 92 passed / 28 failed.

| # | Spec | Classification | Resolution |
|---|---|---|---|
| 1 | `meal-plan-ai-wizard-complete.spec.ts:26` | TEST_CONTRACT_DRIFT | Updated reload assertion for compact editor and replaced direct activation with review/publish. |
| 2 | `meal-plan-assistant-substitutions.spec.ts:130` | TEST_CONTRACT_DRIFT | Active plans are read-only; stale setup now changes status/version through the draft path. |
| 3 | `meal-plan-full-cycle.spec.ts:46` | TEST_CONTRACT_DRIFT | Replaced old food search/button selectors with current editor helpers and review/publish. |
| 4 | `meal-plan-recipe-portion-print.spec.ts:18` | TEST_CONTRACT_DRIFT | Replaced removed `ativar no portal` button with publication review flow. |
| 5 | `meal-plan-substitutions.spec.ts:45` | OBSOLETE_SPEC | Legacy inline substitutions panel replaced by R4 exchange drawer contract. |
| 6 | `meal-plan-substitutions.spec.ts:69` | OBSOLETE_SPEC | Manual substitution now covered through exchange group API + drawer persistence. |
| 7 | `meal-plan-substitutions.spec.ts:111` | TEST_CONTRACT_DRIFT | Food editor selectors updated for compact/edit modes; lock behavior preserved. |
| 8 | `meal-plan-substitutions.spec.ts:143` | OBSOLETE_SPEC | Print now exposes approved exchange groups, not legacy inline text. |
| 9 | `meal-plan-substitutions.spec.ts:185` | OBSOLETE_SPEC | Portal now uses `Trocas disponíveis`, not legacy approved substitutions heading. |
| 10 | `meal-plan-substitutions.spec.ts:221` | OBSOLETE_SPEC | Pilot rewritten against current exchange drawer/portal/print contract. |
| 11 | `meal-plan-substitutions.spec.ts:261` | OBSOLETE_SPEC | Mobile assertion updated to current drawer instead of removed inline panel. |
| 12 | `meal-plan-ux2.spec.ts:56` | REAL_BUG | New meal/item stopped being editable after text entry; fixed `editingItemKey` initialization. |
| 13 | `meal-plan-ux2.spec.ts:82` | TEST_CONTRACT_DRIFT | Compact/editor mixed state assertions updated. |
| 14 | `meal-plan-ux2.spec.ts:101` | TEST_CONTRACT_DRIFT | Duplicate item assertion now accounts for one edited input and one compact copy. |
| 15 | `meal-plan-ux2.spec.ts:118` | TEST_CONTRACT_DRIFT | Duplicated draft content asserted through current editable fields. |
| 16 | `meal-plan-ux2.spec.ts:144` | TEST_CONTRACT_DRIFT | Helper updated so setup reliably selects food in the current editor. |
| 17 | `meal-plan-ux2.spec.ts:177` | TEST_CONTRACT_DRIFT | Food search selector updated to current role/aria contract. |
| 18 | `meal-plan-ux2.spec.ts:199` | TEST_CONTRACT_DRIFT | Button label updated from alternatives to Trocas. |
| 19 | `meal-plan-ux2.spec.ts:226` | TEST_CONTRACT_DRIFT | New-meal helper updated for current editing behavior. |
| 20 | `meal-plan-ux2.spec.ts:246` | TEST_CONTRACT_DRIFT | Mobile measure selector updated to current `aria-label="Medida"`. |
| 21 | `meal-plan-wizard-ambiguity-resolution.spec.ts:20` | TEST_CONTRACT_DRIFT | Reload assertion updated for compact editor and technical-name commas. |
| 22 | `meal-plan-wizard-food-first.spec.ts:95` | TEST_CONTRACT_DRIFT | Publication flow updated to review/publish. |
| 23 | `meal-plan-wizard-preparation-review.spec.ts:17` | TEST_CONTRACT_DRIFT | Publication flow updated to review/publish. |
| 24 | `meal-plan.spec.ts:46` | TEST_CONTRACT_DRIFT | Food search and persistence assertions updated for compact editor. |
| 25 | `meal-plan.spec.ts:87` | TEST_CONTRACT_DRIFT | Active edit now creates a draft; version assertion made dynamic. |
| 26 | `meal-plan.spec.ts:118` | TEST_CONTRACT_DRIFT | Measure persistence now opens edit mode before asserting the select. |
| 27 | `meal-plan.spec.ts:188` | TEST_CONTRACT_DRIFT | Custom food persistence asserted in compact row text. |
| 28 | `meal-plan.spec.ts:234` | TEST_CONTRACT_DRIFT | USDA persistence asserted in compact row text. |

Summary:

- REAL_BUG: 1
- TEST_CONTRACT_DRIFT: 20
- OBSOLETE_SPEC: 7
- FLAKY: 0
- ENVIRONMENT: 0
- UNRELATED_EXISTING_FAILURE: 0
