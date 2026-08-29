# Meal Plan Recipes R6 — Integração com o Composer

## Item de receita (seções 33-37)

`meal_plan_items`/`diet_template_items` ganharam `food_source = 'RECIPE'`
(migration 0072). Um item de receita NUNCA é achatado em alimentos
individuais — é uma referência viva (`food_ref_id` = id da receita) até o
momento do save, quando vira um snapshot congelado (ver `-versioning.md`).
Quantidade em porções (padrão, "1") ou em gramas (se a receita tiver
rendimento em massa) — seção 35.

## Dois mecanismos distintos no Composer (achado real da auditoria)

Já existia um botão **"Inserir receita"** (biblioteca de receitas
completa, `insertRecipe` em `MealItemsEditor.tsx`) que EXPANDE a receita
numa refeição NOVA com os ingredientes reais escalados a 1 porção — um
recurso legítimo e diferente (montagem rápida de refeição a partir de um
padrão), mantido intacto (só corrigido pra aceitar o novo shape de
ingrediente — ver seção de bugs abaixo).

R6 acrescenta um SEGUNDO botão, **"Item de receita"**, dentro de cada
refeição já existente — insere a receita como 1 ITEM (referência viva),
sem criar refeição nova e sem expandir ingredientes. É este o mecanismo
que corresponde ao pedido das seções 33-37. Os dois nomes são
deliberadamente distintos (com tooltip explicando a diferença) para não
confundir a nutricionista sobre qual escolher.

## Bugs reais encontrados e corrigidos (pela suíte E2E ampla, antes do fechamento)

A mudança do shape de `RecipeIngredient` (novo `food/food_source/
food_ref_id` em vez de só `taco_number/food_name/grams`) quebrou 4 pontos
que liam ingredientes de receita assumindo só o shape legado — todos
descobertos por regressões reais em E2E pré-existentes, nunca escondidos:

1. `insertRecipe` (MealItemsEditor.tsx) — corrigido pra normalizar via
   `normalizeIngredientForRead` antes de escalar/mapear.
2. `expandRecipeIngredientsToItems` (AiMealPlanWizard.tsx — usado tanto
   pela sugestão de receita opcional quanto pela revisão de preparo
   composto do Clinical Copilot) — mesmo fix.
3. `lib/ai/agents/nutrition/meal-suggestion-agent.ts` (ferramenta de chat
   que expande receita em itens) — mesmo fix, com uma limitação
   documentada: só expande ingredientes TACO (mesma limitação de antes).
4. `lib/clinical/food-clinical-profile.ts#getRecipeClinicalProfile` —
   perfil clínico (alergia/restrição) de uma receita, usado pelo
   assistente do portal do paciente — corrigido pra normalizar antes de
   contar ingredientes "TACO" vs. "texto livre".

## SIMPLE/OPTIONS/COMBINATION (seções 38-39, 82-84)

Como o suporte a RECIPE foi implementado no NÍVEL DO MOTOR
(`calculateAnyItemNutrients`, `lib/nutrition/nutrients.ts`) — o mesmo
ponto único usado por `calculatePlanNutrients`/`calculateFlexiblePlanNutrients`
pra QUALQUER item, em SIMPLE, dentro de uma `option` ou de um
`choice_group` — o suporte a OPTIONS/COMBINATION veio "de graça", sem
nenhum código adicional no Composer: um item de receita dentro de uma
opção nunca é somado com a alternativa (testado); dentro de um grupo de
escolha, respeita `min_selections`/`max_selections` (testado). Ver
`tests/recipe-engine-r6.test.ts`.

## R3 — Substituição (seção 40)

Deliberadamente **N/A**: um item RECIPE nunca é candidato a
substituição/troca automática. `itemRef` (meal-plan-publication.ts,
meal-plan-view-model.ts) e todo ponto que decide "isto é uma
FoodReference de catálogo" tratam RECIPE como null/excluído — mesmo
tratamento que TBCA/IBGE_POF já recebiam antes desta fase (nunca uma
lógica nova, só estendida). Confirmado sem regressão: a suíte de
equivalência R3 (`meal-plan-substitution-r3-equivalent-quantity.spec.ts`)
continua 100% verde.

## R4 — Reuso (seção 41)

`saved-meals`/`protocol-templates` tiveram seus schemas Zod ampliados
para aceitar `food_source: "RECIPE"` (mesmo padrão de ampliação já usado
pros outros food_source) — um modelo/refeição salva contendo um item de
receita preserva a referência (`food_ref_id`) ao salvar/reaplicar. Testado
indiretamente: a suíte `meal-plan-reuse-r4-library.spec.ts` continua
100% verde (nenhuma estrutura existente foi alterada).

## R5 — Clinical Copilot (seção 42)

Comportamento deliberadamente MANTIDO: o Copilot continua só EXPANDINDO
uma receita sugerida em ingredientes reais no momento da geração (nunca
produz uma referência viva de item RECIPE) — mesma decisão de segurança
já em vigor (nunca "ativar resolução de receita por IA sem auditoria").
Uma nutricionista pode, manualmente, depois trocar um item expandido por
uma referência de receita viva via "Item de receita" — mas isso nunca é
automático.

## Publicação (gate de qualidade, achado real)

`lib/repositories/meal-plan-publication.ts` e
`lib/repositories/meal-plan-view-model.ts` originalmente assumiam que
TODO item calculável passa por `getFoodByReference` (catálogo) — um item
RECIPE seria bloqueado de publicar (UNRESOLVED_FOOD/INVALID_QUANTITY)
mesmo estando 100% calculável. Corrigido com um caminho de validação
próprio: RECIPE é "resolvido" quando a receita existe e está ativa, e
"quantidade válida" quando `resolveRecipeItemNutrients` produz um valor
real (ou já existe um snapshot congelado). Provado pelo E2E de
imutabilidade (que também exercita a publicação com sucesso).
