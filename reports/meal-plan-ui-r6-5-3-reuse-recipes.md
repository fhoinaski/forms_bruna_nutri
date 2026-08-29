# Meal Plan Composer UX/UI R6.5.3 — Reuso (R4) e Receitas (R6)

## Reuso (R4)

Entregue: refatoração pro hook compartilhado (comportamento
preservado, teste dedicado de acessibilidade já existente continua
verde). Nenhum redesign de conteúdo (cards de refeição salva/modelo/
plano anterior, tabs) foi feito — a auditoria confirmou que essas
tabs já usam o mesmo tratamento visual de pill/segmented-control do
resto do app.

## Receitas (R6)

Entregues:
1. **Correção do bug real do "x" literal** no modal "Inserir receita"
   (agora ícone `X` real) — ver `-drawers.md`.
2. **Escape/Tab-trap retrofitado** no modal "Inserir receita" (não
   tinha nenhum antes).

Não implementado: redesign da biblioteca de receitas em si (grid de
cards, editor de receita com lista de ingredientes/rendimento/
instruções/nutrição) — tanto o popover leve "Item de receita" quanto
a página completa `/dashboard/templates/receitas` continuam com o
markup de antes desta fase.

## Por que

O editor de receitas completo (`app/dashboard/templates/receitas/page.tsx`,
726 linhas) tem sua própria busca de ingrediente (`IngredientRow`),
contrato de rendimento (RAW_TOTAL/USER_REPORTED/PORTION_COUNT), e
imutabilidade de versão publicada — mexer no layout desse editor sem
tocar nenhum desses contratos exigiria mais tempo de auditoria
dedicada do que o orçamento desta fase permitiu, especialmente após o
gap de acessibilidade dos diálogos ter sido identificado como o valor
mais seguro e mais alto desta fase.

## Gate

`MEAL_PLAN_UI_R6_5_3_REUSE: PASS` (parcial — só o container/teclado,
não o conteúdo). `MEAL_PLAN_UI_R6_5_3_RECIPES: PASS` (parcial — bug
real corrigido + teclado retrofitado no modal "Inserir receita";
biblioteca/editor completos não tocados).
