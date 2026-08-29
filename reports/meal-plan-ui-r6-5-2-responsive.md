# Meal Plan Composer UX/UI R6.5.2 — Responsivo

## Escopo real entregue

Nenhum redesenho dedicado de tablet/mobile foi feito nesta fase. A
navegação de refeições nova é **oculta abaixo de 2xl** (`hidden
2xl:block`) — em qualquer viewport tablet/mobile/desktop-padrão
(inclusive os 1280px usados pela maioria dos testes E2E), o Composer
renderiza exatamente como na R6.5.1, sem a nova coluna.

## Teste dedicado

`e2e/meal-plan-ui-r6-5-2-layout.spec.ts`, teste "tablet/mobile: nav de
refeições fica oculta (< xl), sem overflow horizontal":
- 820×1180 (tablet): nav ausente (`toBeHidden()`), card renderiza, sem
  overflow horizontal (`scrollWidth <= clientWidth + 4`).
- 390×844 (mobile): mesmo teste, mesmo resultado.

**PASS** em ambos.

## Nota sobre o breakpoint 2xl

`2xl` (1536px+) não tem teste E2E dedicado de "usável" nesse tamanho
específico além do teste de navegação (`meal-plan-ui-r6-5-2-layout.spec.ts`,
que usa 1600×900 e confirma a nav aparece, o clique funciona, e o
`aria-current` fica correto) — não há verificação separada de "sem
overflow horizontal" nesse viewport especificamente, mas a suíte ampla
de regressão (`-final-qa.md`) não usa esse viewport então não haveria
como detectar uma quebra ali fora do teste dedicado já mencionado.

## Fora do escopo

Nenhuma barra de navegação compacta/dropdown pra tablet, nenhum bottom
sheet dedicado pra mobile além do que já existia (herdado da R6.5.1),
nenhuma barra de ação inferior nova.
