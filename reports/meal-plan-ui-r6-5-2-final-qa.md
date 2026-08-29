# Meal Plan Composer UX/UI R6.5.2 — Final QA / Release Closure

## Escopo entregue

Navegação de refeições (clique-para-rolar + destaque de item ativo via
`IntersectionObserver`, `aria-current`), badge de estrutura
(Simples/Opções/Combinação) nos meal cards, e divisor "OU" entre
alternativas de OPTIONS — todos puramente aditivos/apresentacionais.
O layout de 3 colunas só é ativado em telas largas (`2xl`, 1536px+);
no breakpoint padrão (`xl`, 1280px) o Composer permanece IDÊNTICO ao
layout de 2 colunas da R6.5.1.

## Regressão real encontrada e corrigida (honestidade de processo)

A primeira versão desta fase introduzia a navegação já no breakpoint
`xl` (1280px), reservando 220px pra ela e encolhendo a coluna central.
O broad E2E de fechamento revelou **12 falhas reais** (não flake —
reproduzidas de forma consistente em execução isolada):
`meal-plan-full-cycle.spec.ts`, `meal-plan-r2-template-integrity.spec.ts`,
`meal-plan-recipe-portion-print.spec.ts`, `meal-plan-reuse-r4-library.spec.ts`
(6 testes), `meal-plan-reuse-r4-performance.spec.ts` (2 testes).

**Investigação** (evitando classificar como flake sem prova, seguindo
a exigência explícita desta fase):
1. Reproduzido `meal-plan-reuse-r4-library.spec.ts:23` isolado — falha
   consistente (clique em "Usar modelo" interceptado por
   `<aside>`/`<header>`).
2. Testado o MESMO teste contra a baseline R6.5.1 (`git stash` +
   rebuild) — **passa limpo**. Confirma regressão real desta fase, não
   pré-existente.
3. Debug dirigido (script temporário com `boundingBox()` de cada
   elemento envolvido) revelou: o grupo de botões da toolbar
   ("Gerar trocas para todos" / "Adicionar refeição" / "Inserir
   receita" / "Usar modelo", `className="grid gap-2 sm:flex"`, SEM
   `flex-wrap`) tinha largura natural de ~608px, mas sua coluna pai
   (centro) só tinha 340px de largura após a coluna nova de navegação
   ser reservada — o grupo de botões **extrapolava ~268px pra dentro
   do espaço visual da 3ª coluna** (a sidebar de nutrição sticky),
   fazendo cliques naquela região caírem sobre a sidebar em vez do
   botão.
4. Duas outras falhas (`meal-plan-r2-template-integrity`,
   `meal-plan-recipe-portion-print`) mostravam texto de badge/contagem
   marcado como "hidden" pelo Playwright — mesma causa raiz: os food
   rows de `MealItemsEditor.tsx` usam larguras mínimas fixas em pixels
   em várias grades internas (`minmax(0,150px)`, `120px`,
   `minmax(140px,190px)`, etc.) que não cabem numa coluna central de
   340px, causando clipping/overflow.

**Fix aplicado (2 partes)**:
1. **Estrutural**: o layout de 3 colunas foi movido de `xl:` (1280px)
   para **`2xl:` (1536px+)** — no breakpoint padrão de 1280px (usado
   pela maioria das telas/pelo E2E), o grid volta a ser EXATAMENTE
   `xl:grid-cols-[minmax(0,1fr)_320px]`, igual à R6.5.1, sem nenhuma
   coluna nova reservada. A navegação (`MealNavigationRail`) só
   renderiza (`hidden 2xl:block`) em telas onde sobra espaço real.
2. **Defensivo**: adicionado `sm:flex-wrap sm:justify-end` ao grupo de
   botões da toolbar, pra que ele quebre em múltiplas linhas em vez de
   extrapolar horizontalmente, caso uma coluna estreita apareça de
   novo no futuro (ex.: se a 3ª coluna algum dia precisar ativar em
   `xl` com um design mais compacto).

**Reprodução após fix** — TODOS os 12 testes que falhavam foram
reexecutados isoladamente: **12/12 PASS**. Full broad E2E
single-worker reexecutado do zero: **226/226 PASS**.

## Gates finais

| Gate | Resultado |
| --- | --- |
| TypeScript (`tsc --noEmit`) | PASS, 0 erros |
| ESLint (arquivos alterados) | PASS, 0 erros/avisos |
| Build (`next build`) | PASS (rebuildado após CADA fix) |
| Migração (`migrate:d1:check`) | PASS, 71 migrações validadas, 0 novas |
| Runtime DDL guard (`schema:runtime-check`) | PASS |
| Artifact check | PASS, 1290 arquivos rastreados |
| Full Vitest | 2012/2012 PASS (234 arquivos; 5 testes novos em `tests/meal-plan-ui-r6-5-2-navigation.test.ts`) |
| E2E dedicado R6.5.2 (`meal-plan-ui-r6-5-2-layout.spec.ts`) | 4/4 PASS (nav+scroll+aria-current, badge+divisor OU, responsivo tablet/mobile, acessibilidade/teclado) |
| E2E R6.5.1 (regressão própria: `meal-plan-ui-r6-5-visual.spec.ts`) | 4/4 PASS (1 selector ajustado: texto "Refeição 8" agora colide com a nav nova, escopado pra `article` — fix de teste, não de produto) |
| Broad E2E (chromium-desktop, single worker, pós-fix final) | 226/226 PASS |
| Broad E2E (default parallelism, ambos os projetos) | ver marcador `MEAL_PLAN_UI_R6_5_2_BROAD_E2E` |
| Migrations novas | 0 |
| Escritas em produção | 0 (shim SQLite local do E2E) |

## Sem segundo calculador / Nutrition Engine intocado

Confirmado por leitura de código: nenhuma das mudanças desta fase toca
`lib/nutrition/*` ou `MealPlanNutritionSummary.tsx`'s lógica interna
(só é envolvida pela nova coluna de grid, sem alteração de props/
cálculo). `MealNavigationRail` deriva apenas de `name`/`suggested_time`
— nenhum dado nutricional.

## Escopo conscientemente fora desta fase

Ver `-audit.md` (tabela completa). Resumo: consolidação de ações do
meal card no menu "⋯", redesign de food rows/edição inline, visual de
COMBINATION além do que já existia, toolbar/status refinements,
atalhos de teclado (Ctrl+S), scroll-to-new-meal, foco após adicionar
alimento, banners de erro inline, drawers padronizados, integração
visual do Copilot, matriz formal de compatibilidade R3/R4/R5/R6,
medição formal de performance, tooling de acessibilidade (axe),
extração de design system.

## Regra de conclusão

`MEAL_PLAN_UI_R6_5_2_COMPLETE: nao` — o escopo real entregue (nav +
badge + divisor OU, restrito a 2xl) é pequeno frente às 120 seções do
pedido, mas é real, testado, sem regressão (após a correção
documentada acima), e a acessibilidade do que foi construído passa
(diferente da R6.5.1). `MEAL_PLAN_UI_R6_5_3_SAFE_TO_START: nao` — a
regra do pedido (seção 119) só permite declarar isso quando
`R6_5_2_COMPLETE: sim`, o que não é o caso.
