# Meal Plan Recipes R6 — Versionamento e Imutabilidade (seções 47-54, gate obrigatório)

## Decisão: snapshot congelado no item, não versionamento de receita

Avaliadas as duas opções do pedido (seção 49): (A) versionar a receita em
si (nova tabela `recipe_versions` ou coluna `version` incrementada a cada
edit) vs. (B) snapshot imutável dentro do item de refeição. Escolhida
**(B)**, porque o projeto JÁ tem exatamente esse mecanismo pra alimentos
individuais (`nutrition_snapshot`/`food_name_snapshot`/
`resolved_grams_snapshot`, "P1-A", congelado a cada save em
`resolveMealsWithSnapshots`) — reaproveitar é mais seguro e mais simples
que inventar um sistema de versionamento paralelo só pra receitas, e
mantém UMA única semântica de imutabilidade no app inteiro.

## Como funciona

- `nutrition_snapshot` de um item de receita usa um shape NOVO,
  discriminado por `kind: "recipe_item_v1"` (`lib/nutrition/food-snapshot.ts
  #buildRecipeItemSnapshot`/`recipeItemValuesFromSnapshot`) — nunca
  confundido com o shape antigo por-100g (usado por TACO/CUSTOM/etc.).
  Contém os VALORES JÁ CALCULADOS pra aquela quantidade exata (não uma
  densidade/referência), porque uma receita não tem base fixa por-100g
  (o rateio depende de rendimento/porções).
- A cada SAVE do plano (`resolveMealsWithSnapshots`,
  `lib/repositories/meal-plans.ts`), um item RECIPE tem seu snapshot
  RECONGELADO a partir do estado ATUAL da receita + a quantidade
  prescrita naquele momento — igual ao comportamento já existente pra
  qualquer item vinculado.
- Na LEITURA (cálculo de nutrição em qualquer lugar —
  `calculateAnyItemNutrients`, `lib/nutrition/nutrients.ts`), o snapshot
  congelado VENCE sempre que existir; só cai pro lookup ao vivo
  (`FoodReferenceLookup.byRecipeId`) quando ainda não há snapshot (item
  recém-adicionado, ainda não salvo).
- Um plano PUBLICADO nunca é re-salvo automaticamente — seu snapshot fica
  parado exatamente como estava na última vez que foi salvo. Editar a
  receita DEPOIS não dispara nenhum recálculo retroativo, porque a leitura
  do plano publicado nunca chama `resolveMealsWithSnapshots` de novo.

## Prova real (E2E obrigatório, seção 92)

`e2e/meal-plan-recipes-r6.spec.ts` — "imutabilidade: publicar o plano e
depois editar a receita não muda o total já publicado": publica um plano
com 1 porção de uma receita, aumenta o ingrediente da receita em 10x
DEPOIS de publicado, relê o plano publicado — o total permanece
IDÊNTICO. PASS.

## Delete/Archive (seções 54, 81)

`archiveRecipe` já era soft-delete (`is_active = 0`) — nenhuma mudança
necessária. Um plano histórico que referencia uma receita arquivada
continua funcionando (o snapshot já congelado não depende da receita
existir/estar ativa); só uma NOVA adição da mesma receita a um plano
diferente ficaria bloqueada na fila de publicação até a nutricionista
trocar (ver `-composer.md`, gate de publicação).

## Nuance de implementação (transparência)

O rateio de quantidade recongelado no save usa uma `RecipeReferenceEntry`
sintética construída a partir das colunas de CACHE
(`per_portion_kcal`×`servings`) em vez de recalcular via
`getRecipeReferenceEntry` (ingrediente-a-ingrediente) nesse ponto
específico — uma escolha consciente pra evitar uma segunda passada cara
de resolução de ingredientes DENTRO do save do plano (potencial N+1 se o
plano tiver muitos itens de receita). O cache já é recalculado pelo motor
real a cada save de RECEITA, então a diferença prática é desprezível;
registrado aqui como uma simplificação deliberada, não um "segundo
calculador" (os NÚMEROS de origem — per_portion_* — sempre vêm do motor
real, só o RATEIO final é que usa esse atalho).
