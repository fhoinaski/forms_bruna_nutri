# Meal Plan Recipes R6 — Auditoria (seção 1)

## O que já existia

Um domínio de receitas JÁ existia (`db/20260804_0019_recipes_library.sql`,
`lib/repositories/recipes.ts`, `lib/nutrition/recipes.ts`,
`app/api/admin/recipes/*`, `app/dashboard/templates/receitas/page.tsx` —
638 linhas, editor + biblioteca completos), mas com gaps reais que
violavam princípios centrais do pedido:

1. **Ingredientes TACO-only** — `RecipeIngredient` só tinha
   `taco_number/food_name/grams/free_text`; nenhum CUSTOM/MANUFACTURER/
   USDA/TBCA/IBGE_POF, nenhuma preparação, nenhuma ordem explícita.
2. **Segundo calculador** — `calculateRecipeNutrition` usava
   `estimateFoodMacros` (TACO-only), nunca `calculateItemNutrients`/
   `resolveItemReference` (o motor real usado por qualquer item de
   refeição) — violação direta de "Nutrition Engine authority".
3. **missing tratado como 0** — ingrediente sem `taco_number`/`grams`
   virava `{kcal:0, protein:0, ...}` na soma, contaminando o total da
   receita silenciosamente.
4. **`nutrition_override`** — campo que aceita macros gravados
   manualmente, sobrepondo o cálculo. Usado hoje só por
   `db/seed-recipes-bruna.ts` (conteúdo de terceiros com ingredientes
   100% em texto livre, sem identidade canônica possível) — mantido como
   exceção legada estreita, nunca exposto no editor/API novos.
5. **Nenhum "item de receita" no Composer** — receita só existia como
   MEIO de expandir uma refeição em itens TACO individuais no momento da
   geração (Clinical Copilot) ou inserção manual (`insertRecipe`,
   `MealItemsEditor.tsx` — descoberta na auditoria, ver abaixo). Não
   havia `food_source = "RECIPE"` em lugar nenhum do schema/tipo.
6. **UI de biblioteca já madura, mas não descoberta antes do primeiro
   commit** — durante a implementação, um `insertRecipe` PRÉ-EXISTENTE
   (botão "Inserir receita" no Composer) e um fluxo "Salvar refeição como
   receita" foram encontrados. Nenhum dos dois foi tocado na primeira
   passada de código — a mudança de shape de `RecipeIngredient` (novo
   `food/food_source/food_ref_id`) quebrou silenciosamente os dois, e
   também `lib/ai/agents/nutrition/meal-suggestion-agent.ts` e
   `lib/clinical/food-clinical-profile.ts` (perfil clínico de receita
   pré-existente, usado pelo assistente do portal do paciente). Todos os
   4 pontos foram corrigidos (ver `-composer.md`) — pegos pela suíte
   ampla de E2E antes do fechamento, nunca silenciosamente ignorados.

## Decisão de escopo (aprovada explicitamente pelo usuário)

Apresentada via pergunta direta antes de qualquer migration: 2 migrations
aditivas de baixo risco (mesmo padrão 2x já usado no projeto — ampliar
CHECK de `food_source`) + reescrita do cálculo pro motor real. Aprovado.
Ver `reports/meal-plan-recipes-r6-domain.md` pro detalhe do schema.

## Dívida técnica identificada, não escondida

- `resolveRecipeItemNutrients` com uma `RecipeReferenceEntry` sintética
  construída a partir de `per_portion_*` está DUPLICADO em 2 lugares
  (`lib/repositories/meal-plan-publication.ts` e
  `lib/repositories/meal-plan-view-model.ts`) — ambos precisam validar
  quantidade de um item de receita sem uma chamada assíncrona extra por
  item. Extrair um helper compartilhado é um refactor de baixo risco,
  documentado aqui como follow-up (não bloqueia nenhum gate).
- `getFoodClinicalProfile({foodSource:"RECIPE"})` (perfil clínico de
  alergia/restrição de uma receita) já existe e é usado pelo assistente
  do portal do paciente, mas NÃO está conectado à checagem de segurança
  quando um item RECIPE é adicionado no Composer profissional
  (`checkFoodAgainstPatientRestrictions` roda por item de comida
  individual, nunca para um item RECIPE agregado). Antes da R6, todo
  ingrediente de receita virava um item TACO individual (checado
  normalmente); com o novo item RECIPE ao vivo, essa checagem por
  ingrediente não roda mais automaticamente. Registrado como gap real,
  não escondido — candidato a R6.1.
