# Meal Plan E2E Coverage Matrix

| Area | Coverage | Evidence |
|---|---|---|
| R1 data consistency | active/draft isolation, portal/print isolation | `e2e/meal-plan-r1-data-consistency.spec.ts` |
| R2 templates | Adulto saudável integrity, save/reload/publish | `e2e/meal-plan-r2-template-integrity.spec.ts` |
| R3 editor UX | compact rows, read-only active, edit drawer access | `e2e/meal-plan-r3-editor-ux.spec.ts`, `e2e/meal-plan-ux2.spec.ts` |
| R4 exchange UX | drawer, approved/suggested lists, manual add, stale exchange | `e2e/meal-plan-r4-exchange-ux-quality.spec.ts`, `e2e/meal-plan-substitutions.spec.ts` |
| R5 active delivery | portal/print active plan, approved exchanges, draft isolation | `e2e/meal-plan-r5-active-delivery.spec.ts` |
| R6 publication gate | blockers, warnings, version conflict, review/publish | `e2e/meal-plan-r6-publication-gate.spec.ts` |
| R7 final QA | golden end-to-end workflow, responsive portal/print/security | `e2e/meal-plan-r7-final-qa.spec.ts` |
| Wizard | deterministic AI draft, ambiguity, recipe/preparation review | `e2e/meal-plan-ai-wizard-complete.spec.ts`, `e2e/meal-plan-wizard-*` |
| Assistant | deterministic substitution router read/write/stale | `e2e/meal-plan-assistant-substitutions.spec.ts` |
| Catalog references | TACO, custom, USDA linked foods persist after reload | `e2e/meal-plan.spec.ts` |

Final E2E evidence:

- Critical R1-R7: `16 passed` in `reports/meal-plan-r7-1-critical-e2e.log`.
- Full E2E run 1: `120 passed` in `reports/meal-plan-r7-1-full-e2e-run-1.log`.
- Full E2E run 2: `120 passed` in `reports/meal-plan-r7-1-full-e2e-run-2.log`.
