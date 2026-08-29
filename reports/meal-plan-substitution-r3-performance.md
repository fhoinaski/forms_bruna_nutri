# Meal Plan Substitution Engine R3 — Performance / N+1

## Medições (amostra local, 3 repetições, `e2e/meal-plan-substitution-r3-performance.spec.ts`)

| Etapa | P50 | P95 |
| --- | --- | --- |
| Abrir drawer | 58 ms | 1146 ms* |
| Cálculo em lote (busca → resultados anotados) | 276 ms | 323 ms |
| Selecionar candidato (preview + impacto refeição/dia) | 417 ms | 428 ms |
| Trocar critério (com candidato já selecionado) | 36 ms | 37 ms |

\* O P95 de abertura do drawer inclui a primeira execução (cold start dos
componentes React/CSS no navegador do teste); rodadas subsequentes ficam
abaixo de 60ms — não é uma regressão do endpoint de equivalência.

Trocar de critério é a operação mais rápida porque, na maior parte dos casos,
os dados já vieram no lote anterior (mudar o critério dispara um NOVO lote,
mas a UI já tinha o candidato selecionado e só espera a resposta específica
daquele item mudar o campo de quantidade).

## N+1 audit

- **Busca → equivalência**: UMA chamada POST a
  `/api/admin/foods/equivalent-quantity` por lote, cobrindo todos os
  candidatos retornados pela busca (até 8, o limite do `/api/admin/foods/search`
  usado pelo drawer) — nunca uma chamada por candidato. Confirmado via
  contagem de requisições de rede no teste "critério ENERGY calcula em lote"
  (`equivalentRequests.length <= 2`, contando a chamada inicial mais uma
  eventual segunda disparada por uma mudança de estado assíncrona — nunca N).
- **20 candidatos em uma única chamada HTTP**: coberto no nível de API
  (`tests/equivalent-quantity-route.test.ts`, teste "computes 20 candidates in
  a single HTTP call") — o endpoint aceita até 30 por request
  (`RequestSchema.candidates.max(30)`), resolvendo cada candidato com
  `Promise.all` (paralelo, nunca serial) tanto pra identidade quanto pra
  medida caseira.
- **Medida caseira**: resolvida DENTRO do mesmo request de lote (server-side,
  via `getFoodPortions` no mesmo `Promise.all` de resolução de identidade) —
  nunca uma chamada adicional do cliente por candidato.
- **Deduplicação**: candidatos repetidos na mesma chamada (mesma
  `source:refId`) são resolvidos uma única vez
  (`tests/equivalent-quantity-route.test.ts`, "deduplicates repeated candidate
  references").

## Regressão de performance da R2/R2.3 (não afetada)

- `MEAL_PLAN_COMPOSER_R2_3_PREVIEW_P50_MS`/`P95_MS`: 380/418ms (medido pós-R3,
  dentro da mesma faixa do relatório original da R2.3).
- `MEAL_PLAN_COMPOSER_R2_FINAL_LARGE_PLAN_RENDER_MS`: 987ms, `RESOLVE_REQUESTS: 2`,
  `SEARCH_REQUESTS: 0` (plano de 37 itens, sem N+1) — inalterado pela R3.
