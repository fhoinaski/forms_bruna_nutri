# Meal Plan Composer UX/UI R6.5.4 — Food Search

## Não implementado nesta fase

Nenhuma mudança nas 4 implementações de busca de alimento inline
(Composer, popover de receita, `MealPlanEditor.tsx` legado,
`IngredientRow` da página de receitas) — mesma decisão de escopo da
R6.5.3, reafirmada aqui: redesenhar a estrutura/header/estados de
carregamento/vazio/erro desse combobox (o mais usado e mais testado
de todo o Composer) carrega risco desproporcional frente ao valor
das 3 entregas reais desta fase (ver `-audit.md`).

## Gate

`MEAL_PLAN_UI_R6_5_4_FOOD_SEARCH: FAIL` (não implementado, mesma
decisão consciente da fase anterior).
