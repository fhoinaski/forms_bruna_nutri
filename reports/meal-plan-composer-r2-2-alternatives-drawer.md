# Meal Plan Composer R2.2 — Food Alternatives Drawer

## Domain audit (seções 25-30 do pedido)

Item-level alternatives **já existem** como domínio de primeira classe — "grupos de troca" (`lib/repositories/exchange-groups.ts`, Fase 7): `ExchangeGroupRow` (alimento principal + quantidade) e `ExchangeAlternativeRow` (`state`: `SUGGESTED` / `APPROVED` / `EDITED` / `REJECTED`), com rotas próprias (`POST/GET /api/admin/clients/[id]/meal-plans/exchange-groups`, `PATCH/DELETE .../exchange-groups/[groupId]` para `approve`/`reject`/`edit_quantity`/`add_manual`). Isso é completamente distinto de OPTIONS/COMBINATION (alternativas de **refeição**, Meal Flex) — nenhuma troca de item aqui vira "Opção 1 = refeição inteira". **Não havia gap de domínio**: nenhuma migration foi necessária.

O drawer lateral em si (`ExchangeGroupPanel` + o `<aside>` portal em `MealItemsEditor.tsx`) e a integração com o botão "X sugestões" (agora "N trocas"/"N sugestões", `mealPlanExchangeSummary`) **já existiam**, implementados numa rodada anterior não commitada. O trabalho desta fase foi auditar essa base contra os 58 itens do pedido, fechar os gaps reais e provar tudo com E2E.

`mealPlanExchangeSummary` combina duas fontes reais de contagem (nunca mock): `substitutions` legado (persistido no plano) e `exchange_group_alternatives` (persistido, Fase 7) — nunca IA calculando número, nunca estado transitório.

## Gaps encontrados e fechados

1. **Sem preview/delta antes de adicionar** (seções 15-22): clicar num resultado de busca chamava `add_manual` direto. Agora abre um preview (`FoodPreviewCard`) com quantidade editável (padrão = quantidade do alimento principal, nunca uma "equivalência" calculada) e uma tabela Energia/Carboidrato/Proteína/Gordura/Fibra com **candidato** e **diferença** (candidato − referência), via `/api/admin/foods/nutrients` (Nutrition Engine real, endpoint já existente — nenhum cálculo novo). Ausência de dado é sempre "—", nunca 0. "Adicionar" só confirma depois deste preview, sempre com `quantityGrams` explícito (nunca deixa a rota calcular "quantidade equivalente" sozinha — isso é R3).
2. **Busca sem tratamento de erro distinto** (seção 46): falha agora mostra "Não foi possível pesquisar agora." + "Tentar novamente", nunca fecha o drawer.
3. **Item recém-adicionado podia ficar oculto** atrás de "Ver mais" (lista de sugestões mostra só 3 por padrão): adicionar manualmente agora expande a lista automaticamente.
4. **Acessibilidade** (seção 42): focus trap (Tab/Shift+Tab não escapam do drawer), foco inicial no botão fechar ao abrir, Escape fecha e **devolve o foco** ao botão que abriu (antes ficava perdido).
5. **Mobile** (seção 40): drawer era sempre um painel lateral direito de largura total — virou folha inferior (`bottom sheet`, 85vh) abaixo de `sm:`, mantendo o painel lateral em telas maiores.
6. **`e2e/helpers/meal-plan-editor.ts#addMeal`** usava um seletor stale (`/^refeicao$/i`, sem "Adicionar" e sem cedilha) que nunca bateu com o botão real ("Adicionar refeição") — bloqueava 15 testes de regressão em 4 arquivos (`meal-plan.spec.ts`, `meal-plan-ux2.spec.ts`, `meal-plan-full-cycle.spec.ts`, `meal-plan-substitutions.spec.ts`), pré-existente e sem relação com este trabalho. Corrigido (1 linha).

## Achados adicionais na fase de fechamento (R2 Final Release Closure)

Durante o fechamento final da R2 (auditoria de plano grande + regressão ampla), foram encontrados e corrigidos dois bugs reais e pré-existentes, não introduzidos por R2.2/R2.3:

