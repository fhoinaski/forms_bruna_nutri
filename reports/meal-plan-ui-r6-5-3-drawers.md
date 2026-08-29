# Meal Plan Composer UX/UI R6.5.3 — Sistema de drawers

## Entregue: `useDialogKeyboard` (hook compartilhado)

`hooks/use-dialog-keyboard.ts` — extrai a lógica de Escape-fecha +
Tab/Shift+Tab-nunca-escapa que existia duplicada (copy-paste quase
idêntico) em `MealItemsEditor.tsx` (drawer de trocas) e
`ReuseLibraryDrawer.tsx`. Assinatura:

```ts
useDialogKeyboard(containerRef: RefObject<HTMLElement | null>, onClose: () => void, active: boolean)
```

Aplicado em **4 superfícies**:
1. Drawer de trocas (`MealItemsEditor.tsx`) — refatorado, mesmo
   comportamento de antes (regressão coberta pela suíte R3/R4
   existente, 48/48 specs verdes).
2. Biblioteca de reuso (`ReuseLibraryDrawer.tsx`) — refatorado, mesmo
   comportamento de antes (regressão coberta pelo teste dedicado de
   acessibilidade já existente, `meal-plan-reuse-r4-library.spec.ts`).
3. **Assistente de IA (`AiMealPlanWizard.tsx`) — NOVO comportamento**:
   antes desta fase não tinha nenhum tratamento de teclado; agora
   Escape fecha o wizard e Tab não escapa do diálogo.
4. **Modal "Inserir receita" (`MealItemsEditor.tsx`) — NOVO
   comportamento**: mesma adição.

## Explicitamente NÃO extraído (seção 68 do pedido: "não criar uma
abstração gigante com 30 props")

Não foi criado um componente `DrawerShell`/`Drawer` genérico. Cada
drawer/modal continua com seu próprio markup de header/backdrop/
painel — só a lógica de TECLADO (que era pura duplicação sem
variação real entre os 2 casos existentes) foi extraída. O pedido
avisa explicitamente contra abstrações prematuras; um `DrawerShell`
unificando header/backdrop/largura entre painel lateral (drawer de
trocas), modal centralizado (reuso/receitas) e modal de wizard
(Copilot) exigiria generalizar 3 layouts genuinamente diferentes —
risco real sem um terceiro caso de uso concreto que force o desenho
certo da abstração.

## Correções pontuais

1. **Bug real corrigido**: botão de fechar do modal "Inserir receita"
   renderizava o texto literal `"x"` em vez de um ícone — agora usa
   `<X className="h-4 w-4" />`, igual a todo o resto do app.
2. **Opacidade de backdrop normalizada**: drawer de trocas (`/25`) e
   Assistente de IA (`/35`) alinhados ao valor já majoritário (`/30`)
   usado pelos outros ~8 diálogos do app.

## Prova (E2E dedicado)

`e2e/meal-plan-ui-r6-5-3-dialogs.spec.ts` (4/4 PASS):
1. Escape fecha o Assistente de IA (comportamento novo).
2. Tab não escapa do Assistente de IA (focus trap novo).
3. "Inserir receita" fecha com ícone real, Escape fecha.
4. Drawer de trocas + biblioteca de reuso continuam funcionando após
   a refatoração pro hook compartilhado (sem regressão).

Reexecutados sem regressão: 48 specs de R2/R3/R4/R5/R6 que tocam
essas superfícies (`meal-plan-r4-exchange-ux-quality`,
`meal-plan-composer-r2-2-alternatives-drawer`,
`meal-plan-substitution-r3-equivalent-quantity`,
`meal-plan-substitutions`, `meal-plan-reuse-r4-library`,
`meal-plan-ai-wizard`(-complete), `clinical-copilot-r5-1`(-readiness-changeset),
`meal-plan-recipes-r6`).
