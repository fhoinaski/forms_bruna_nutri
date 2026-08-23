# Curated Exchange List Change Proposals

Data: 2026-08-22

Nenhuma proposta abaixo foi aplicada automaticamente.

## MAIN_MEAL_STARCHES

Evidencia: numberOfFoods=6; calculableFoods=6; timesSelected=27; averageUsefulCandidates=1.7778; fallbackRate=1; contextMismatchRate=0.

- ADD: fallback alto indica que a lista nao cobre candidatos bons o suficiente.
- ADD: Nhoque, batata, cozido apareceu como util fora da lista 13 vez(es).
- ADD: Cará, cozido apareceu como util fora da lista 8 vez(es).
- ADD: Lasanha, massa fresca, cozida apareceu como util fora da lista 7 vez(es).
- ADD: Cuscuz, paulista apareceu como util fora da lista 7 vez(es).
- ADD: Macarrão, instantâneo apareceu como util fora da lista 6 vez(es).
- REMOVE: revisar Batata, inglesa, cozida; candidato curado rejeitado 9 vez(es) por qualidade/contexto.

## BREAKFAST_CARBS

Evidencia: numberOfFoods=6; calculableFoods=6; timesSelected=4; averageUsefulCandidates=1.5; fallbackRate=1; contextMismatchRate=0.

- ADD: fallback alto indica que a lista nao cobre candidatos bons o suficiente.

## LEAN_MAIN_PROTEINS

Evidencia: numberOfFoods=3; calculableFoods=3; timesSelected=20; averageUsefulCandidates=1.75; fallbackRate=1; contextMismatchRate=0.

- SPLIT: avaliar se a lista precisa ser separada por subtipo antes de expandir.
- ADD: lista subdimensionada; avaliar inclusao dos alimentos uteis mais frequentes abaixo.
- ADD: Corvina grande, cozida apareceu como util fora da lista 7 vez(es).
- ADD: Abadejo, filé, congelado,cozido apareceu como util fora da lista 5 vez(es).

## FRUIT_PORTIONS

Evidencia: numberOfFoods=4; calculableFoods=4; timesSelected=24; averageUsefulCandidates=2.4583; fallbackRate=0.125; contextMismatchRate=0.

- KEEP: lista aceitavel para shadow; revisar clinicamente antes de expandir.
- ADD: Umbu, polpa, congelada apareceu como util fora da lista 4 vez(es).
- ADD: Jabuticaba, crua apareceu como util fora da lista 4 vez(es).
- ADD: Jamelão, cru apareceu como util fora da lista 3 vez(es).
- ADD: Graviola, crua apareceu como util fora da lista 3 vez(es).
- ADD: Manga, Palmer, crua apareceu como util fora da lista 3 vez(es).
- REMOVE: revisar Mamão, Papaia, cru; candidato curado rejeitado 2 vez(es) por qualidade/contexto.
- REMOVE: revisar Abacaxi, cru; candidato curado rejeitado 1 vez(es) por qualidade/contexto.
- REMOVE: revisar Laranja, baía, crua; candidato curado rejeitado 1 vez(es) por qualidade/contexto.

## DAIRY_OPTIONS

Evidencia: numberOfFoods=3; calculableFoods=2; timesSelected=20; averageUsefulCandidates=0.25; fallbackRate=1; contextMismatchRate=0.

- SPLIT: avaliar se a lista precisa ser separada por subtipo antes de expandir.
- ADD: lista subdimensionada; avaliar inclusao dos alimentos uteis mais frequentes abaixo.
- SPLIT: evidencia qualitativa forte para separar bebidas lacteas, iogurtes e queijos.
- ADD: Leite, de vaca, desnatado, pó apareceu como util fora da lista 4 vez(es).
- ADD: Queijo, parmesão apareceu como util fora da lista 4 vez(es).
- ADD: Queijo, prato apareceu como util fora da lista 4 vez(es).
- ADD: Iogurte, natural, desnatado apareceu como util fora da lista 3 vez(es).
- ADD: Iogurte, sabor pêssego apareceu como util fora da lista 3 vez(es).
- REMOVE: revisar 458 Leite, de vaca, integral (SOURCE_NOT_CALCULABLE)

## LEGUME_OPTIONS

Evidencia: numberOfFoods=2; calculableFoods=2; timesSelected=3; averageUsefulCandidates=0.3333; fallbackRate=0.6667; contextMismatchRate=0.

- SPLIT: avaliar se a lista precisa ser separada por subtipo antes de expandir.
- ADD: lista subdimensionada; avaliar inclusao dos alimentos uteis mais frequentes abaixo.
- MERGE: nao recomendado agora; lista tem papel proprio de leguminosa e deve continuar separada de proteina animal.

## VEGETABLE_SIDES

Evidencia: numberOfFoods=3; calculableFoods=3; timesSelected=20; averageUsefulCandidates=0.9; fallbackRate=0.95; contextMismatchRate=0.

- SPLIT: avaliar se a lista precisa ser separada por subtipo antes de expandir.
- ADD: lista subdimensionada; avaliar inclusao dos alimentos uteis mais frequentes abaixo.
- ADD: Seleta de legumes, enlatada apareceu como util fora da lista 6 vez(es).
- ADD: Abóbora, menina brasileira, crua apareceu como util fora da lista 3 vez(es).
- ADD: Vagem, crua apareceu como util fora da lista 3 vez(es).
- REMOVE: revisar Alface, americana, crua; candidato curado rejeitado 1 vez(es) por qualidade/contexto.
