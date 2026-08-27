# Clinical Copilot R5.1 — Performance / Batch Resolution

## Resolução em lote, mesmo com estrutura aninhada (seções 13, 48-49, 51)

`assembleDraft` continua fazendo UMA ÚNICA chamada a
`resolveFoodCandidatesWithCanonicalShadow` para TODO o draft — agora
também cobrindo `options[].items`, `choice_groups[].items` e o array
combinado `fixed_items + optional_items`, com chaves de rota
(`mealIndex:items:N`, `mealIndex:options:I:N`, `mealIndex:groups:I:N`)
que preservam o cache por query normalizada já existente
(`lib/nutrition/food-resolver.ts#resolveFoodCandidates`). Prova direta:
`tests/meal-plan-draft-flexible.test.ts` ("a mesma query repetida em
fixed_items/choice_groups/optional_items só busca no catálogo uma vez") —
`searchFoods` é chamado exatamente 1 vez mesmo com a mesma query aparecendo
em 3 posições estruturais diferentes.

## Draft grande / N+1 (seções 50-51)

O agente de geração mantém o mesmo limite estrutural documentado desde a
R5 (até 6 refeições no envelope do LLM, por orçamento real de tempo do
provedor observado em teste manual). Uma fixture determinística de 6
refeições (2 SIMPLE + 2 OPTIONS + 2 COMBINATION, 30-50 itens nested no
total) não foi montada como um teste E2E dedicado nesta fase — o caminho
crítico (resolução em lote sem N+1, mapeamento sem flattening, ausência de
duplicidade na fila de revisão) já está provado nos testes unitários
acima em granularidade mais controlada, e o volume de itens por refeição
gerados pela IA é limitado pelo próprio schema (6 por SIMPLE/COMBINATION-
fixed, 6 por opção/grupo) — um "draft grande" na prática vem de MUITAS
refeições, não de uma única refeição com dezenas de itens. Isso é uma
lacuna de cobertura reconhecida (fixture de volume real não construída),
não uma falha de comportamento observada.

## Round-trip real (herdado da R5, sem mudança)

A geração (LLM/fixture + resolução recursiva em lote + cálculo de
nutrição via `calculateFlexiblePlanNutrients`) continua em UM único
round-trip HTTP (`POST /draft`), como medido na R5
(`clinical-copilot-r5-performance.md`: P50 ~128ms/P95 ~172ms na amostra
local). A resolução recursiva não introduziu uma segunda chamada de rede;
o overhead adicional é somente no processamento em memória (percorrer
options/choice_groups em vez de só items), desprezível na escala testada.
