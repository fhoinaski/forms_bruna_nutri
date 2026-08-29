# Meal Plan Composer UX/UI R6.5 — Tablet / Mobile

## Escopo real entregue

Nenhum redesenho de layout tablet/mobile foi feito nesta fase (sem
coluna única dedicada, sem bottom sheet para nutrição, sem barra de
ação inferior, sem drawers em tela cheia). O que foi verificado é que
a mudança feita (sidebar de nutrição) **não quebra** o app em
viewports estreitos — um teste de não-regressão, não uma entrega de
responsividade nova.

## Teste dedicado

`e2e/meal-plan-ui-r6-5-visual.spec.ts`:

- **Tablet (820×1180)**: paciente sem plano ainda (estado vazio),
  navega até "Plano alimentar", verifica que o heading
  "Prescrição visual para o cliente" (estado vazio real do produto)
  renderiza, e que `document.documentElement.scrollWidth` não excede
  `clientWidth` (nenhum overflow horizontal quebrado introduzido).
  **PASS.**
- **Mobile (390×844)**: mesmo teste, mesmo viewport móvel. **PASS.**

Screenshots capturados:
`reports/screenshots/meal-plan-ui-r6-5-tablet-chromium-desktop.png`,
`reports/screenshots/meal-plan-ui-r6-5-mobile-chromium-desktop.png`.

## Nota sobre o teste

A primeira versão do teste assumia (incorretamente) um botão "Novo
plano" como sinal de estado vazio carregado — esse botão não existe
nesse estado real do produto. Inspecionando a árvore de acessibilidade
capturada na falha, os CTAs reais do estado vazio são "Criar por
modelo" e "Criar com IA", e o heading estável é "Prescrição visual
para o cliente" — usado no assert final. Correção de teste, não do
produto.

## Fora do escopo desta fase

Nenhuma mudança visual dedicada de tablet/mobile (1 coluna real,
bottom sheet, barra de ação ≤2 botões, alvos de toque ≥44px, drawers
em tela cheia) foi implementada — ver `-audit.md`.
