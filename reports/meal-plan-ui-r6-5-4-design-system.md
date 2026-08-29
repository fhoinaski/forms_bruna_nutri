# Meal Plan Composer UX/UI R6.5.4 — Design system

## Não implementado nesta fase

Nenhuma extração de componente compartilhado (`DrawerShell`,
`DrawerHeader`, `DrawerSearchField`, `SegmentedControl`/`CompactTabs`,
`ResultRow`, `CompactCard`, `InlineStatus`, `CompactEmptyState`,
`InlineErrorState`, `LoadingRows`, `ReviewChip`) foi feita. As 3
entregas reais desta fase (timestamp, chips de revisão, badge de
prontidão) foram implementadas inline, sem criar novos arquivos de
componente compartilhado.

## Por que

O pedido pede explicitamente (seção 3 da R6.5.3, reafirmado aqui) que
extração só aconteça quando 2+ consumidores reais se alinham. Os
"chips" e o "badge" desta fase têm hoje só 1 consumidor real (o
Assistente de IA) — extrair um `ReviewChip`/`InlineStatus`
genérico agora, sem um segundo uso real, seria exatamente a
abstração prematura que o pedido avisa pra evitar (seção 4:
"Do NOT create... components with dozens of unrelated props").

## Candidatos reais pra uma extração futura (se um 2º consumidor aparecer)

- Chip de contagem com ícone (usado no resumo de revisão do Copilot)
  — se a biblioteca de reuso ou a busca de alimento algum dia
  precisar de um padrão de "N itens/M avisos", esse seria o segundo
  caso de uso real que justificaria a extração.
- Badge de status com ícone (usado na prontidão do Copilot) — mesmo
  padrão da badge de estrutura (Simples/Opções/Combinação, R6.5.2) e
  do status Rascunho/Ativo do toolbar; os 3 já são visualmente quase
  idênticos (pill com borda + fundo colorido + texto), mas cada um
  implementado separadamente — candidato real de consolidação numa
  fase futura dedicada a isso especificamente.

## Gate

`MEAL_PLAN_UI_R6_5_4_DESIGN_SYSTEM: FAIL` para extração de
componentes (não implementado, por decisão consciente de não
prematuramente abstrair com 1 consumidor só).
