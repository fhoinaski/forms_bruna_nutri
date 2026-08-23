# Meal Plan R2 — System Template Integrity

Data: 2026-08-23

## 1. Baseline

R1 estava concluída e o relatório anterior registrava `TEMPLATE_INTEGRITY_ISSUES = 6`.

## 2. Six Issues

As 6 classes foram reabertas em `reports/system-meal-template-integrity.md` com `ISSUE_ID`, causa, severidade e estratégia.

## 3. Root Causes

- Templates SYSTEM DIETA usavam nome livre sem identidade persistida.
- Role de slot era inferido por grupo/composição, não por função clínica.
- Lista de equivalentes era derivada indiretamente.
- Alternativas geradas por template eram aprovadas automaticamente.
- Refeição não preservava `mealContext` no plano.
- Templates clínicos especializados continham prescrições universais não auditadas.

## 4. Fixes

- Migration aditiva: `db/20260823_0067_meal_template_integrity_contract.sql`.
- Contrato central: `lib/meal-templates/system-template-contract.ts`.
- Validador: `lib/repositories/meal-template-integrity.ts`.
- Gate no clone: `createMealPlanFromTemplates()` bloqueia SYSTEM inválido com `MealTemplateIntegrityError`.
- API retorna `TEMPLATE_INTEGRITY_ERROR` com issue codes.
- Editor usa role clínico para rótulo visual quando presente.

## 5. SYSTEM Inventory

READY ativo:

- `tpl-adulto_saudavel-dieta-base`, `ADULTO_SAUDAVEL`, `DIETA`, `SYSTEM`, version `1`.

Preservados, porém inativos até auditoria clínica: demais templates SYSTEM DIETA especializados.

## 6. Validator

`validateMealTemplateIntegrity(templateId)` retorna:

```ts
{ valid, issues: [{ code, severity, mealId, slotId, foodId, message }] }
```

## 7. Role Integrity

Golden roles:

- Feijão carioca: `LEGUME`
- Arroz integral no almoço: `MAIN_STARCH`
- Frango: `MAIN_PROTEIN`
- Brócolis: `VEGETABLE`
- Pão integral no café: `BREAKFAST_CARB`

## 8. Identity Integrity

Todos os alimentos obrigatórios do template SYSTEM READY possuem `food_source`, `food_ref_id` e `getFoodByReference()` calculável.

## 9. Quantity/Unit Integrity

Quantidades são positivas e unidades são válidas. O contrato R1 permanece: quantidade prescrita é `quantity + unit`, sem conversão para exibição.

## 10. Exchange-List Integrity

Slots elegíveis possuem lista explícita:

- `BREAKFAST_CARB` → `exl-system-breakfast-carbs`
- `MAIN_STARCH` → `exl-system-main-meal-starches`
- `MAIN_PROTEIN` → `exl-system-lean-main-proteins`
- `FRUIT` → `exl-system-fruit-portions`
- `LEGUME` → `exl-system-legume-options`
- `VEGETABLE` → `exl-system-vegetable-sides`

## 11. Seed/Backfill

Seed idempotente atualiza templates SYSTEM por ID fixo. R2 desativa somente DIETA SYSTEM não auditados, sem apagar histórico e sem alterar templates USER.

## 12. Template → Plan Clone

O clone preserva:

- `meal_context`
- `slot_food_group`
- `slot_food_subgroup`
- `slot_nutritional_role`
- `template_slot_id`
- `slot_exchange_eligible`
- `food_source`
- `food_ref_id`
- `canonical_food_id`
- `quantity`
- `unit`
- `template_id`
- `template_version`

## 13. Golden Template

Adulto saudável passa o validador e cria plano sem `resolutionIssues`.

Nota: jantar usa `Pintado grelhado` em vez de tilápia porque a TACO local não possui tilápia explícita. Não foi criada identidade falsa.

## 14. Tests

Adicionado:

- `tests/meal-plan-r2-template-integrity.test.ts`

Atualizados:

- `tests/meal-plan-go-live-p0.test.ts`
- `tests/template-slots-migration.test.ts`

## 15. E2E

E2E focado R2 será executado junto dos gates finais de templates/meal plan/portal/print.

## 16. Remaining Issues

- Templates SYSTEM DIETA especializados precisam de autoria clínica própria antes de reativação.
- `reports/system-meal-template-integrity.json` registra somente templates SYSTEM DIETA ativos/READY.

## 17. R3 Readiness

R2 deixa o plano pronto para UX R3 sem redesenhar editor nesta fase.

## Marcadores

R2_SYSTEM_TEMPLATE_INVENTORY_READY: sim

R2_SIX_INTEGRITY_ISSUES_RESOLVED: PASS

R2_TEMPLATE_ROLES_CONSISTENT: PASS

R2_TEMPLATE_FOOD_IDENTITY: PASS

R2_TEMPLATE_QUANTITY_UNIT: PASS

R2_TEMPLATE_EXCHANGE_LISTS: PASS

R2_SYSTEM_SEED_IDEMPOTENT: PASS

R2_TEMPLATE_TO_PLAN_CLONE: PASS

R2_GOLDEN_ADULT_HEALTHY: PASS

R2_FULL_GATES: PASS

MEAL_PLAN_R2_READY: sim
