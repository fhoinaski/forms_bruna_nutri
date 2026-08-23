# Meal Plan R1 - Data Consistency

Data: 2026-08-23
Baseline: `8eb5d45c6b7a7fd0d6165e6dc01bd69293d08cfb`

## 1. Root Causes

1. Print/portal sempre liam ACTIVE, enquanto o editor podia estar exibindo um rascunho recém-criado.
2. A quantidade clínica estava correta no banco, mas não havia helper central para separar quantidade prescrita de gramas nutricionais.
3. Não havia read model compartilhado com `planId`, `versionId`, `versionNumber`, status, quantidade prescrita, gramas nutricionais e alternativas aprovadas.
4. Impressão não tinha política explícita para prévia de rascunho.

## 2. Architecture Before

- Editor: `GET /meal-plans` e seleção local.
- Print: `getActiveMealPlan(id)` sempre.
- Portal: `getActiveMealPlan(clientId)` sempre.
- Quantidade: renderizada por helpers locais diferentes.
- Versionamento: `meal_plans.id + meal_plans.version`, com histórico em `meal_plan_versions`.

## 3. Architecture After

- Quantidade prescrita centralizada em `lib/nutrition/prescribed-quantity.ts`.
- Lookup semântico em `lib/repositories/meal-plans.ts`:
  - `getActiveMealPlanVersion(clientId)`
  - `getMealPlanVersionById(planId)`
- Read model em `lib/repositories/meal-plan-view-model.ts`.
- Print:
  - sem `planId`: impressão oficial ACTIVE;
  - com `planId`: prévia explícita do plano solicitado;
  - `planId` inválido/de outro paciente: `notFound`, sem fallback.
- Portal:
  - continua somente ACTIVE via função única.
- Editor:
  - mantém layout atual;
  - adiciona ação explícita "Imprimir ativo" ou "Prévia do rascunho";
  - indica que rascunho não altera portal/print oficial até ativar.

## 4. Quantity Contract

Fonte canônica:

- `meal_plan_items.quantity`
- `meal_plan_items.unit`

Contrato:

- Editor mostra esses campos.
- Save persiste esses campos.
- Reload hidrata esses campos.
- Print/portal exibem esses campos por `formatPrescribedQuantity`.
- `toNutritionGrams` é cálculo, não apresentação.

## 5. Version Contract

Na R1 não houve migration. O contrato usa:

- `planId = meal_plans.id`
- `versionNumber = meal_plans.version`
- `versionId = planId:v{versionNumber}`

ACTIVE e DRAFT são planos separados quando coexistem na arquitetura atual. Publicar um draft arquiva o antigo active e ativa o plano selecionado.

## 6. ViewModel

Arquivo: `lib/repositories/meal-plan-view-model.ts`.

Contrato mínimo implementado:

- `planId`
- `versionId`
- `versionNumber`
- `status`
- `title`
- `nutritionSummary.sourceVersionId`
- refeições/itens com:
  - role
  - foodIdentity
  - displayName
  - prescribedQuantity
  - prescribedUnit
  - nutritionGrams
  - resolutionStatus
  - approvedAlternatives

Invariant:

- `nutritionSummary.sourceVersionId === viewModel.versionId`

## 7. Identity Contract

Estados R1:

- `RESOLVED`: identidade persistida e calculável por `getFoodByReference`.
- `NEEDS_CONFIRMATION`: identidade persistida, mas não calculável.
- `UNRESOLVED`: sem `food_source/food_ref_id`.

Pendências aparecem em `itemResolutionIssues[]`.

## 8. Editor Behavior

Sem redesign:

- mantém seleção por plano;
- mantém indicador `Ativo/Rascunho - vN`;
- adiciona aviso textual para rascunho;
- adiciona link de prévia explícita do rascunho via `planId`.

## 9. Portal

Portal usa somente ACTIVE por `getActiveMealPlanVersion`.

Teste coberto:

- active e draft separados preservam quantidades distintas;
- portal/read model active mantém ACTIVE.

## 10. Print

Política:

- `/print?secao=plano-alimentar`: ACTIVE.
- `/print?secao=plano-alimentar&planId=<id>`: plano solicitado como prévia.
- Sem fallback silencioso quando `planId` é inválido.

## 11. Exchange Ownership

R1 não alterou engine de trocas. O read model consome `getApprovedMealPlanAlternatives(plan)` pelo `plan.id`, garantindo que alternativas aprovadas do ACTIVE não vazem para DRAFT de outro `planId`.

Cobertura unitária adicionada para esse escopo.

## 12. Migrations

Nenhuma migration criada.

## 13. Tests

Adicionados:

- `tests/meal-plan-r1-data-consistency.test.ts`
- `e2e/meal-plan-r1-data-consistency.spec.ts`

Executados:

- `npx vitest run tests/meal-plan-r1-data-consistency.test.ts`
- `npx vitest run tests/meal-plan-r1-data-consistency.test.ts tests/meal-plan-substitution-parity.test.ts tests/meal-plan-go-live-p0.test.ts`
- `npx tsc --noEmit --incremental false`
- `npm run ci:artifact-check`
- `npm run migrate:d1:check`
- `npm run schema:runtime-check`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e -- e2e/meal-plan-r1-data-consistency.spec.ts --project=chromium-desktop`
- `npm run test:e2e -- e2e/meal-plan-versioning.spec.ts e2e/meal-plan.spec.ts e2e/patient-portal.spec.ts e2e/meal-plan-recipe-portion-print.spec.ts --project=chromium-desktop`

E2E isolado inicialmente falhou como `ENVIRONMENT/TEST_BUG` porque o webserver usa `next start` e a primeira execução rodou contra build `.next` antigo. Após `npm run build`, o E2E R1 passou. Houve também ajuste de teste por strict mode (`50 g` casava dentro de `150 g`) e por o portal usar "Plano alimentar" como rótulo, não heading.

## 14. Known Remaining Issues

- Templates de sistema ainda não têm identidade autorada; isso fica para fase posterior.
- Não foi criada entidade separada de published snapshot.
- Histórico `meal_plan_versions` continua snapshot auditável, mas print/portal usam plano corrente ACTIVE.
- Exchange groups continuam ligados a `meal_plan_id`; se uma futura lógica clonar planos com alternativas, R2/R3 deve tratar cópia profunda.

## 15. R2 Readiness

R1 pronta para revisão. Não iniciar R2 sem aprovação.

## Markers R1

- `R1_QUANTITY_CONTRACT_READY: sim`
- `R1_ACTIVE_DRAFT_CONSISTENCY: PASS`
- `R1_EDITOR_SAVE_RELOAD_PARITY: PASS`
- `R1_EDITOR_PORTAL_PARITY: PASS`
- `R1_EDITOR_PRINT_PARITY: PASS`
- `R1_FOOD_IDENTITY_CONSISTENCY: PASS`
- `R1_EXCHANGE_VERSION_OWNERSHIP: PASS`
- `R1_GOLDEN_PLAN_EXACT_QUANTITIES: PASS`
- `R1_FULL_GATES: PASS`
- `MEAL_PLAN_R1_READY: sim`
