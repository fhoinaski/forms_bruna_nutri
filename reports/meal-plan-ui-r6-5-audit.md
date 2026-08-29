# Meal Plan Composer UX/UI R6.5 — Auditoria visual (BEFORE)

## Objetivo do pedido

Elevar o Composer a um nível visual/profissional comparável a software
maduro de prescrição nutricional (referência conceitual: Nutrium e
similares — sem copiar layout/ícones/marca/componentes/texto
proprietário, construindo identidade própria).

## Estado ANTES desta fase (auditoria)

- **Sidebar de nutrição** (`MealPlanNutritionSummary.tsx`,
  `MealPlanNutritionWorkspacePanel`): energia mostrada sem destaque
  visual de header, sem % da meta ao lado do valor. Distribuição de
  "macros" era uma única barra empilhada mostrando P:C:F **entre si**
  (proporção relativa), não cada macro **vs. a meta prescrita** — uma
  leitura clinicamente enganosa (uma barra "cheia" não dizia nada sobre
  estar dentro/fora da meta). Valores ausentes (`null`) apareciam como
  texto "sem dado" em vez de um símbolo compacto e consistente.
- **Layout geral do Composer, cards de refeição, linhas de alimento,
  toolbar, drawers de busca/substituição/reuso/receita, integração do
  Copilot, tablet/mobile, tokens de tipografia/espaçamento/cor,
  atalhos de teclado, extração de design system**: NÃO auditados nem
  alterados nesta fase (ver seção de escopo fora abaixo).

## Decisão de escopo desta fase

Dado o volume do pedido (109 seções) frente ao tempo disponível, esta
fase entregou **uma fatia vertical real e testada** — a sidebar de
nutrição — em vez de uma alteração superficial em muitas áreas ao
mesmo tempo. Isso segue a norma já estabelecida no projeto (R5, R6) de
documentar honestamente o que foi feito vs. não feito, em vez de
declarar conclusão total.

## O que foi entregue (ver `-desktop.md`, `-mobile.md`, `-final-qa.md`)

1. Header de energia com valor prescrito ao lado (`/ 2000 kcal`) e
   "% da meta" abaixo, quando a meta existe.
2. 3 barras de progresso reais (proteína/carboidrato/gordura), cada uma
   comparada à META daquele macro (não ao total de macros entre si).
   Cor neutra + sem preenchimento quando o dado está ausente (nunca
   "0%"). Cor de alerta (fora da faixa 85–115%) vs. cor "no alvo".
3. Símbolo consistente "—" para todo valor ausente (era "sem dado"),
   nos 3 pontos onde esse texto aparecia: valor formatado, diferença
   meta×prescrito, e micronutrientes.

## Escopo conscientemente FORA desta fase (não implementado)

- Layout 3 colunas / reestruturação do editor central.
- Cards de refeição compactos com menu "⋯" / badge de estrutura.
- Linhas de alimento compactas com ações hover/foco e edição inline.
- Divisor "OU" pra OPTIONS / seções fixos-escolha-opcional pra
  COMBINATION.
- Toolbar consolidada (CTA único, badge RASCUNHO/PUBLICADO, feedback
  de salvamento).
- Drawers padronizados (Food Search, Substituição, Reuso, Receita).
- Integração visual do Copilot.
- Estados vazios simplificados.
- Auditoria/tokens de tipografia, espaçamento, cor, borda, sombra.
- Responsividade dedicada de tablet/mobile além do teste de
  "não quebra" já existente (sem redesenho de 1 coluna/bottom sheet).
- Modo de densidade opcional.
- Atalhos de teclado, foco após ações, scroll suave.
- Banners de erro inline, skeletons.
- Extração de design system (Panel/SectionHeader/CompactButton/
  StatusBadge/Drawer/SegmentedControl/NutritionProgress).

Estas ausências são deliberadas e documentadas, não bugs.

## Tabela de decisão de escopo (pedido original × entregue)

| Requirement (seção do pedido) | Implemented | Tested | Status | Reason |
| --- | --- | --- | --- | --- |
| Nutrition sidebar: energia/meta no topo (20) | Sim | Sim (E2E) | PASS | Entregue nesta fase |
| Nutrition sidebar: barras de progresso por macro vs. meta (21-22) | Sim | Sim (E2E) | PASS | Entregue nesta fase |
| Missing = "—", nunca "0%" (25) | Sim | Sim (E2E) | PASS | Entregue nesta fase |
| Layout 3 colunas desktop | Não | Não | NOT_IMPLEMENTED | Fora do escopo de tempo desta fase |
| Meal nav / cards compactos + menu "⋯" | Não | Não | NOT_IMPLEMENTED | Fora do escopo de tempo desta fase |
| Linhas de alimento compactas + edição inline | Não | Não | NOT_IMPLEMENTED | Fora do escopo de tempo desta fase |
| OPTIONS visual ("OU") | Não | Não | NOT_IMPLEMENTED | Fora do escopo de tempo desta fase |
| COMBINATION visual (seções) | Não | Não | NOT_IMPLEMENTED | Fora do escopo de tempo desta fase |
| Toolbar consolidada / status badge | Não | Não | NOT_IMPLEMENTED | Fora do escopo de tempo desta fase |
| Drawers padronizados (busca/substituição/reuso/receita) | Não | Não | NOT_IMPLEMENTED | Fora do escopo de tempo desta fase |
| Integração visual do Copilot | Não | Não | NOT_IMPLEMENTED | Fora do escopo de tempo desta fase |
| Tablet/mobile: redesenho dedicado (1 coluna real, bottom sheet, barra de ação) | Não | Parcial (só teste de não-quebra) | NOT_IMPLEMENTED | Só regressão coberta, não redesenho |
| Tokens de tipografia/espaçamento/cor | Não | Não | NOT_IMPLEMENTED | Fora do escopo de tempo desta fase |
| Atalhos de teclado / foco / scroll suave | Não | Não | NOT_IMPLEMENTED | Fora do escopo de tempo desta fase |
| Extração de design system | Não | N/A | NOT_IMPLEMENTED | Sem 2º uso real que justifique (ver `-design-system.md`) |
| Acessibilidade dedicada | Não | Não | NOT_IMPLEMENTED | Só a marcação nativa do que foi mudado |
| Performance formal (p50/p95) | Não | Não | NOT_IMPLEMENTED | Não medido, ver `-performance.md` |

## Decisão de fechamento (seção 26 do pedido)

Escopo real entregue = apenas a Nutrition Sidebar (energia/meta, barras
de progresso por macro, missing seguro) + a correção de uma regressão
real encontrada durante o fechamento (ver `-final-qa.md`). A grande
maioria do pedido de 109 seções NÃO foi implementada.

Por isso esta fase fecha como **R6.5.1 — Nutrition Sidebar Visual
Upgrade**, não como R6.5 completa. `MEAL_PLAN_UI_R6_5_COMPLETE: nao`.
Follow-ups sugeridos para continuar o pedido original:

- **R6.5.2** — Composer layout (3 colunas), meal cards compactos,
  navegação de refeições, linhas de alimento com edição inline.
- **R6.5.3** — Drawers padronizados (busca/substituição/reuso/receita),
  integração visual do Copilot, polish responsivo dedicado
  (tablet/mobile), tokens de design, acessibilidade e atalhos de
  teclado.
