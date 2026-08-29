# Meal Plan Recipes R6 — Yield e Portion Nutrition

## Contrato (seções 15-21)

`RecipeYieldMode = "RAW_TOTAL" | "USER_REPORTED" | "PORTION_COUNT"`.
`resolveRecipeYieldGrams(yieldMode, yieldGrams, rawTotalGrams)`:

- `RAW_TOTAL` (padrão, inclusive receitas pré-R6 com `yield_mode` null) —
  soma das gramas dos ingredientes com quantidade resolvida em gramas.
  Base TÉCNICA, nunca apresentada como "rendimento medido real".
- `USER_REPORTED` — usa `recipes.yield_grams` (a nutricionista digitou
  "rendeu 800g"). Nunca inventa um fator de correção/cocção (seção 17).
- `PORTION_COUNT` — `null` sempre. Só a contagem de porções
  (`recipes.servings`, coluna já existente) é conhecida — item de receita
  só pode ser quantificado em porções, nunca em g/ml (seção 79, testado).

## Rateio (seções 22-23)

`resolveRecipeItemNutrients(quantity, unit, entry)`:

- unidade "porção"/"unidade" (aliases fechados, seção 11: nunca inventa
  uma conversão) → `total × (quantity / servings)`. Funciona em QUALQUER
  yield_mode, já que `servings` sempre existe.
- unidade "g"/"ml" → exige `yieldGrams` conhecido; `total × (quantity /
  yieldGrams)`. Em `PORTION_COUNT`, fica `unresolved` (nunca uma gramagem
  chutada) — provado em `tests/recipe-engine-r6.test.ts`.

## Arredondamento (seção 24)

Reaproveita `roundedNutrients` (lib/nutrition/nutrients.ts) — nenhum
sistema de arredondamento novo. Soma sempre em precisão total antes de
arredondar (mesma convenção "arredonda só na exibição" do resto do app).

## Testes

`tests/recipe-engine-r6.test.ts` cobre: RAW_TOTAL/USER_REPORTED/
PORTION_COUNT (4 casos), 1 porção = total/servings, 2 porções dobra
exatamente, yield em gramas rateia proporcionalmente, ausência de yield
em gramas nunca inventa conversão, quantidade inválida (0/negativa/não
numérica) nunca calcula, receita não encontrada nunca quebra.
