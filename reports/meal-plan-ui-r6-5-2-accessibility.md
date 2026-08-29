# Meal Plan Composer UX/UI R6.5.2 — Acessibilidade

## Escopo desta auditoria

Restrito ao que foi de fato construído nesta fase: a navegação de
refeições nova (`MealNavigationRail`) e o badge de estrutura/divisor
"OU" (puramente decorativos, sem interação). **Não** é uma auditoria
do Composer inteiro — essa continua pendente (ver `-audit.md`,
escopo fora, e follow-ups R6.5.3).

## O que foi verificado (e passa)

1. **Landmark nomeado**: `<nav aria-label="Refeições">` — não é uma
   `<div>` genérica; leitores de tela anunciam "navegação, Refeições".
2. **Estrutura semântica de lista**: `<ul>/<li>/<button>` reais, não
   `<div>`s clicáveis.
3. **Teclado**: cada item é um `<button type="button">` nativamente
   focável (sem `tabindex` negativo). `Tab` avança pro próximo item na
   ordem lógica (testado: primeiro botão → segundo botão). `Enter`
   ativa o botão (comportamento nativo de `<button>`, testado:
   dispara a mesma navegação/scroll que o clique do mouse).
4. **`aria-current`**: exatamente 1 item marcado como atual a qualquer
   momento (nunca 0, nunca >1) — testado após clique E após ativação
   por teclado.
5. **Sem supressão de foco visível no código**: nenhuma classe
   `outline-none`/`focus:outline-none` foi aplicada aos botões da nav
   (checagem estática via `className`) — o navegador mostra seu
   indicador de foco padrão.
6. **Não depende só de cor**: o item ativo é diferenciado por peso de
   fonte (`font-semibold`) + fundo (`bg-[#F5EAD9]`) + `aria-current`,
   não apenas por uma cor de texto/borda.

## Teste dedicado

`e2e/meal-plan-ui-r6-5-2-layout.spec.ts`, teste "acessibilidade: nav
de refeições é landmark nomeado, itens são focáveis por teclado com
foco visível, aria-current único" — **PASS**.

## O que NÃO foi auditado

- O Composer como um todo (toolbar, food rows, drawers, cards) — só a
  navegação nova.
- Contraste de cor formal (WCAG AA) dos tokens usados no badge/nav —
  reaproveitam a paleta já existente do projeto, não uma paleta nova,
  mas não foram medidos numericamente nesta fase.
- Tooling automatizado (axe) — o projeto não tem axe integrado; os
  checks acima foram feitos manualmente via Playwright (role/aria/
  keyboard), não uma varredura automatizada.
- Leitor de tela real (NVDA/VoiceOver) — não executado.

## Gate

`MEAL_PLAN_UI_R6_5_2_ACCESSIBILITY: PASS` para o escopo real desta
fase (a navegação nova) — diferente da R6.5.1, que fechou com FAIL
porque não tinha auditoria nenhuma pro que foi mudado. Esta fase
constrói pouco, mas o pouco que constrói é auditado e passa.
