# Meal Plan Composer UX/UI R6.5.4 — Loading/Empty/Error states

## Não implementado nesta fase

Nenhum sistema formal de loading/empty/error state foi criado ou
normalizado pras 5 áreas de suporte. Os estados existentes (spinners
de texto em Food Search, `Loader2` em alguns lugares, cards
amber/red de erro) continuam exatamente como estavam — já
identificados pela auditoria da R6.5.3 como razoavelmente
consistentes entre si (mesmo tom de texto, mesma paleta amber/red),
mas não unificados num sistema formal de componentes.

## Por que

Consolidar esses estados exigiria tocar em pelo menos 4-5 arquivos
diferentes simultaneamente (Food Search em 4 locais, `ExchangeGroupPanel`,
`ReuseLibraryDrawer`, a página de receitas, `AiMealPlanWizard`) — o
mesmo padrão de mudança ampla que já causou regressões reais em fases
anteriores desta mesma base de código. Dado o orçamento desta fase,
não foi tentado.

## Gate

`MEAL_PLAN_UI_R6_5_4_LOADING_STATES: FAIL`
`MEAL_PLAN_UI_R6_5_4_EMPTY_STATES: FAIL`
`MEAL_PLAN_UI_R6_5_4_ERROR_STATES: FAIL`

Todos não implementados nesta fase, por decisão consciente de risco.
