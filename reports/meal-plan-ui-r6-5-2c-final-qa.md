# Meal Plan Composer UX/UI R6.5.2C — Final QA / Release Closure

## Escopo entregue (fecha os 2 últimos blockers da R6.5.2)

1. **Menu de ações da refeição**: Mover (▲/▼) e Duplicar consolidados
   dentro do "⋯" existente, junto com Sugerir com IA/Salvar como
   receita/Salvar como refeição favorita/Excluir refeição — mesmos
   handlers de sempre, só relocados. Acessibilidade real nova:
   `aria-haspopup="menu"`, `aria-expanded`, `role="menu"`, Escape
   fecha e devolve o foco ao gatilho. Ação destrutiva (Excluir)
   separada por divisor visual.
2. **Food row**: compactação por CSS puro — o botão "Mais ações do
   alimento" (menu que já existia consolidado antes desta fase) fica
   revelado por hover/foco em desktop (`md:`), sempre visível em
   mobile/tablet. Nenhuma mudança estrutural, aria-label, ou handler.

## Auditoria corrigiu uma estimativa conservadora da R6.5.2

A R6.5.2 estimou "≥6 specs" dependentes dos botões standalone de
Mover/Duplicar da refeição. O grep exaustivo desta fase encontrou o
número real: **2 arquivos, 3 linhas**
(`meal-plan-ux2.spec.ts:57,80`, `meal-plan-reuse-r4-library.spec.ts:68`).
Todas as 3 foram atualizadas deliberadamente (abrir o menu antes de
clicar / usar o novo aria-label do gatilho) — não um mass-rewrite,
exatamente as linhas afetadas pela mudança de DOM real.

## Gates finais

| Gate | Resultado |
| --- | --- |
| TypeScript (`tsc --noEmit`) | PASS, 0 erros |
| ESLint (arquivos alterados) | PASS, 0 erros/avisos |
| Build (`next build`) | PASS |
| Migração (`migrate:d1:check`) | PASS, 71 migrações validadas, 0 novas |
| Runtime DDL guard (`schema:runtime-check`) | PASS |
| Artifact check | PASS, 1315 arquivos rastreados |
| Full Vitest | 2017/2017 PASS (235 arquivos — nenhum teste unitário novo nesta fase, só E2E) |
| E2E dedicado R6.5.2C (`meal-plan-ui-r6-5-2c-closure.spec.ts`) | 4/4 PASS (menu acessível/teclado/Escape/foco, excluir refeição correta, hover-reveal do food row, quantidade/R3 sem regressão) |
| Specs afetados reexecutados (`meal-plan-ux2`, `meal-plan-reuse-r4-library`) | 9/9 + 8/8 PASS |
| Lineage crítica reexecutada (R6.5.1/R6.5.2/R6.5.2B/R2-flex/R5.1/R6 recipes) | 34/34 PASS |
| Broad E2E (chromium-desktop, single worker) | 237/237 PASS |
| Broad E2E (default parallelism, ambos os projetos) | ver marcador `MEAL_PLAN_UI_R6_5_2C_BROAD_E2E_PARALLEL` |
| Migrations novas | 0 |
| Escritas em produção | 0 (shim SQLite local do E2E) |

## Sem segundo calculador / Nutrition Engine intocado

Nenhuma mudança desta fase toca `lib/nutrition/*` ou cálculo de
plano/receita — confirmado por leitura de código e pelos testes de
regressão de OPTIONS/COMBINATION/large-plan/R6 recipes, todos verdes
sem alteração de valores esperados.

## Regra de fechamento da R6.5.2 (seção 84 do pedido)

Todos os blockers da R6.5.2 agora estão PASS:

| Blocker | R6.5.2 | R6.5.2B | R6.5.2C |
| --- | --- | --- | --- |
| MEAL_ACTION_MENU | FAIL | FAIL | **PASS** |
| FOOD_ROW | FAIL | FAIL | **PASS** |
| INLINE_QUANTITY | — | PASS | PASS (reconfirmado) |
| INLINE_UNIT | — | PASS | PASS (reconfirmado) |
| COMBINATION_VISUAL | FAIL | PASS | PASS (reconfirmado) |
| TOP_TOOLBAR | FAIL | PASS | PASS (reconfirmado) |
| R5_COMPATIBILITY | NOT_TESTED | PASS | PASS (reconfirmado) |
| R6_COMPATIBILITY | N-A | PASS | PASS (reconfirmado) |

Com todos os blockers em PASS e nenhuma regressão introduzida em
nenhuma fase da lineage (verificado por reexecução ampla, não só
inferência):

```
MEAL_PLAN_UI_R6_5_2_COMPLETE: sim
MEAL_PLAN_UI_R6_5_3_SAFE_TO_START: sim
```

## Escopo ainda fora da R6.5 completa (lembrete, não bloqueia R6.5.2)

O pedido original R6.5 (109 seções) e R6.5.2 (120 seções) tinham
escopo muito maior que o entregue nas fases 2/2B/2C — drawers
padronizados (busca/substituição/reuso/receita), integração visual do
Copilot, tokens de design formais, atalhos de teclado, medição formal
de performance, e uma auditoria de acessibilidade completa do
Composor (não só das áreas tocadas) continuam pendentes — candidatos
reais pra R6.5.3, cujo início agora está desbloqueado pela regra
acima, mas que não deve começar automaticamente (STOP explícito do
pedido).
