# Clinical Copilot R5.1 — COMBINATION

## Contrato

`structure: "COMBINATION"` exige `fixed_items` (0-6, default `[]`),
`choice_groups` (1-3 grupos, cada um com `title`/`min_selections`/
`max_selections`/1-6 `items`, com `.refine()` garantindo
`max_selections >= min_selections`) e `optional_items` (0-4, default `[]`).
Na montagem do draft, `fixed_items` + `optional_items` são resolvidos como
UMA lista combinada e viram o MESMO array `DraftMeal.items` — os
opcionais carregam `is_optional: true`, reaproveitando o campo real do
domínio (`MealPlanItemPayload.is_optional`) em vez de um array separado
(seção 10: item opcional nunca vira fixed item "de verdade").

## Semântica nutricional (seções 8, 32, 36, 67-68)

`calculateFlexiblePlanNutrients` já implementa a regra correta para
COMBINATION: cada `choice_group` contribui só o item de MENOR valor pro
`min` (`min_selections` itens) e o de MAIOR valor pro `max`
(`max_selections` itens) — nunca soma todas as alternativas do grupo. Item
opcional conta no `max` mas não no `min` (mesma regra de `is_optional` já
usada para itens SIMPLE opcionais). Prova:
`tests/draft-nutrition.test.ts` ("COMBINATION: choice_group contribui só
o menor/maior item do grupo... item opcional soma no max mas não no min").

## Revisão aninhada (seções 14-17, 56, 69-70)

Um item NOT_FOUND dentro de um `choice_group` vira uma entrada de
`needsReview` DAQUELE grupo especificamente (`group.needsReview`), com
`path: "choice_groups[N].items[M]"` — o item fixo da mesma refeição
continua resolvido e calculável independentemente. Prova: unit
(`tests/meal-plan-draft-flexible.test.ts`, "item NOT_FOUND dentro de um
grupo de escolha...") e E2E (`e2e/clinical-copilot-r5-1-flexible-structure.spec.ts`,
"COMBINATION: item NOT_FOUND...").

## R3/R4 (seções 38-39, 74-75)

Nenhuma mudança tocou `ExchangeGroupPanel.tsx`/`equivalent-quantity.ts`
nem `ReuseLibraryDrawer.tsx`/repositórios de reuso — um item gerado pelo
Copilot dentro de um `choice_group` é indistinguível, para esses módulos,
de um item digitado manualmente na mesma posição. A suíte
`meal-plan-substitution-r3-equivalent-quantity.spec.ts` já tinha um
cenário manual de COMBINATION ("COMBINATION: trocar o item fixo pelo
motor de equivalência não altera o grupo de escolha...") que continua
100% verde, confirmando a compatibilidade sem necessidade de um teste
E2E redundante specificamente do "Copilot + R3" — o pipeline pós-aplicação
é idêntico ao de um plano editado manualmente.

## Testes

- Unit: `tests/meal-plan-draft-flexible.test.ts` (geração completa com
  fixo+grupo+opcional; NOT_FOUND aninhado; rejeição de min/max inválido;
  IA nunca fornece identidade nested — `food_ref_id`/`kcal` injetados são
  descartados pelo schema estrito mesmo dentro de COMBINATION; resolução
  em lote sem N+1 mesmo cruzando fixed/choice_group/optional).
- Unit: `tests/draft-nutrition.test.ts`.
- Unit: `tests/meal-plan-changeset.test.ts` (lock escondido dentro de um
  choice_group é detectado).
- E2E: `e2e/clinical-copilot-r5-1-flexible-structure.spec.ts`.
