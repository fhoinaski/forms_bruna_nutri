# Meal Plan Composer UX/UI R6.5.2C — Performance

## N+1 (seção 61)

Confirmado por leitura de código: nenhuma chamada de rede nova foi
introduzida. O menu de refeição consolida botões JÁ existentes
(mesmos handlers síncronos sobre estado local — `onChange`/
`reorderArray`/`duplicateMealAt`); o hover-reveal do food row é CSS
puro. `MEAL_PLAN_UI_R6_5_2C_N_PLUS_ONE: PASS`.

Prova indireta: `meal-plan-composer-r2-final-large-plan.spec.ts`
(que conta `resolveRequests`/`searchRequests`) continua passando sem
alteração de contagem após esta fase.

## Medição formal (seção 60)

Não capturados números reais de p50/p95 pra "abrir menu da refeição"/
"editar food row"/"atualizar quantidade" nesta fase — o tempo
disponível priorizou a implementação segura + regressão ampla. A
mudança em si (CSS de opacidade + reorganização de botões já
existentes) não introduz nenhum custo computacional novo (nenhum
novo `useEffect` de alto custo — o único `useEffect` novo,
`Escape`-close do menu de refeição, só é registrado quando
`openMealMenu !== null`, isto é, só enquanto o menu está de fato
aberto). Registrado como lacuna de medição, não de comportamento.

## Sem re-render global desnecessário

`mealMenuTriggerRefs` é um `useRef` (não causa re-render); o `useEffect`
de Escape depende só de `[openMealMenu]`. Nenhuma mudança no padrão
de render de `meal.items`/`meals` foi introduzida.
