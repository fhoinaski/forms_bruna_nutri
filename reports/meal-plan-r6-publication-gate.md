# Meal Plan R6 - Publication Gate

Data: 2026-08-23

## Resultado

MEAL_PLAN_R6_READY = sim

O modulo agora possui gate central de publicacao com validacao clinica e funcional antes de expor o plano como ativo no portal do paciente.

## Marcadores

- R6_CENTRAL_VALIDATOR: PASS
- R6_BLOCKERS_ENFORCED: PASS
- R6_WARNINGS_NON_BLOCKING: PASS
- R6_RESTRICTION_VALIDATION: PASS
- R6_STALE_EXCHANGE_BLOCK: PASS
- R6_REVIEW_UX: PASS
- R6_API_ENFORCEMENT: PASS
- R6_CONCURRENCY_REVALIDATION: PASS
- R6_PUBLICATION_TRANSACTION: PASS
- R6_ACTIVE_DELIVERY_AFTER_PUBLISH: PASS
- R6_R1_REGRESSION: PASS
- R6_R2_REGRESSION: PASS
- R6_R3_REGRESSION: PASS
- R6_R4_REGRESSION: PASS
- R6_R5_REGRESSION: PASS
- R6_VISUAL_REVIEW_READY: sim
- R6_FULL_GATES: PASS
- MEAL_PLAN_R6_READY: sim

## Contrato de Validacao

`validateMealPlanForPublication(plan)` retorna:

- `valid`: booleano derivado de blockers;
- `blockers`: problemas que impedem publish;
- `warnings`: avisos que exigem revisao, mas nao bloqueiam a API por si;
- `summary`: totais funcionais para UI e auditoria;
- `nutritionSummary`: energia/macros/fibra calculados;
- `mealSummary`: contagem de problemas por refeicao.

O validador nao usa IA, nao altera resolver de alimentos e nao modifica ranking ou listas curadas.

## Enforcement

- Review UX: `GET /api/admin/clients/[id]/meal-plans/[planId]/publication-review`.
- Publish: `PUT /api/admin/clients/[id]/meal-plans/[planId]` com `status=active`.
- A API revalida imediatamente antes do update.
- `expectedVersion` continua obrigando o cliente a rever o plano em caso de conflito.
- Publicacao bloqueada retorna `422 MEAL_PLAN_PUBLICATION_BLOCKED`.
- Conflito de versao retorna `409`.

## Auditoria

Eventos incluidos:

- `meal_plan_publication_blocked`: codigos e contagens de blockers/warnings, sem dados sensiveis do plano.
- `meal_plan_published`: registro de publicacao concluida.

## Cobertura Automatizada

Unit:

- `tests/meal-plan-r6-publication-gate.test.ts`
  - valido sem blockers;
  - alimento nao resolvido;
  - quantidade invalida;
  - troca aprovada stale;
  - alergia estruturada;
  - warning de meta energetica sem bloqueio.

E2E:

- `e2e/meal-plan-r6-publication-gate.spec.ts`
  - review all-good;
  - publish com portal recebendo `data-version-id` novo;
  - publish direto por API bloqueado;
  - alimento nao confirmado;
  - troca stale;
  - warning com confirmacao explicita;
  - conflito de versao apos review.

## Gates Executados

- `npm run ci:artifact-check`: PASS
- `npm run migrate:d1:check`: PASS, 67 migracoes validadas
- `npm run schema:runtime-check`: PASS
- `npm run lint`: PASS
- `npx tsc --noEmit`: PASS
- `npm test`: PASS, 203 arquivos / 1784 testes
- `npm run build`: PASS
- `npx vitest run tests/meal-plan-r6-publication-gate.test.ts`: PASS, 6 testes
- `npx playwright test e2e/meal-plan-r6-publication-gate.spec.ts`: PASS, 10 testes
- `npx playwright test e2e/meal-plan-r1-data-consistency.spec.ts e2e/meal-plan-r2-template-integrity.spec.ts e2e/meal-plan-r3-editor-ux.spec.ts e2e/meal-plan-r4-exchange-ux-quality.spec.ts e2e/meal-plan-r5-active-delivery.spec.ts e2e/meal-plan-r6-publication-gate.spec.ts`: PASS, 30 testes
- `npm run migrate:d1`: PASS, banco ja atualizado
