# Clinical Copilot R5.1 — OPTIONS

## Contrato

`structure: "OPTIONS"` no schema do LLM exige 2 a 4 `options`, cada uma com
`label` + 1 a 6 itens. Nenhum `recipeId`/`items` de nível de refeição é
aceito nessa variante (schema `.strict()` do zod rejeita o objeto inteiro
se algum campo de outra variante vazar). Após resolução, cada `DraftMeal`
com `meal_structure: "OPTIONS"` carrega `options: DraftMealOption[]`, cada
uma com `id` (`option-N`, estável só para a sessão do draft), `label`,
`items` (resolvidos) e `needsReview` (pendências daquela opção
especificamente).

## Semântica nutricional (seções 7, 35, 65)

Reaproveita `calculateFlexiblePlanNutrients` — as opções NUNCA são somadas.
Prova direta: `tests/draft-nutrition.test.ts` ("OPTIONS: total.energyKcal
usa o MÁXIMO entre as opções, nunca a soma das duas") — com uma opção de
baixa caloria e outra de alta, `total`/`totalRange.max` batem com a
opção mais cara, nunca com a soma; `totalRange.varies` é `true`.

## Revisão aninhada (seções 14-17, 55, 66)

Um item ambíguo/não encontrado dentro da Opção B nunca contamina a Opção A
— provado em `tests/meal-plan-draft-flexible.test.ts` ("item ambíguo dentro
de uma opção vira REVIEW_REQUIRED... sem afetar a outra opção") e no E2E
("COMBINATION: item NOT_FOUND..." cobre o caso análogo de choice_group; o
E2E `clinical-copilot-r5-1-flexible-structure.spec.ts` cobre a geração
OPTIONS completa ponta a ponta). O `path` de cada pendência
(`options[N].items[M]`) é carimbado na montagem do draft e sobrevive até a
UI, que mostra a breadcrumb "Refeição → Opção N".

## Mapper para o Composer (seções 20-21, 37)

`draftMealToEditorMeal` (wizard) produz `{ meal_structure: "OPTIONS",
items: [], options: [...] }` — exatamente o shape que
`MealItemsEditor.tsx`/`flexible-structure.ts` já sabem renderizar/editar/
calcular. Nenhuma alteração foi necessária no Composer: a suíte
`meal-plan-substitution-r3-equivalent-quantity.spec.ts` e
`meal-plan-reuse-r4-library.spec.ts` (que já testam OPTIONS/COMBINATION
manuais) continuam verdes com o Copilot alimentando o mesmo pipeline.

## Testes

- Unit: `tests/meal-plan-draft-flexible.test.ts` (schema aceita 2-4 opções,
  rejeita 1 opção; geração completa; revisão aninhada; batch resolution).
- Unit: `tests/draft-nutrition.test.ts` (range OPTIONS não somado).
- Unit: `tests/meal-plan-changeset.test.ts` (changeset compara OPTIONS
  estrutura-consciente, nunca confunde com SIMPLE).
- E2E: `e2e/clinical-copilot-r5-1-flexible-structure.spec.ts` (geração real
  ponta a ponta, aplicação ao Composer com `meal_structure` preservado).
