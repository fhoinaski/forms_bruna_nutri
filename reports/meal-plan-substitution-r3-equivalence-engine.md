# Meal Plan Substitution Engine R3 — Motor de Equivalência

## Contrato implementado

`lib/nutrition/equivalent-quantity.ts`:

```ts
type EquivalentQuantityCriterion = "ENERGY" | "PROTEIN" | "CARBOHYDRATE" | "FAT";
type EquivalentQuantityStatus =
  | "CALCULATED" | "NOT_CALCULABLE" | "MISSING_TARGET_NUTRIENT"
  | "ZERO_TARGET_NUTRIENT" | "INVALID_QUANTITY";

interface EquivalentQuantityRequest {
  referenceFood: MacroReferenceFood;
  referenceGrams: number;
  candidateFood: MacroReferenceFood;
  criterion: EquivalentQuantityCriterion;
}

interface EquivalentQuantityResult {
  criterion; status;
  referenceQuantityGrams: number;
  referenceNutrition: NutrientValues | null;
  rawCandidateQuantityGrams: number | null;
  practicalCandidateQuantityGrams: number | null;
  candidateNutrition: NutrientValues | null;
  nutritionDelta: Partial<Record<keyof NutrientValues, number | null>> | null;
  targetDelta: number | null;
  percentDifference: number | null;
}
```

Os nomes de campo foram adaptados aos tipos reais do projeto
(`MacroReferenceFood`, `NutrientValues` de `lib/nutrition/nutrients.ts`) em vez
de inventar um vocabulário paralelo.

## Algoritmo (`computeEquivalentQuantity`)

1. Valida `referenceGrams > 0` — senão `INVALID_QUANTITY`, sem dividir por nada.
2. Calcula a nutrição da referência na quantidade atual via
   `calculateItemNutrients` (Nutrition Engine real, nunca uma fórmula própria).
3. Extrai o valor do nutriente-critério na referência:
   - ausente (`null`/`undefined`) → `MISSING_TARGET_NUTRIENT`;
   - `0` → `ZERO_TARGET_NUTRIENT` (não há alvo real pra preservar);
   - do contrário, segue.
4. Lê o valor do critério no candidato, por 100g, do catálogo
   (`MacroReferenceFood`): mesmas três saídas possíveis (ausente/zero/negativo
   → `NOT_CALCULABLE`).
5. Resolve a incógnita algebricamente: `rawGrams = (alvoReferência / valorCandidato100g) * 100`.
6. Arredonda pra quantidade PRÁTICA (`roundToPracticalQuantity`, ver abaixo).
7. **Nunca confia no valor algébrico pós-arredondamento** — recalcula a
   nutrição do candidato NA QUANTIDADE PRÁTICA via `calculateItemNutrients`
   de novo. `targetDelta`/`percentDifference`/`nutritionDelta` vêm todos desse
   recálculo, não da álgebra do passo 5.

## Missing ≠ zero, nunca dividir por zero

- `referenceTargetAmount === 0` → `ZERO_TARGET_NUTRIENT` (nunca tenta dividir
  por um valor de referência zero).
- `candidatePer100 === 0` → `ZERO_TARGET_NUTRIENT` (nunca divide POR zero).
- Qualquer lado `null/undefined/NaN` → `MISSING_TARGET_NUTRIENT`, uma
  classificação distinta de zero real.
- Nota de honestidade sobre o modelo de dados: os 4 macros clássicos
  (`energia_kcal/proteina_g/carboidrato_g/lipidios_g`) são campos
  **obrigatórios** (`number`, não `number | null`) em `MacroReferenceFood` —
  o catálogo real (TACO/custom/manufacturer/USDA) não carrega um sinal
  separado de "não informado" pra esses 4 campos hoje. "Missing" de verdade
  pra esses 4 macros só acontece se o objeto vier malformado (ex.: candidato
  que falhou ao resolver no catálogo, tratado à parte na API como
  `result: null`, nunca fabricando um `MacroReferenceFood` fictício). Isso é
  documentado aqui em vez de fingir uma distinção que os dados não carregam.

## Cobertura de testes unitários (`tests/equivalent-quantity.test.ts`)

- Os 4 critérios calculando corretamente e revalidando pela engine real.
- `ZERO_TARGET_NUTRIENT` tanto pelo lado da referência quanto do candidato.
- `MISSING_TARGET_NUTRIENT` com um campo malformado.
- `INVALID_QUANTITY` para quantidade não positiva.
- `nutritionDelta` refletindo a quantidade PRÁTICA, não a bruta.
- 22 testes, 100% PASS.

## Reuso confirmado, nunca duplicado

`equivalence.ts#findEquivalentFoods` e `substitution-engine.ts#findFoodSubstitutes`
continuam existindo e em uso (o segundo é chamado pela rota de `add_manual`
das exchange groups) — ambos agora importam `roundToPracticalQuantity` daqui
em vez de manter cópias privadas da mesma fórmula. Nenhuma lógica de cálculo
nutricional foi reimplementada nesta fase; tudo passa por
`lib/nutrition/nutrients.ts#calculateItemNutrients`.
