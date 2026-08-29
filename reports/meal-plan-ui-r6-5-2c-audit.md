# Meal Plan Composer UX/UI R6.5.2C — Auditoria

## Objetivo

Fechar os 2 últimos blockers da R6.5.2 (`MEAL_ACTION_MENU`, `FOOD_ROW`),
liberando `MEAL_PLAN_UI_R6_5_2_COMPLETE: sim` e
`MEAL_PLAN_UI_R6_5_3_SAFE_TO_START: sim`.

## Auditoria (antes de qualquer edição)

**Ações de nível refeição** (`MealItemsEditor.tsx`, header do
`<article>`), mapeadas ANTES da mudança:
- Sempre visíveis: reordenar (▲/▼), Duplicar, "Mais ações" (⋯).
- Dentro do "⋯": Sugerir com IA, Salvar como receita, Salvar como
  refeição favorita (R4, só com `clientId`), Excluir refeição.

**Seletores E2E que tocam essas ações**, encontrados via grep em TODO
`e2e/*.ts` (não só amostra):
- `getByTitle("Mover refeicao para cima")` — 1 uso
  (`meal-plan-ux2.spec.ts:57`).
- `getByRole("button", { name: /duplicar {meal}/i })` — 1 uso
  (`meal-plan-ux2.spec.ts:80`).
- `getByRole("button", { name: /mais ações para/i })` — 1 uso
  (`meal-plan-reuse-r4-library.spec.ts:68`).
- Nenhum outro spec referencia esses 3 padrões (grep exaustivo, não
  amostral — a auditoria da R6.5.2 havia estimado "≥6 specs" de forma
  conservadora; o número real é 2 arquivos, 3 linhas).

**Food row** (item de alimento), mapeado ANTES da mudança: já
consolidado num menu "⋯" próprio (`aria-label="Mais ações do
alimento"`) desde antes desta fase — Editar, Bloquear/Desbloquear,
Permitir/Pausar sugestões, Mover, Duplicar, Excluir. A linha colapsada
mostra: rótulo/grupo, nome do alimento + badges, quantidade em texto,
botão "Trocas" (R3), e o "⋯". Nenhuma ação nova precisou ser
consolidada — o requisito real em aberto era "compacto/profissional",
não "menos ações visíveis".

## Decisão de escopo

1. **Menu de ações da refeição**: Mover (▲/▼) e Duplicar movidos pra
   dentro do "⋯" (mesmos handlers/aria-labels de conteúdo, só a
   localização mudou), com acessibilidade real nova
   (`aria-haspopup="menu"`, `aria-expanded`, `role="menu"`, Escape
   fecha e devolve foco ao gatilho — tudo testado). Aria-label do
   gatilho mudou de "Mais ações para {meal}" pra "Ações da refeição
   {meal}" (pedido explícito da seção 7) — as 3 linhas de teste
   afetadas foram atualizadas deliberadamente (não um mass-rewrite).
2. **Food row**: como o menu de ações do item JÁ estava consolidado,
   a mudança aplicada foi puramente visual/CSS — o botão "Mais ações
   do alimento" fica com opacidade 0 em desktop (`md:`) até
   hover/foco no grupo (`group-hover`/`group-focus-within`), sempre
   visível em mobile (sem `md:`, o CSS de opacidade não se aplica
   abaixo do breakpoint). Nenhuma mudança estrutural, nenhum
   aria-label alterado, nenhum handler tocado — risco mínimo.

## Por que não uma reestruturação maior do food row

Confirmado por grep exaustivo que o menu de ações do alimento já
existia consolidado — o pedido original da R6.5.2 (item 16, "se a
linha expõe ações demais, mover as secundárias pro ⋯") já estava
satisfeito antes desta fase. O único gap real e de baixo risco era
visual (hover-reveal), aplicado aqui.
