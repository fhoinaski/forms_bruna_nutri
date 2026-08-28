# Meal Plan Composer UX/UI R6.5.2C — Acessibilidade

## Menu de ações da refeição (mudança real desta fase)

1. **`aria-label="Ações da refeição {nome}"`** no gatilho — nome real
   da refeição incluído, não um rótulo genérico.
2. **`aria-haspopup="menu"`** + **`aria-expanded`** (`true`/`false`,
   sincronizado com o estado real do menu).
3. **`role="menu"`** no painel + mesmo `aria-label`.
4. **Teclado**: `Escape` fecha o menu e devolve o foco ao gatilho
   (`mealMenuTriggerRefs.current[index].focus()`) — testado
   explicitamente (`toBeFocused()` após `Escape`).
5. **Ação destrutiva separada**: "Excluir refeição" fica após um
   divisor visual (`<div role="separator"... aria-hidden>`), com cor
   vermelha distinta — não confundível com as demais ações.

## Food row (mudança real desta fase)

Nenhum atributo de acessibilidade novo foi necessário — a mudança é
puramente visual (opacidade condicional num botão já existente com
`aria-label` inalterado). Confirmado que o botão continua
alcançável por foco de teclado mesmo com `opacity-0` em desktop
(CSS `opacity` não remove o elemento da árvore de acessibilidade nem
da ordem de tabulação — só o torna visualmente transparente até
receber foco, quando a regra `md:focus-visible:opacity-100` o revela).

## Não auditado nesta fase

Nenhuma auditoria formal de contraste ou navegação completa por
teclado do Composer inteiro — escopo continua restrito às 2 mudanças
reais desta fase (menu de refeição + hover-reveal do food row).

## Gate

`MEAL_PLAN_UI_R6_5_2C_ACCESSIBILITY`: PASS — confirmado por teste E2E
dedicado cobrindo aria-haspopup/aria-expanded/role=menu/Escape/
retorno de foco.
