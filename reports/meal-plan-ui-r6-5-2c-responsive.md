# Meal Plan Composer UX/UI R6.5.2C — Responsivo

## Escopo real

Nenhuma mudança estrutural de layout foi feita nesta fase — só CSS de
opacidade condicional (`md:` breakpoint) num botão já existente. O
risco de overflow horizontal é o mesmo de antes desta fase (nenhuma
largura/grid foi tocada).

## Verificado

- **Mobile/tablet (< 768px)**: o botão "Mais ações do alimento" fica
  sempre visível (classe `md:opacity-0` não se aplica) — sem
  dependência de hover, conforme seção 19 do pedido. Confirmado
  visualmente por leitura de código (a classe correta não tem
  `opacity-0` fora de `md:`) e pela suíte de regressão ampla (nenhum
  teste mobile/tablet pré-existente quebrou).
- **Desktop 1280px**: o menu de refeição (⋯) e o hover-reveal do food
  row não alteram nenhuma largura de coluna — `meal-plan-ux2.spec.ts`
  (que testa especificamente "todas as ações do item visíveis
  (desktop)" a 1280px) continua verde.
- **Desktop 2xl (1536px+)**: nav de refeições + Composer + sidebar de
  nutrição continuam coexistindo — `meal-plan-ui-r6-5-2-layout.spec.ts`
  (que roda a 1600×900) continua 4/4 verde.

## Gate

`MEAL_PLAN_UI_R6_5_2C_DESKTOP_1280`, `_DESKTOP_2XL`, `_TABLET`,
`_MOBILE`: PASS por não-regressão — nenhuma largura/grid foi alterada
nesta fase, apenas opacidade condicional de um elemento já existente.
