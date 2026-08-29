# Meal Plan Composer UX/UI R6.5.2B — Acessibilidade

## Escopo desta fase

Nenhum elemento interativo novo foi criado nesta fase (o único DOM
novo é um `<p>` de texto puro, "Itens fixos", sem interatividade —
não precisa de aria/foco/teclado). Por isso, a acessibilidade
verificada aqui é de CONFIRMAÇÃO de que os elementos existentes
(inline quantity/unit, toolbar, R3/R5/R6 compatibility) continuam
acessíveis como antes, não uma auditoria de área nova.

## Verificado

1. **Inline quantity**: `input[aria-label="Quantidade"]` continua com
   label acessível real; a troca colapsado↔edição continua via
   `<button>` reais ("Mais ações do alimento", "Editar") — nenhuma
   mudança.
2. **Toolbar**: todos os botões continuam com texto visível (não
   apenas ícone) — "Salvar", "Revisar", "Usar modelo", "Criar com IA".
3. **Rótulo "Itens fixos"**: `<p>` estático, não interativo, não
   precisa de `aria-*` — não interfere na ordem de tabulação (não é
   focável) nem duplica informação já anunciada por leitor de tela
   (o `choice_groups`/`meal.items` continuam com seus próprios
   aria-labels indexados, inalterados).
4. **Navegação de refeições (R6.5.2)**: reconfirmada intacta pela
   suíte de regressão — `aria-current`, foco por teclado, Enter pra
   ativar, tudo continua passando (`meal-plan-ui-r6-5-2-layout.spec.ts`).

## Não auditado nesta fase

Nenhuma auditoria NOVA de acessibilidade foi necessária — nada de
interativo foi adicionado. A auditoria dedicada da R6.5.2 (nav de
refeições) permanece válida e não foi refeita aqui.

## Gate

`MEAL_PLAN_UI_R6_5_2B_ACCESSIBILITY`: PASS por não regressão — os
elementos interativos verificados nesta fase continuam com a mesma
marcação de acessibilidade que já tinham (e que já era adequada).
