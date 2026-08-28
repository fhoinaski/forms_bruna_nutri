# Meal Plan Composer UX/UI R6.5.1 — Final QA / Release Closure

## Nome de fechamento

Fecha como **R6.5.1 — Nutrition Sidebar Visual Upgrade** (não R6.5
completa). Ver `-audit.md` para a tabela de decisão de escopo
completa e a justificativa (apenas a sidebar de nutrição foi
implementada e testada frente às ~109 seções do pedido original).

## Mudança entregue

`components/nutrition/MealPlanNutritionSummary.tsx`
(`MealPlanNutritionWorkspacePanel`):

1. Header de energia com valor prescrito ao lado e "% da meta".
2. 3 barras de progresso reais por macro (proteína/carboidrato/
   gordura) vs. a meta de cada um — substituindo a barra antiga que
   comparava P:C:F entre si (leitura clinicamente sem sentido).
3. "—" consistente para valor ausente em 3 pontos (era "sem dado").

## Regressão real encontrada e corrigida (honestidade de processo)

Durante o broad E2E de fechamento, 4 specs pré-existentes falharam:
`meal-plan-composer-r2-final-flex.spec.ts` (2 testes),
`meal-plan-composer-r2-final-large-plan.spec.ts` (1 teste),
`meal-plan.spec.ts` (1 teste).

**Causa raiz** — SELECTOR_REGRESSION: a primeira versão da mudança
removeu o `<h3>Plano do dia</h3>` (usado como âncora de locator por
`page.locator("aside", { hasText: "Plano do dia" })` e
`page.getByRole("heading", { name: "Plano do dia" })`) e a grade
"primary nutrients" com parágrafos `<p className="text-lg">` (usada
por `sidebar.locator("p.text-lg").first()` para detectar qualquer
atualização de valor nutricional após editar quantidade). A mudança
visual substituiu esses dois elementos por um header novo sem manter
contrato de seletor.

**Fix aplicado**:
1. Heading `<h3>Plano do dia</h3>` restaurado, com a energia/meta
   agora como uma linha adicional logo abaixo (não substituindo o
   heading).
2. Grade "primary nutrients" restaurada (parágrafos `text-lg`),
   **exceto** `energyKcal` — removido dessa grade especificamente
   porque, com o novo header, `energyKcal` passou a aparecer 2x na
   sidebar (`"X kcal"` no header + `"X kcal"` na grade), causando um
   **segundo bug real** descoberto pela mesma rodada de regressão:
   `strict mode violation: locator(...).getByText(/^\d+(–\d+)? kcal$/)
   resolved to 2 elements` em `meal-plan-composer-r2-final-large-plan.spec.ts`.
   Corrigido filtrando `energyKcal` fora do `.map` da grade — protein/
   carb/gordura/fibra continuam na grade (mantendo o `p.text-lg` que o
   teste de N+1 usa para detectar mudança de valor).

**Reprodução após fix** — specs afetadas reexecutadas isoladamente:
12/12 PASS (`meal-plan-composer-r2-final-flex.spec.ts`,
`meal-plan-composer-r2-final-large-plan.spec.ts`, `meal-plan.spec.ts`,
`meal-plan-ui-r6-5-visual.spec.ts`).

## Gates finais

| Gate | Resultado |
| --- | --- |
| TypeScript (`tsc --noEmit`) | PASS, 0 erros |
| ESLint (arquivos alterados) | PASS, 0 erros/avisos |
| Build (`next build`) | PASS (rebuildado após CADA fix — nenhum resultado de teste E2E veio de build stale) |
| Migração (`migrate:d1:check`) | PASS, 71 migrações validadas, 0 novas |
| Runtime DDL guard (`schema:runtime-check`) | PASS |
| Artifact check | PASS, 1274 arquivos rastreados |
| Full Vitest | 2007/2007 PASS (233 arquivos, nenhum teste novo — mudança é só de apresentação) |
| E2E visual dedicado R6.5 (`meal-plan-ui-r6-5-visual.spec.ts`) | 4/4 PASS |
| Broad E2E (chromium-desktop, single worker, após fix final) | 223/223 PASS |
| Broad E2E (default parallelism, chromium-desktop + mobile-chrome) | ver marcador `MEAL_PLAN_UI_R6_5_BROAD_E2E` — reportado à parte com classificação de qualquer falha residual (nunca chamada de flake sem prova) |
| Migrations novas | 0 |
| Escritas em produção | 0 (shim SQLite local do E2E) |

## Sem segundo calculador (seção 13 do pedido)

Confirmado por leitura de código: `percentOfTarget` e `formatValue`
operam apenas sobre `max[key]`/`min[key]`/`target[key]` — valores que
chegam já calculados pelo Nutrition Engine via
`useMealPlanNutritionData`/`calculateFlexiblePlanNutrients`. Nenhuma
lógica de cálculo nutricional nova foi introduzida na camada visual.
As faixas min/max de OPTIONS/COMBINATION continuam vindo do mesmo
`flexibleResult.total` — não alteradas.

## Escopo conscientemente fora desta fase

Ver `-audit.md` (tabela completa). Resumo: layout 3 colunas, cards de
refeição, linhas de alimento com edição inline, visual de OPTIONS/
COMBINATION, toolbar, drawers padronizados, integração visual do
Copilot, redesenho dedicado de tablet/mobile, tokens de design,
atalhos de teclado, extração de design system, acessibilidade
dedicada e medição formal de performance — nenhum implementado nesta
fase.

## Regra de conclusão

`MEAL_PLAN_UI_R6_5_COMPLETE: nao` — a fase entrega um upgrade real,
testado e sem regressão (após a correção documentada acima) da
Nutrition Sidebar, mas não o escopo amplo de 109 seções do pedido
original. Fecha como R6.5.1, com R6.5.2 (layout/cards/navegação) e
R6.5.3 (drawers/Copilot/responsivo dedicado/tokens/acessibilidade)
como follow-ups sugeridos.