1. **N+1 no priming de sugestões**: `MealItemsEditor.tsx` disparava `GET /api/admin/foods/search` para CADA item ao montar a página (até 24 requisições simultâneas num plano de 37 itens), mesmo para itens já com identidade estruturada. Corrigido para só primar itens em texto livre sem identidade. Ver `reports/meal-plan-composer-r2-performance.md`.
2. **Hidratação de OPTIONS/COMBINATION nunca disparava**: os efeitos de hidratação em `MealPlanNutritionSummary.tsx` (busca por texto e busca de porções TBCA/IBGE_POF) tinham a dependência do `useEffect` presa a `meal.items` — nunca a `options`/`choice_groups`. Um item de texto livre dentro de uma alternativa nunca ganhava macro calculado, e a Live Nutrition mostrava um número fixo em vez da faixa min–max. Corrigido para depender de todos os itens (`allItems(meals)`), incluindo options/choice_groups.
3. **Booleanos vazando como inteiro cru do SQLite** em itens dentro de `options`/`choice_groups`: `lib/repositories/meal-plans.ts#hydrateMealPlans` fazia o spread cru da linha do banco (`{...item, is_optional: Boolean(...)}`) para esses itens, sem coagir `quantity_locked`/`substitutions_locked`/`slot_exchange_eligible` como fazia para itens de topo. Um ciclo completo de carregar→editar→salvar um plano com COMBINATION quebrava com `400 Invalid input: expected boolean, received number`. Corrigido com um mapeador único (`mapItemRowForResponse`) reaproveitado nos 3 lugares que leem itens.

## Fora de escopo desta fase (R3)

- Equivalência automática de quantidade (a rota `add_manual` já sabe calcular via `findFoodSubstitutes` quando `quantityGrams` é omitido — deliberadamente nunca usado pela UI da R2).
- "Comparar por" (critério de equivalência) — não implementado; o preview mostra a tabela completa de macros, energia é a comparação padrão implícita.

## Markers

```text
MEAL_PLAN_COMPOSER_R2_2_CURRENT_SUGGESTION_SOURCE: exchange_group_alternatives (state=SUGGESTED/EDITED) + substitutions legado — ambos persistidos, nunca mock/IA calculando número
MEAL_PLAN_COMPOSER_R2_2_DRAWER: PASS
MEAL_PLAN_COMPOSER_R2_2_REFERENCE_CONTEXT: PASS
MEAL_PLAN_COMPOSER_R2_2_FOOD_SEARCH_REUSE: PASS
MEAL_PLAN_COMPOSER_R2_2_CANONICAL_RESULTS: PASS
MEAL_PLAN_COMPOSER_R2_2_NUTRITION_ENGINE_AUTHORITY: PASS
MEAL_PLAN_COMPOSER_R2_2_DELTA: PASS
MEAL_PLAN_COMPOSER_R2_2_ITEM_LEVEL_ALTERNATIVE_DOMAIN: PASS
MEAL_PLAN_COMPOSER_R2_2_ADD_ALTERNATIVE: PASS
MEAL_PLAN_COMPOSER_R2_2_REMOVE_ALTERNATIVE: PASS
MEAL_PLAN_COMPOSER_R2_2_ALTERNATIVES_NOT_SUMMED: PASS
MEAL_PLAN_COMPOSER_R2_2_LIVE_NUTRITION: PASS
MEAL_PLAN_COMPOSER_R2_2_DESKTOP: PASS
MEAL_PLAN_COMPOSER_R2_2_MOBILE: PASS
MEAL_PLAN_COMPOSER_R2_2_ACCESSIBILITY: PASS
MEAL_PLAN_COMPOSER_R2_2_NEW_MIGRATIONS: 0
MEAL_PLAN_COMPOSER_R2_2_PRODUCTION_WRITES: 0
MEAL_PLAN_COMPOSER_R2_2_R3_EQUIVALENCE_READY: PASS
```

## Verificação

- TypeScript / ESLint dos arquivos alterados: PASS.
- `npm run test` (vitest): 1885/1885 (depois 1888/1888 com os testes da R2.3).
- E2E: `meal-plan-composer-r2-2-alternatives-drawer.spec.ts` (novo, 3/3), `meal-plan-r4-exchange-ux-quality.spec.ts` (3/3, pré-existente), `meal-plan-substitutions.spec.ts` (8/8, pré-existente) — todos PASS após as correções acima.
- Regressão ampla (34 specs de meal-plan/patient-record/food-search/clinical-copilot neste worktree): 0 novas falhas depois do fix do helper `addMeal`.
- `NEW_MIGRATIONS = 0`, `PRODUCTION_WRITES = 0` — todo teste rodou contra o shim SQLite local do E2E.
