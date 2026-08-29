# Meal Plan Composer UX/UI R6.5.5 — Recentes/Favoritos

## Não implementado nesta fase

A auditoria confirmou que recentes/favoritos NÃO são surfaced dentro
do combobox de busca-enquanto-digita hoje — eles existem só na
`ReuseLibraryDrawer` (R4), um componente estruturalmente separado com
suas próprias tabs/estado/fetches (`/api/admin/foods/recent`,
`/api/admin/foods/favorites`). O combobox de busca só REGISTRA uso
recente após uma seleção (`recordFoodUsageForReuse`, fire-and-forget),
mas nunca EXIBE uma lista de recentes/favoritos antes de o usuário
digitar.

## Por que

Integrar recentes/favoritos DENTRO do combobox de busca (mostrando
esses itens antes de qualquer digitação, seção 16-20 do pedido)
exigiria: (a) uma nova chamada de dados nesse componente (reaproveitar
os endpoints já existentes da R4, o que é seguro), MAS (b) uma
mudança real de comportamento — o combobox passaria a mostrar
conteúdo mesmo sem query, um estado que não existe hoje
(`dropdownOpen`/`showEmptyState` são condicionados a
`item.food.trim().length >= 2`). Isso é uma feature nova, não um
redesign visual do que já existe, e o pedido desta fase é
explicitamente restrito a UI/visual sem mudar o comportamento de
busca.

## Gate

`MEAL_PLAN_UI_R6_5_5_RECENTS: FAIL` (não implementado — feature nova,
fora do escopo desta fase).
`MEAL_PLAN_UI_R6_5_5_FAVORITES: FAIL` (mesma razão).
