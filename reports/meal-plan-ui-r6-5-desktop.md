# Meal Plan Composer UX/UI R6.5 — Desktop

## Mudança entregue

`MealPlanNutritionWorkspacePanel` (sidebar de nutrição, consumida por
`MealPlanEditor.tsx`):

1. **Header de energia** — valor calculado em destaque (`font-serif
   text-2xl`) com a meta ao lado (`/ 2000 kcal`) quando
   `target.energyKcal` existe, e uma linha "`XX% da meta`" logo abaixo
   quando o percentual é computável.
2. **3 barras de progresso por macro** (proteína/carboidrato/gordura),
   cada uma vs. a META daquele macro especificamente — substituindo a
   barra antiga que mostrava P:C:F como proporção entre si (que não
   comunicava aderência à meta). `role="progressbar"` com
   `aria-valuenow/min/max/label` reais.
3. **"—" para ausente**, nunca "0%"/"sem dado", em 3 pontos: valor
   formatado, diferença meta×prescrito, e cada micronutriente.

## Prova (E2E dedicado, não apenas captura visual)

`e2e/meal-plan-ui-r6-5-visual.spec.ts`, teste "desktop: header de
energia/meta, barras de progresso por macro, missing como —":
cria paciente + plano com meta explícita (2000 kcal / 100 g proteína /
250 g carboidrato / 65 g gordura), navega até a aba "Plano alimentar",
e verifica via assertions reais (não screenshot-only):

- `/ 2000 kcal` visível.
- "% da meta" visível.
- exatamente 3 elementos `[role="progressbar"]`.
- nenhum texto "0%" na tela, mesmo após expandir "Micronutrientes"
  (que tem múltiplos valores ausentes nesse fixture).

**Resultado: PASS.**

## Screenshot (before/after)

`reports/screenshots/meal-plan-ui-r6-5-desktop-chromium-desktop.png`
(capturado como parte do teste acima — mostra o estado ATUAL/depois;
não há captura "antes" formal porque a mudança é pontual e descrita
textualmente na auditoria).

## Fora do escopo desta fase (ver `-audit.md`)

Layout 3 colunas, cards de refeição, linhas de alimento compactas,
toolbar, drawers, Copilot — nenhum alterado.
