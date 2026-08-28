# Meal Plan Composer UX/UI R6.5 — Performance

## Restrição obrigatória do pedido

Polimento de UI não pode aumentar N+1. A mudança desta fase é
puramente de apresentação (JSX/classes/estrutura de cálculo de
percentual em memória) dentro de `MealPlanNutritionWorkspacePanel` —
nenhuma nova chamada de rede, nenhuma nova query, nenhum novo I/O foi
introduzido. `percentOfTarget` é uma função pura sobre valores JÁ
calculados (`max[key]`, `target[key]`) que chegam como props — não
dispara nenhum cálculo adicional do Nutrition Engine.

## Teste de plano grande (8 refeições × 6 itens)

`e2e/meal-plan-ui-r6-5-visual.spec.ts`, teste "plano grande (8
refeições / itens múltiplos) continua renderizando sem quebrar":
cria um plano com 8 refeições de 6 itens cada (48 itens), navega até
"Plano alimentar", confirma que "Refeição 1" e "Refeição 8" renderizam
dentro de 15s. **PASS.**

## Medição formal (p50/p95/max) — seção 98 do pedido

NÃO capturada nesta fase (mesma lacuna documentada em R6 para o mesmo
gate). O teste acima prova ausência de quebra funcional em escala,
não medição de tempo.

## Gate

`MEAL_PLAN_UI_R6_5_PERFORMANCE: PASS` para a restrição central (sem
N+1 novo, sem I/O novo) — a mudança é puramente de apresentação sobre
dados já calculados. Medição formal de latência: não capturada,
documentado como lacuna.
