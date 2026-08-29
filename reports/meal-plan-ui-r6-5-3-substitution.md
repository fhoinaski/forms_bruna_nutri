# Meal Plan Composer UX/UI R6.5.3 — Substituição (R3)

## Entregue

- Backdrop normalizado (`/25` → `/30`, ver `-drawers.md`).
- Lógica de Escape/Tab-trap refatorada pro hook compartilhado
  `useDialogKeyboard` (comportamento preservado, não alterado).

## Não implementado nesta fase

Nenhum redesign do conteúdo do drawer: header com contexto
"Trocar alimento / Arroz branco / 120g", seletor de critério
redesenhado (já é um `role="group"` de botões `aria-pressed` com
estado explícito — já satisfaz boa parte do pedido, seção 24, sem
mudança), card de candidato compacto, comparação Atual→Novo visual,
seções colapsáveis de impacto por refeição/dia, ou o texto de
"Não foi possível calcular equivalência" (rótulos NOT_CALCULABLE já
existem em algum formato no motor, não auditados/alterados
visualmente nesta fase).

## Por que

A auditoria confirmou que o seletor de critério JÁ é um padrão
consistente (mesmo tratamento visual usado na biblioteca de reuso) e
JÁ é acessível por teclado com `aria-pressed` (confirmado pelo teste
existente `meal-plan-substitution-r3-equivalent-quantity.spec.ts:149`,
"acessibilidade: seletor de critério é navegável por teclado e tem
aria-pressed" — reexecutado, PASS, sem mudança). O ExchangeGroupPanel
é um componente grande e crítico (motor de equivalência real, sem
segundo calculador) — reescrever seu conteúdo visual carrega risco
desproporcional ao valor incremental frente ao que já funciona.

## Gate

`MEAL_PLAN_UI_R6_5_3_SUBSTITUTION: FAIL` para o redesign visual pedido
(não implementado); os itens de teclado/acessibilidade do CONTAINER
do drawer (não do conteúdo interno) fecham via `-drawers.md`.
