# Meal Plan Composer UX/UI R6.5.2C — Menu de ações da refeição

## Mudança entregue

`components/dashboard/MealItemsEditor.tsx`: o header de cada meal card
agora expõe apenas o badge de estrutura, o resumo de itens/kcal, e um
único botão "⋯" (`aria-label="Ações da refeição {nome}"`). Dentro do
menu (`role="menu"`, mesmo `aria-label`):

1. Mover para cima (mesmo handler `reorderArray(meals, mealIndex, -1)`)
2. Mover para baixo (mesmo handler, `+1`)
3. Duplicar (mesmo handler `duplicateMealAt`)
4. Sugerir com IA (inalterado)
5. Salvar como receita (inalterado)
6. Salvar como refeição favorita — R4, só com `clientId` (inalterado)
7. — divisor visual —
8. Excluir refeição (vermelho, separado visualmente — seção 6 do pedido)

Nenhuma lógica foi reescrita — cada item do menu chama exatamente a
mesma função que o botão standalone chamava antes.

## Acessibilidade (seção 7 do pedido)

- `aria-haspopup="menu"` e `aria-expanded` (true/false) no gatilho.
- `role="menu"` + `aria-label` no painel do menu.
- Teclado: `Escape` fecha o menu e devolve o foco ao gatilho
  (`mealMenuTriggerRefs`, um `useEffect` dedicado por índice de
  refeição).
- Confirmado por teste dedicado
  (`e2e/meal-plan-ui-r6-5-2c-closure.spec.ts`, "abrir o menu ⋯..."):
  `aria-expanded` alterna corretamente, Escape fecha e `toBeFocused()`
  confirma o retorno de foco ao botão.

## Compatibilidade preservada

- `meal-plan-ux2.spec.ts` (reordenar, duplicar) — atualizado pra abrir
  o menu primeiro (2 linhas), depois clicar no item — mesmo aria-label
  de conteúdo, só a localização mudou. **PASS**.
- `meal-plan-reuse-r4-library.spec.ts` (Salvar como refeição favorita,
  R4) — atualizado pra usar o novo aria-label do gatilho ("Ações da
  refeição" em vez de "Mais ações para") — 1 linha. **PASS**, e a
  suíte completa de R4 (8 testes) continua verde.
- Excluir refeição — testado com um cenário de 2 refeições, confirma
  que só a refeição-alvo é removida.

## Excluído deste escopo

Nenhuma nova ação foi inventada; a lista de itens do menu é
exatamente a mesma de antes, só reorganizada.
