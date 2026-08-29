# Meal Plan Composer UX/UI R6.5.5 — Estados (loading/empty/error)

## Entregue

1. **Loading**: substituído texto solto "Buscando..." por uma região
   `role="status" aria-label="Buscando alimentos"` com 3 linhas de
   skeleton compacto (`animate-pulse`), em vez de spinner grande
   (seção 22 do pedido).
2. **Empty**: mensagem em 2 linhas ("Nenhum alimento encontrado." +
   "Tente outro nome ou preparação.") em vez de 1 linha só (seção 24).

## Não implementado

- **Error state** (seção 25) — o combobox atual não distingue
  visualmente "erro de rede" de "sem resultados": no `.catch` do
  fetch (que já existia antes desta fase), uma falha simplesmente
  limpa `foodSuggestions`/`multiSourceResults` pra `[]`, o que faz o
  componente cair no MESMO estado visual de "0 resultados" — não há
  hoje uma distinção de estado "erro" vs. "vazio real". Implementar
  isso corretamente exigiria adicionar um novo estado (`searchError`)
  e testá-lo com uma falha de rede determinística — não implementado
  nesta fase (risco de tocar o fluxo de fetch que a fase pede pra não
  alterar).
- **Retry state** — depende do error state acima; N-A.

## Não extraído (design system)

Nenhum componente `LoadingRows`/`CompactEmptyState`/`InlineErrorState`
compartilhado foi criado — o skeleton e a mensagem de vazio
implementados aqui têm hoje só 1 consumidor real (este combobox).
Documentado como candidato real pra extração quando um 2º consumidor
(ex.: Reuso R4, Receitas R6) redesenhar seus próprios estados de
loading/empty numa fase futura.

## Gate

`MEAL_PLAN_UI_R6_5_5_LOADING_STATE: PASS`
`MEAL_PLAN_UI_R6_5_5_EMPTY_STATE: PASS`
`MEAL_PLAN_UI_R6_5_5_ERROR_STATE: FAIL` (não implementado)
`MEAL_PLAN_UI_R6_5_5_RETRY_STATE: N-A` (depende do error state)
