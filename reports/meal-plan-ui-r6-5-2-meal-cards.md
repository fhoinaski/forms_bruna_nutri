# Meal Plan Composer UX/UI R6.5.2 — Meal cards

## O que foi entregue

1. **Badge de estrutura** (Simples/Opções/Combinação) no header de
   cada `<article>` — `<span>` discreto ao lado do nome da refeição,
   computado de `meal.meal_structure`. Puramente apresentacional: não
   lê nem escreve nenhum outro campo, não afeta cálculo.
2. **Divisor "OU"** entre alternativas de OPTIONS — inserido via
   `<Fragment>` no `.map` de `meal.options`, mostrado apenas entre
   opções consecutivas (`optionIndex > 0`), `aria-hidden="true"`
   (puramente decorativo, o `aria-label` de cada opção já comunica
   "Opção N" pra leitor de tela). Cada opção também ganhou uma borda
   esquerda sutil (`border-l-2`) pra reforçar a separação visual sem
   introduzir cards pesados aninhados (pedido explícito da seção 31).
3. **`id="meal-card-{index}"`** em cada `<article>` — usado pela nova
   navegação pra scroll-to-meal; aditivo, não substitui nem remove a
   estrutura `<article>` que dezenas de specs já localizam.

## O que NÃO foi entregue (consolidação do header)

O pedido pedia mover Duplicar/reordenar pro menu "⋯" (seção 15,
"Reutilizar R4. Não criar CTAs duplicadas"). Isso NÃO foi feito: os
botões de Duplicar (`aria-label="Duplicar {meal}"`) e reordenar
(`aria-label="Mover {meal} para cima/baixo"`) continuam como botões
sempre visíveis, separados do menu "⋯" — exatamente como estavam
antes desta fase.

**Motivo**: a auditoria (seção 1 do pedido) identificou que pelo menos
6 specs de E2E (incluindo `meal-plan-ux2.spec.ts`) testam esses botões
diretamente por esse aria-label/posição. Consolidá-los no menu "⋯"
exigiria atualizar deliberadamente cada um desses testes — trabalho
real, mas fora do orçamento de tempo desta fase depois que a
regressão de layout (ver `-final-qa.md`) consumiu a maior parte do
tempo disponível. Documentado como candidato real pra R6.5.3, não
abandonado por decisão de design.

## Compatibilidade confirmada

Todos os aria-labels indexados de OPTIONS/COMBINATION (`Alimento {n}
da opção {m}`, `Nome do grupo {m}`, etc.) permanecem inalterados —
confirmado pelo teste dedicado (`meal-plan-ui-r6-5-2-layout.spec.ts`)
que lê `getByLabel("Nome da opção 1")`/`"Nome da opção 2"` após a
mudança e pela suíte ampla de regressão (ver `-final-qa.md`).
