# Meal Plan Food Resolution Debug

## 1. Causa raiz

O `MealPlanEditor` podia exibir nome e grupo visual do slot de template, mas alguns itens chegavam ao painel sem `food_source`/`food_ref_id`. O botão de alternativas dependia desses campos e, sem eles, o fluxo parava antes do `Food Exchange Engine`.

O caso crítico era o template `ADULTO_SAUDAVEL`:

- `Pao de forma integral` - 50 g
- `Ovo de galinha inteiro cozido` - 100 g
- `Banana prata` - 80 g

`Ovo` e `Banana` tinham match único no catálogo TACO. `Pao de forma integral` retornava dois candidatos rank 4 (`TACO` e `COMPLEMENTARY`) e o resolver marcava como ambíguo, apesar de o template querer a entrada genérica calculável `Pão, trigo, forma, integral`.

## 2. Ponto onde a identidade era perdida

O ponto de quebra era duplo:

- `createMealPlanFromTemplates()` resolvia identidade com `searchFoods()` direto, não com o `resolveFoodCandidate()` e sua política de confiança.
- `ExchangeGroupPanel` só chamava a API quando `food_source` e `food_ref_id` já existiam no item local. Itens legados ou importados sem vínculo ficavam presos na mensagem de vínculo.

## 3. Templates afetados

O template real afetado confirmado foi `ADULTO_SAUDAVEL`, café da manhã. Outros templates que usam nomes populares semelhantes se beneficiam do mesmo choke point de importação e do backfill no clique.

## 4. Itens resolvidos

Golden cases confirmados:

- `Pao de forma integral` -> `TACO:52`, `Pão, trigo, forma, integral`
- `Ovo de galinha inteiro cozido` -> `TACO:488`, `Ovo, de galinha, inteiro, cozido/10minutos`
- `Banana prata` -> `TACO:182`, `Banana, prata, crua`

## 5. Ambíguos

Itens que o `resolveFoodCandidate()` não aceitar como `RESOLVED` agora retornam `NEEDS_FOOD_CONFIRMATION` na API de geração por item, com candidatos estruturados. A API não escolhe arbitrariamente.

## 6. Sem match

Itens sem match continuam sem identidade e não são marcados como prontos para alternativas. A resposta preserva o status do resolver (`NOT_FOUND`, `PREPARATION_NEEDS_REVIEW`, etc.).

## 7. Golden cases

Nutrientes e classificação confirmados por teste:

- Pão integral: `CARBOHYDRATE / GRAIN / STARCH_SOURCE`
- Ovo cozido: `PROTEIN / EGG / LEAN_PROTEIN`
- Banana prata: `FRUIT / GENERIC_FRUIT / FRUIT_SOURCE`

Todos têm energia, proteína, carboidrato e gordura calculáveis via `getFoodByReference()`.

## 8. Exchange generation

O motor gerou alternativas reais:

- Pão integral: 5 alternativas
- Ovo cozido: 1 alternativa
- Banana prata: 5 alternativas

`generateAndSaveExchangeGroup()` agora não persiste grupo vazio. Quando não houver candidato elegível, lança `NoEligibleExchangeAlternativesError`; a rota responde `NO_ELIGIBLE_ALTERNATIVES` e a geração em lote pula o item.

## 9. Testes

Executados:

- `npx tsc --noEmit --incremental false`
- `npm test -- tests/food-resolver-v2.test.ts tests/food-exchange-groups.test.ts tests/meal-plan-go-live-p0.test.ts`
- `npm run lint`
- `npm run build`
- `npm run test:e2e -- e2e/meal-plan-substitutions.spec.ts --project=chromium-desktop`

## 10. E2E

Novo cenário:

`Adulto saudável -> Café da manhã -> pão integral, ovo cozido, banana prata -> abrir Alternativas -> gerar/visualizar lista -> salvar -> reload -> listas continuam presentes`.

Resultado: `6 passed`.
