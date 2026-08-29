# Meal Plan Composer UX/UI R6.5.3 — Food Search

## Não implementado nesta fase

Nenhuma mudança foi feita nas 4 implementações de busca de alimento
inline encontradas pela auditoria (Composer, popover de receita no
Composer, `MealPlanEditor.tsx` legado, `IngredientRow` da página de
receitas). O pedido pedia um redesign de estrutura/header/estados de
carregamento/vazio/erro — não realizado.

## Por que

A busca de alimento é o combobox mais usado e mais testado de todo o
Composer (aria completa: `role="combobox"`/`aria-expanded`/
`aria-autocomplete`/`aria-controls`/`aria-activedescendant`, usado em
dezenas de specs E2E). Redesenhar sua estrutura (header dedicado,
skeleton de carregamento, unificação das 4 implementações num único
componente) é uma mudança de alto risco/alto esforço que não coube no
orçamento desta fase depois que o gap de acessibilidade dos diálogos
(ver `-drawers.md`) foi identificado como o valor real mais seguro a
entregar.

## Observação da auditoria (não corrigida)

As 4 implementações usam o mesmo tratamento visual
(`rounded-xl border border-[#EAD8C2] bg-white p-1 shadow-[0_18px_44px_rgba(58,48,40,0.16)]`)
copiado/colado, com z-index divergente (`z-30` em 2 lugares, `z-20`
em outros 2). Nenhuma colisão ativa foi confirmada, mas a duplicação
em si é um candidato real de extração pra uma fase futura dedicada
(um componente `FoodSearchListbox` compartilhado), não tentado aqui.

## Gate

`MEAL_PLAN_UI_R6_5_3_FOOD_SEARCH: FAIL` (não implementado, escopo
consciente).
