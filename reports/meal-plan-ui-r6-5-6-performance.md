# R6.5.6 — Performance da Biblioteca de Reuso

## Amostra local (`e2e/meal-plan-reuse-r4-performance.spec.ts`, 3 rounds)

Capturado após a correção do Bug 4 (seletores obsoletos) e reexecução:

| Métrica | p50 | p95 |
| --- | --- | --- |
| Abrir biblioteca (`MEAL_PLAN_REUSE_R4_LIBRARY_OPEN_*_MS`) | 41 ms | 306 ms |
| Trocar de aba (`MEAL_PLAN_REUSE_R4_TAB_SWITCH_*_MS`) | 100 ms | 101 ms |
| Busca (`MEAL_PLAN_REUSE_R4_SEARCH_*_MS`) | 71 ms | 79 ms |

Amostra local (ambiente de desenvolvimento, não representa produção), mas
serve como guarda de regressão: nenhum destes números indica travamento ou
degradação perceptível.

## N+1 de requisições

Teste dedicado (`N+1: abrir a biblioteca dispara UMA chamada, nunca uma por
item`) confirma que abrir a aba Itens/Recentes dispara no máximo 1
requisição a `/api/admin/foods/recent`, nunca uma por item da lista. PASS
sem alterações.

## Nota

Este relatório mede apenas a Biblioteca de Reuso. Não há mudança de
performance no motor de nutrição, no Composer central, ou em qualquer rota
de API — `ReuseLibraryDrawer.tsx` não alterou nenhuma chamada de rede além
das já existentes antes desta fase.
