# Clinical Copilot R5.1 — Arquitetura (auditoria + decisões)

## Auditoria (seção 1) — onde o fluxo assumia SIMPLE-only

Antes de qualquer mudança, o fluxo real do Clinical Copilot foi auditado
ponta a ponta. Pontos que assumiam SIMPLE (só `items`, nunca `options`/
`choice_groups`) e precisavam de correção real:

1. **`DraftMeal` (`lib/nutrition/draft-types.ts`)** — só tinha `items`/
   `needsReview`, nenhum campo de estrutura. Corrigido: ganhou
   `meal_structure`/`options`/`choice_groups` opcionais (ausentes =
   "SIMPLE", mesma convenção do domínio real).
2. **Schema do LLM (`meal-plan-draft-agent.ts`)** — `draftMealLlmSchema`
   só aceitava `mealKey/recipeId/items/rationale`. Corrigido: virou um
   `z.discriminatedUnion("structure", [SIMPLE, OPTIONS, COMBINATION])`.
3. **`assembleDraft`** — resolvia só `llmMeal.items`. Corrigido: resolve
   recursivamente `items`/`options[].items`/`fixed_items`+`optional_items`/
   `choice_groups[].items`, tudo em UM único lote (`resolveFoodCandidatesWithCanonicalShadow`).
4. **`calculateDraftNutrition` (`lib/nutrition/draft-nutrition.ts`)** — usava
   `calculatePlanNutrients` (só `meal.items`, ignora silenciosamente
   `options`/`choice_groups` — nem soma errado, apenas IGNORA o conteúdo
   flexível). Corrigido: trocado por `calculateFlexiblePlanNutrients` (a
   MESMA engine que o Composer manual já usa para OPTIONS/COMBINATION desde
   antes desta fase).
5. **`meal-plan-changeset.ts`** — `isMealLockedForCopilot` só olhava
   `meal.items`, então um lock escondido dentro de uma `option`/
   `choice_group` de uma refeição existente não era detectado. Corrigido:
   agora percorre `items + options[].items + choice_groups[].items`.
   `draftMealMatchesExisting` também não era estrutura-consciente (uma
   SIMPLE com os mesmos itens fixos de uma OPTIONS seria considerada igual,
   por comparar só `items`). Corrigido.
6. **`AiMealPlanWizard.tsx`** — o mapper `draftMealToEditorMeal` só
   mapeava `items`. Corrigido: mapeia `meal_structure`/`options`/
   `choice_groups` para o MESMO shape que o Composer (`MealItemsEditor.tsx`
   `Meal` type) já entende nativamente — nada mudou no Composer em si.

## Decisão central (seção 2) — reaproveitar, nunca duplicar

O Composer profissional **já tinha** um domínio real de refeição flexível
(`lib/meal-plans/flexible-structure.ts`: `MealStructureType`,
`MealOptionPayload`, `MealChoiceGroupPayload`, `calculateMealNutritionRange`)
e o motor de nutrição **já tinha** `calculateFlexiblePlanNutrients`
(min/max sem somar alternativas) — usados hoje pela edição MANUAL de
OPTIONS/COMBINATION no Composer. R5.1 não criou nenhum tipo paralelo
(`AiOptionsMeal`/`AiCombinationMeal`): `DraftMeal` ganhou os MESMOS campos
(`meal_structure`/`options`/`choice_groups`, mesmos nomes) e o mapper do
wizard produz o shape exato de `Meal` do Composer. "Opcional" também
reaproveita o campo real `is_optional` já existente em `MealPlanItemPayload`
— nunca um array `optional_items` paralelo no domínio final (só existe
`optional_items` do LADO DO LLM, que vira `is_optional: true` dentro do
mesmo array `items` na montagem do draft, espelhando o Composer).

## Compatibilidade retroativa (seção 4)

`structure` é sempre injetado como `"SIMPLE"` quando ausente
(`prepareMealRawForParse`), tanto no envelope completo quanto na
recuperação parcial (`recoverPartialMeals`) — testes/chamadores anteriores
a esta fase que constroem objetos sem `structure` continuam funcionando
byte-a-byte (prova: toda a suíte pré-existente, incluindo
`tests/ai-meal-plan-draft-agent.test.ts`, `tests/draft-optimizer*.test.ts`
e `tests/clinical-copilot-r5-authority.test.ts`, passa sem alteração de
expectativa). O Copilot só propõe OPTIONS/COMBINATION quando o wizard envia
`allowFlexibleStructure: true` (opt-in explícito, desligado por padrão).

## Item-level exchanges vs. estrutura de refeição (seção 11)

Nenhuma mudança tocou o domínio de substituição/equivalência do R3
(`lib/repositories/exchange-groups.ts`, `equivalent-quantity.ts`). Um item
gerado pelo Copilot dentro de uma `option`/`choice_group` é, para o R3, um
item comum como outro qualquer — a suíte de regressão
`meal-plan-substitution-r3-equivalent-quantity.spec.ts` (que já incluía um
cenário COMBINATION manual, seção "COMBINATION: trocar o item fixo...")
continua 100% verde.
