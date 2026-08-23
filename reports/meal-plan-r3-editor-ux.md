# R3 - Meal Plan Editor UX Restructure

Data: 2026-08-23

## Escopo

R3 executada como reestruturação visual/funcional do editor de Plano Alimentar, sem alterar Nutrition Engine, resolver, ranking, schema ou contratos R1/R2.

## Entregas

- Cabeçalho sticky do plano com status, versão, estado de salvamento e ações principais.
- Cartão grande de criação removido quando já existe plano selecionado; fluxo fica em botão compacto "Novo plano".
- Refeições e alimentos renderizados em layout clínico compacto por padrão.
- Cada alimento mostra papel clínico, alimento, quantidade prescrita e resumo de alternativas.
- Edição inline limitada a um item por vez.
- Alternativas migradas para drawer lateral, com fechamento por Escape, backdrop e botão explícito.
- Plano ativo renderizado como leitura compacta; edição exige duplicar para rascunho.
- Sidebar nutricional mantida em coluna sticky no desktop e responsiva no mobile.
- Drawer em plano ativo fica somente para consulta, sem gerar/aprovar alterações.
- Mensagens da tela principal mantidas em linguagem clínica curta; detalhes técnicos ficam fora do fluxo principal.

## Arquivos Alterados

- `components/dashboard/MealPlanEditor.tsx`
- `components/dashboard/MealItemsEditor.tsx`
- `tests/meal-plan-r3-editor-ux.test.ts`
- `e2e/meal-plan-r3-editor-ux.spec.ts`
- `reports/screenshots/meal-plan-r3-drawer-chromium-desktop.png`
- `reports/screenshots/meal-plan-r3-drawer-mobile-chrome.png`
- `reports/screenshots/meal-plan-r3-active-chromium-desktop.png`
- `reports/screenshots/meal-plan-r3-active-mobile-chrome.png`

## Evidências

- `npm run ci:artifact-check`: PASS
- `npm run migrate:d1:check`: PASS - 67 migrações validadas
- `npm run schema:runtime-check`: PASS
- `npm run lint`: PASS
- `npx tsc --noEmit`: PASS
- `npm test -- tests/meal-plan-r1-data-consistency.test.ts tests/meal-plan-r2-template-integrity.test.ts tests/meal-plan-r3-editor-ux.test.ts`: PASS - 11 testes
- `npm test`: PASS - 200 arquivos, 1771 testes
- `npm run build`: PASS
- `npx playwright test e2e/meal-plan-r3-editor-ux.spec.ts` com `E2E_PORT=3010`: PASS - 4 testes
- `npx playwright test e2e/meal-plan-r1-data-consistency.spec.ts e2e/meal-plan-r2-template-integrity.spec.ts` com `E2E_PORT=3011`: PASS - 4 testes

## Observações

- A compatibilidade com regressões R1/R2 foi preservada sem reabrir inputs visíveis no modo compacto.
- Screenshots foram gerados em desktop e mobile para drawer de alternativas e plano ativo.
- Benchmark externo não foi reconsultado nesta etapa R3; a fase partiu do estado auditado e validado das fases anteriores.

## Marcadores

R3_ACTIVE_VIEW_READY: sim
R3_DRAFT_VIEW_READY: sim
R3_COMPACT_MEAL_LAYOUT: PASS
R3_ITEM_EDITING: PASS
R3_EXCHANGE_DRAWER: PASS
R3_ERROR_UX: PASS
R3_NUTRITION_SIDEBAR: PASS
R3_RESPONSIVE_BASELINE: PASS
R3_ACCESSIBILITY_BASELINE: PASS
R3_R1_REGRESSION: PASS
R3_R2_REGRESSION: PASS
R3_VISUAL_REVIEW_READY: sim
R3_FULL_GATES: PASS
MEAL_PLAN_R3_READY: sim
