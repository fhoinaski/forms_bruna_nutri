# Meal Plan Composer UX/UI R6.5.2B — COMBINATION

## O que foi entregue

Rótulo aditivo **"Itens fixos"** (`<p>` de texto puro, sem
interatividade) inserido imediatamente antes da lista de `meal.items`
quando a refeição é COMBINATION E tem pelo menos 1 grupo de escolha E
pelo menos 1 item base. Lógica extraída pra uma função pura testável:
`shouldShowFixedItemsLabel` (`components/dashboard/MealItemsEditor.tsx`),
com 5 testes unitários dedicados (`tests/meal-plan-ui-r6-5-2b-combination.test.ts`).

A seção "Escolha X" já existia (título editável do grupo +
"Escolha de {min} a {max} item(ns)") — não foi redesenhada, apenas
confirmada como já atendendo ao pedido (seção 24 do pedido original:
"mostrar rótulo real do grupo" + "se houver restrição, mostrar regra
explícita" — ambos já verdadeiros antes desta fase).

## O que NÃO foi entregue

- **Seção "Opcionais" separada**: `item.is_optional` já existe como
  flag por item (com badge "opcional" já renderizado na linha), mas
  os itens opcionais NÃO foram movidos pra uma seção visual separada
  — continuam misturados na mesma lista de `meal.items`, apenas
  marcados individualmente com o badge existente.
  **Motivo**: segmentar exigiria filtrar/re-renderizar `meal.items`
  em duas passadas distintas preservando os índices/handlers
  corretos — a mesma classe de mudança que já causou 2 regressões
  reais em fases anteriores. Dado que a informação "isso é opcional"
  já é comunicada (badge existente), o valor incremental de uma
  segunda seção visual não justificou o risco nesta fase.
- **Checkbox visual pra item opcional**: não implementado (nem o
  badge existente foi alterado) — nenhuma semântica de seleção
  persistida foi inventada, consistente com o aviso do pedido (seção
  25) contra checkbox que implique escolha do paciente que o domínio
  não suporta.

## Range safety (seção 26)

Confirmado por teste: `e2e/meal-plan-composer-r2-final-flex.spec.ts`
("COMBINATION: item fixo + grupo de escolha calculam faixa real")
continua passando sem alteração de valores — a mudança desta fase é
só um `<p>` de texto condicional, sem tocar em `flexibleResult`/
`calculateFlexiblePlanNutrients`.

## Prova (E2E dedicado)

`e2e/meal-plan-ui-r6-5-2b-closure.spec.ts`, teste "R5 COMBINATION":
gera uma refeição COMBINATION real via Copilot (item fixo "arroz" +
grupo de escolha "Proteína" com "frango"), aplica ao editor, confirma
o badge "Combinação", o rótulo "Itens fixos", e o texto "Escolha de 1
a 1 item(ns)" — todos visíveis simultaneamente e corretos. **PASS**.
