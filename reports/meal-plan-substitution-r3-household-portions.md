# Meal Plan Substitution Engine R3 — Medidas Caseiras

## Auditoria da fonte real de porções (antes de implementar)

`lib/nutrition/food-catalog.ts#getFoodPortions(ref)` já é o ÚNICO ponto de
unificação de medidas caseiras no projeto, usado hoje por
`/api/admin/foods/detail` e pelo editor de medidas:

- TACO/CUSTOM/MANUFACTURER → `listFoodPortions` (`lib/repositories/food-portions.ts`),
  medidas cadastradas manualmente pela nutricionista (`gram_equivalent`,
  `confidence: high|medium|low`).
- TBCA/IBGE_POF → um caminho SEPARADO (`getPortionsBySourceIdentity`, usado só
  na rota `/api/admin/foods/portions` diretamente) que `getFoodPortions` do
  `food-catalog.ts` **não** cobre.

A R3 reaproveita `getFoodPortions` (o caminho já usado por TACO/CUSTOM/
MANUFACTURER/USDA) no endpoint de lote. Não foi criada nenhuma segunda fonte
de porções. Consequência honesta: candidatos TBCA/IBGE_POF nunca recebem
medida caseira aproximada pela R3 (ficam sempre `householdPortion: null`) —
consistente com a mesma limitação que `resolveItemReference` já impõe pra
essas fontes na Nutrition Engine (nunca consumidas hoje, ver
`lib/nutrition/nutrients.ts`).

## Algoritmo (`matchHouseholdPortion`)

Dada a quantidade PRÁTICA já calculada e a lista de porções reais do
candidato:

1. Pra cada porção, calcula quantas unidades inteiras dela aproximam a
   quantidade (`Math.round(quantidade / gramWeight)`).
2. Reconstrói a quantidade aproximada (`count * gramWeight`) e mede a
   distância relativa até a quantidade prática real.
3. Só aceita a porção se essa distância for **≤ 15%** — tolerância
   documentada e testada (`HOUSEHOLD_PORTION_TOLERANCE_RATIO`). Fora disso, a
   função retorna `null` — a UI nunca mostra "≈ N unidade" nesse caso.
4. Entre porções que passam na tolerância, vence a de menor distância;
   empate exato é resolvido pela ordem de entrada (primeira da lista).

## Nunca inventa

- Sem nenhuma porção cadastrada pro candidato → `null`, sem exceção.
- O `label` exibido é sempre o `description`/`label` já cadastrado no
  dataset real (`portion.label`) — nunca uma nomenclatura nova ("colher",
  "xícara", "unidade") inventada pela UI.
- O cálculo roda no SERVIDOR (dentro do endpoint de lote), reaproveitando
  `getFoodPortions` uma vez por candidato dentro do mesmo `Promise.all` já
  usado pra resolver o alimento — nenhuma chamada extra do cliente por
  candidato (ver relatório de performance/N+1).

## Cobertura de testes

- `tests/equivalent-quantity.test.ts` (`matchHouseholdPortion`): match exato,
  match próximo dentro da tolerância, sem porção compatível, sem porção
  cadastrada, múltiplas porções (escolhe a mais próxima), porção com peso
  inválido (ignorada sem quebrar), quantidade prática não positiva.
- `tests/equivalent-quantity-route.test.ts`: porção real aparece na resposta
  quando cadastrada e compatível; `null` quando não há porção cadastrada.
- E2E (`e2e/meal-plan-substitution-r3-equivalent-quantity.spec.ts`): duas
  provas ponta-a-ponta — uma cadastrando uma porção real via API e
  verificando "≈ 1 porção padrão" no drawer, outra confirmando que, sem
  porção cadastrada, o "≈" nunca aparece.
