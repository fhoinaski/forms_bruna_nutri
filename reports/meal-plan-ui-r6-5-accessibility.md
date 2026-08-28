# Meal Plan Composer UX/UI R6.5 — Acessibilidade

## O que foi feito

A mudança real desta fase (barras de progresso do painel de nutrição)
usa marcação de acessibilidade nativa correta:

- `role="progressbar"` com `aria-valuenow`/`aria-valuemin`/
  `aria-valuemax`/`aria-label` em cada uma das 3 barras (proteína/
  carboidrato/gordura), com `aria-valuenow` omitido (`undefined`)
  quando o valor é desconhecido — não um `0` enganoso para leitor de
  tela.
- Nenhum novo elemento interativo sem rótulo foi introduzido (as
  barras não são clicáveis, não precisam de foco de teclado).

## O que NÃO foi feito (auditoria dedicada de acessibilidade, seção 96)

- Nenhuma auditoria de navegação por teclado do Composer como um todo.
- Nenhuma verificação de contraste formal (WCAG AA) dos novos textos
  (`text-[#8C6E52]` sobre `#FAF7F2`, etc.) — herdados da paleta já
  existente no componente, não uma paleta nova desta fase, mas também
  não auditados agora.
- Nenhum teste de leitor de tela (NVDA/VoiceOver) executado.
- Nenhuma revisão de ordem de tabulação, foco após ações, ou texto
  para leitor de tela em áreas fora do painel de nutrição (toolbar,
  drawers, cards de refeição) — porque essas áreas não foram tocadas
  nesta fase.

## Gate

`MEAL_PLAN_UI_R6_5_ACCESSIBILITY: FAIL` — auditoria dedicada não
realizada (mesma honestidade de processo já usada em R6 pra este
mesmo gate). A marcação semântica introduzida é correta pro que foi
mudado, mas isso não substitui uma auditoria completa.
