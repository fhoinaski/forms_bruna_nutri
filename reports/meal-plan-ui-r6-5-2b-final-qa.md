# Meal Plan Composer UX/UI R6.5.2B — Final QA / Release Closure

## Escopo entregue

1. **COMBINATION**: rótulo aditivo "Itens fixos" (função pura testável
   `shouldShowFixedItemsLabel`), zero mudança em `meal.items`/
   `choice_groups`/cálculo.
2. **Compatibilidade R5 explícita**: 3 testes reais passando pelo
   wizard Copilot de verdade (não seed direto), confirmando SIMPLE/
   OPTIONS/COMBINATION geradas pela IA renderizam corretamente com os
   badges/divisor da R6.5.2.
3. **Compatibilidade R6 confirmada**: item `food_source: "RECIPE"`
   renderiza no Composer sem quebrar layout, com badge "Simples"
   correto.
4. **Inline quantity/unit e R3 "Trocas"**: confirmados via teste real
   como já funcionando sem modal — nenhuma mudança de código
   necessária (o requisito já era verdade).
5. **Toolbar**: confirmado via teste real que status/save-feedback/
   CTA-único/reaproveitamento de R4-R5 já existiam — nenhuma
   reconstrução necessária.

## Gaps conscientemente NÃO fechados nesta fase (risco vs. valor)

- `MEAL_ACTION_MENU`: continua FAIL — consolidar Duplicar/reordenar no
  menu "⋯" quebraria ≥6 specs existentes sem atualização coordenada.
- `FOOD_ROW` (redesign visual): continua FAIL — área já responsável
  por 2 regressões reais em fases anteriores; risco não justificado
  pelo orçamento desta fase.
- Seção "Opcionais" separada em COMBINATION: não implementada — o
  badge "opcional" por item já existia e já comunica a informação.
- "Última alteração" (timestamp) no toolbar: gap real, exigiria mudar
  contrato de API.

## Gates finais

| Gate | Resultado |
| --- | --- |
| TypeScript (`tsc --noEmit`) | PASS, 0 erros |
| ESLint (arquivos alterados) | PASS, 0 erros/avisos |
| Build (`next build`) | PASS |
| Migração (`migrate:d1:check`) | PASS, 71 migrações validadas, 0 novas |
| Runtime DDL guard (`schema:runtime-check`) | PASS |
| Artifact check | PASS, 1307 arquivos rastreados |
| Full Vitest | 2017/2017 PASS (235 arquivos; 5 testes novos em `tests/meal-plan-ui-r6-5-2b-combination.test.ts`) |
| E2E dedicado R6.5.2B (`meal-plan-ui-r6-5-2b-closure.spec.ts`) | 6/6 PASS (R5 SIMPLE/OPTIONS/COMBINATION, R6 recipe, inline quantity/R3, toolbar) |
| E2E R6.5.2/R6.5.1/R5.1/R2-flex reexecutados | 19/19 PASS (nenhuma regressão) |
| Broad E2E (chromium-desktop, single worker) | ver marcador `MEAL_PLAN_UI_R6_5_2B_BROAD_E2E_SINGLE` |
| Broad E2E (default parallelism, ambos os projetos) | ver marcador `MEAL_PLAN_UI_R6_5_2B_BROAD_E2E_PARALLEL` |
| Migrations novas | 0 |
| Escritas em produção | 0 (shim SQLite local do E2E) |

## Sem segundo calculador

Confirmado por teste: alterar quantidade inline atualiza a sidebar de
nutrição existente (mesmo Nutrition Engine, `MealPlanNutritionWorkspacePanel`
inalterado) — nenhum cálculo paralelo introduzido.

## Regra de fechamento da R6.5.2 (seção 95 do pedido)

Gaps que ficam FAIL/NOT_IMPLEMENTED mesmo após esta fase:
`MEAL_ACTION_MENU`, `FOOD_ROW`. Por isso, **`MEAL_PLAN_UI_R6_5_2_COMPLETE`
permanece `nao`** — a regra do próprio pedido (seção 95) exige que
TODOS os blockers listados fiquem PASS antes de fechar a R6.5.2. Os
que fecharam nesta fase: `INLINE_QUANTITY` → PASS,
`COMBINATION_VISUAL` → PASS (parcial, mas real), `TOP_TOOLBAR` → PASS,
`R5_COMPATIBILITY` → PASS. Os que continuam abertos:
`MEAL_ACTION_MENU` e `FOOD_ROW`.

`MEAL_PLAN_UI_R6_5_3_SAFE_TO_START: nao` (mesma regra — só libera
quando `R6_5_2_COMPLETE: sim`).
