# Meal Plan Recipes R6 — Domínio e Schema

## Migrations (2, aditivas, autorizadas explicitamente antes de escrever)

- `db/20260827_0071_recipes_yield_contract.sql` — `recipes.yield_mode`
  (`RAW_TOTAL|USER_REPORTED|PORTION_COUNT`, nullable) e
  `recipes.yield_grams` (nullable). NULL é tratado como `RAW_TOTAL` —
  nenhuma linha existente precisou ser migrada de dado.
- `db/20260827_0072_meal_plan_items_allow_recipe.sql` — reconstrói
  `meal_plan_items` e `diet_template_items` (SQLite/D1 não altera CHECK
  in-place) só pra ampliar o CHECK de `food_source` e aceitar `'RECIPE'`
  — mesmo padrão já usado 2x antes no projeto (migrations 0048/0058).
  Preserva 100% das colunas/índices existentes.

`NEW_MIGRATIONS: 2`.

## RecipeIngredient — shape novo (`lib/nutrition/recipes.ts`)

```ts
interface RecipeIngredient {
  food?: string;
  quantity?: string | null;
  unit?: string | null;
  food_source?: "TACO"|"CUSTOM"|"MANUFACTURER"|"USDA"|"TBCA"|"IBGE_POF"|null;
  food_ref_id?: string | null;
  household_measure_id?: string | null;
  preparation?: string | null;
  is_optional?: boolean;
  order?: number;
  // legado (pré-R6), só leitura:
  taco_number?: number | null;
  food_name?: string;
  grams?: number | null;
  free_text?: string | null;
}
```

Mesmo shape estrutural de um item de refeição (`MealPlanItemLike`) — nunca
um formato paralelo, permitindo resolução pelo MESMO motor
(`resolveItemReference`/`calculateItemNutrients`) com QUALQUER
`food_source` real (seções 6-7). `normalizeIngredientForRead` é o ÚNICO
ponto que lê um ingrediente (novo ou legado) e devolve o shape canônico —
reaproveitado por: cálculo de totais, editor da biblioteca, `insertRecipe`
do Composer, expansão do Clinical Copilot, e perfil clínico de receita.
Receitas novas gravam sempre no shape novo (`sanitizeIngredients`); nenhum
dado legado é reescrito silenciosamente.

## Ownership (seção 4)

Biblioteca global admin (todo admin autenticado vê/edita todas as
receitas) — sem acoplamento a paciente, sem PII (seção 5: nenhum campo de
paciente existe em `recipes`). Essa é a preferência explícita do pedido
("clinician/admin library, não patient-coupled") e já era o comportamento
pré-existente — nenhuma mudança de escopo de acesso foi necessária.

## Auth/IDOR/Privacy (seções 55-57)

Todas as rotas exigem `getAdminFromRequest` (mesmo padrão do resto do
app). Nenhuma rota nova expõe receita por id sem autenticação. Como
receitas não têm patient_id, não há superfície de IDOR cross-paciente
pra auditar aqui — a única superfície real é "duplicar/editar/arquivar
exige admin autenticado", já garantida.

## Nutrition Engine authority (seções 12-14, princípio central)

`calculateRecipeIngredientTotals` (lib/nutrition/recipes.ts) substitui
`estimateFoodMacros` por `resolveItemReference` + `calculateItemNutrients`
— o MESMO motor usado por qualquer item de refeição. Ingrediente não
resolvido soma como `null` via `sumNutrients` (nunca 0) — corrige o bug
legado onde um ingrediente sem `taco_number` contaminava o total com zero
silencioso. `nutrition_override` continua existindo só como escape hatch
legado pro seed de conteúdo de terceiros (nunca usado pelo editor/API
novos) — ver `-audit.md`.

## Cache de exibição vs. autoridade real

As colunas `total_kcal`/`per_portion_kcal`/etc. continuam sendo
recalculadas e gravadas a cada create/update (coalescendo `null`→0 só
para exibição rápida da LISTA de receitas — não pode ser NOT NULL REAL
com missing de verdade sem uma migration adicional maior, fora do escopo
mínimo aprovado). A autoridade real — usada sempre que a receita vira um
item de refeição — é `getRecipeReferenceEntry`/
`calculateRecipeIngredientTotals`, recalculada ao vivo a partir dos
ingredientes reais, nunca lida do cache.
