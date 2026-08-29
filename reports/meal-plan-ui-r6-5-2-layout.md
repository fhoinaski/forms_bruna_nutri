# Meal Plan Composer UX/UI R6.5.2 — Layout

## Mudança entregue

`components/dashboard/MealPlanEditor.tsx`: grid do editor passa de
`xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]`
(2 colunas da R6.5.1) para
`xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[220px_minmax(0,1fr)_360px]`
— o layout `xl` (1280px, viewport padrão de desktop/E2E) permanece
**idêntico** ao da R6.5.1; a 3ª coluna (navegação de refeições) só
existe a partir de `2xl` (1536px+).

`components/dashboard/MealNavigationRail.tsx` (novo): `<nav
aria-label="Refeições">` com `<ul>/<li>/<button>`, `hidden 2xl:block
2xl:sticky 2xl:top-24`. Cada botão mostra horário + nome, clique
dispara `scrollIntoView({behavior:"smooth", block:"start"})` no
`<article id="meal-card-{index}">` correspondente (id novo, aditivo,
adicionado em `MealItemsEditor.tsx`).

## Por que restrito a 2xl (não xl como planejado originalmente)

Ver `-final-qa.md` para o relato completo da regressão. Resumo: em
`xl` (1280px), reservar 220px pra uma 3ª coluna reduzia a coluna
central de "toda a largura disponível" para ~340px — estreito demais
pros food rows de `MealItemsEditor.tsx`, que usam larguras mínimas
fixas em pixels em várias grades internas. Isso causou 2 classes de
falha real (não apenas visual): (1) um grupo de botões de toolbar
sem `flex-wrap` passou a extrapolar a coluna e renderizar visualmente
sob a sidebar de nutrição sticky, interceptando cliques; (2) texto de
badges dentro de food rows ficou clipado/oculto o suficiente pra
falhar checagens de visibilidade do Playwright. A correção definitiva
foi mover a navegação pra `2xl:` (onde sobra espaço real) em vez de
tentar comprimir os food rows para caber em `xl:`.

## Prova (E2E dedicado)

`e2e/meal-plan-ui-r6-5-2-layout.spec.ts`:
- Nav lista horários/nomes reais, clique rola até o card certo,
  exatamente 1 item marcado `aria-current` — **PASS** (viewport
  1600×900, onde a nav está visível).
- Em `xl` (1280px, viewport padrão), a nav simplesmente não aparece —
  layout 2-colunas preservado, sem regressão.

## Escopo fora

Largura/proporções refinadas além do básico funcional, modo de
densidade, max-width dedicado do Composer — não ajustados além do que
já existia.
