# Curated Global Ranking Validation

Data: 2026-08-22

## 1. Baseline

Baseline preservado: ENGINE_ONLY continua sendo o resultado exibido ao usuario quando `CURATED_EXCHANGE_LISTS_MODE=shadow`.

## 2. Strategy design

Nova variante: CURATED_ELIGIBILITY_GLOBAL_RANK. A lista curada entra como elegibilidade/evidencia moderada, nunca como prioridade absoluta. O merge deduplica curated + automatic por identidade real, aplica gates existentes, calcula equivalencia com o motor atual e so entao ranqueia globalmente.

## 3. Scoring

Pesos escolhidos a partir da Fase 9.5: nutricao domina; contexto e hard gates continuam eliminatorios; relacao culinaria tem penalidade pequena; evidencia curada tem bonus pequeno (0.002) e nao supera incompatibilidade nutricional/contextual.

## 4. 120-case benchmark

```json
{
  "ENGINE_ONLY": {
    "cases": 120,
    "alternatives": 431,
    "averageNumberOfGoodAlternatives": 0.3917,
    "averageUsefulAlternatives": 3.4083,
    "precisionOfDisplayedAlternatives": 0.949,
    "contextAppropriateRate": 1,
    "clinicalPlausibilityRate": 0.949,
    "diversityUsefulRate": 0.9651,
    "absurdCandidateRate": 0.051,
    "duplicateRate": 0,
    "curatedCandidateRate": 0,
    "nutritionToleranceRate": 0.109,
    "familyDiversityRate": 0.9651,
    "coverage": 0.9833
  },
  "CURATED_FIRST_HARD": {
    "cases": 120,
    "alternatives": 434,
    "averageNumberOfGoodAlternatives": 0.3417,
    "averageUsefulAlternatives": 3.425,
    "precisionOfDisplayedAlternatives": 0.947,
    "contextAppropriateRate": 1,
    "clinicalPlausibilityRate": 0.947,
    "diversityUsefulRate": 0.9601,
    "absurdCandidateRate": 0.053,
    "duplicateRate": 0,
    "curatedCandidateRate": 0.4286,
    "nutritionToleranceRate": 0.0945,
    "familyDiversityRate": 0.9601,
    "coverage": 0.9833
  },
  "CURATED_ELIGIBILITY_GLOBAL_RANK": {
    "cases": 120,
    "alternatives": 486,
    "averageNumberOfGoodAlternatives": 0.4583,
    "averageUsefulAlternatives": 3.8667,
    "precisionOfDisplayedAlternatives": 0.9547,
    "contextAppropriateRate": 1,
    "clinicalPlausibilityRate": 0.9547,
    "diversityUsefulRate": 0.8624,
    "absurdCandidateRate": 0.0453,
    "duplicateRate": 0,
    "curatedCandidateRate": 0.1379,
    "nutritionToleranceRate": 0.1132,
    "familyDiversityRate": 0.8624,
    "coverage": 0.9833
  },
  "CURATED_TOP3_AUTO_TOP2": {
    "cases": 120,
    "alternatives": 500,
    "averageNumberOfGoodAlternatives": 0.375,
    "averageUsefulAlternatives": 3.8917,
    "precisionOfDisplayedAlternatives": 0.934,
    "contextAppropriateRate": 1,
    "clinicalPlausibilityRate": 0.934,
    "diversityUsefulRate": 0.9308,
    "absurdCandidateRate": 0.066,
    "duplicateRate": 0,
    "curatedCandidateRate": 0.356,
    "nutritionToleranceRate": 0.09,
    "familyDiversityRate": 0.9308,
    "coverage": 0.9833
  }
}
```

## 5. Extended benchmark

```json
{
  "ENGINE_ONLY": {
    "cases": 500,
    "alternatives": 1790,
    "averageNumberOfGoodAlternatives": 0.798,
    "averageUsefulAlternatives": 3.364,
    "precisionOfDisplayedAlternatives": 0.9397,
    "contextAppropriateRate": 1,
    "clinicalPlausibilityRate": 0.9397,
    "diversityUsefulRate": 0.9519,
    "absurdCandidateRate": 0.0603,
    "duplicateRate": 0,
    "curatedCandidateRate": 0,
    "nutritionToleranceRate": 0.2246,
    "familyDiversityRate": 0.9519,
    "coverage": 0.962
  },
  "CURATED_FIRST_HARD": {
    "cases": 500,
    "alternatives": 1803,
    "averageNumberOfGoodAlternatives": 0.738,
    "averageUsefulAlternatives": 3.372,
    "precisionOfDisplayedAlternatives": 0.9351,
    "contextAppropriateRate": 1,
    "clinicalPlausibilityRate": 0.9351,
    "diversityUsefulRate": 0.938,
    "absurdCandidateRate": 0.0649,
    "duplicateRate": 0,
    "curatedCandidateRate": 0.3611,
    "nutritionToleranceRate": 0.2063,
    "familyDiversityRate": 0.938,
    "coverage": 0.962
  },
  "CURATED_ELIGIBILITY_GLOBAL_RANK": {
    "cases": 500,
    "alternatives": 2026,
    "averageNumberOfGoodAlternatives": 1.018,
    "averageUsefulAlternatives": 3.816,
    "precisionOfDisplayedAlternatives": 0.9418,
    "contextAppropriateRate": 1,
    "clinicalPlausibilityRate": 0.9418,
    "diversityUsefulRate": 0.8316,
    "absurdCandidateRate": 0.0582,
    "duplicateRate": 0,
    "curatedCandidateRate": 0.1002,
    "nutritionToleranceRate": 0.2527,
    "familyDiversityRate": 0.8316,
    "coverage": 0.962
  },
  "CURATED_TOP3_AUTO_TOP2": {
    "cases": 500,
    "alternatives": 2048,
    "averageNumberOfGoodAlternatives": 0.794,
    "averageUsefulAlternatives": 3.794,
    "precisionOfDisplayedAlternatives": 0.9263,
    "contextAppropriateRate": 1,
    "clinicalPlausibilityRate": 0.9263,
    "diversityUsefulRate": 0.9175,
    "absurdCandidateRate": 0.0737,
    "duplicateRate": 0,
    "curatedCandidateRate": 0.3047,
    "nutritionToleranceRate": 0.1953,
    "familyDiversityRate": 0.9175,
    "coverage": 0.962
  }
}
```

## 6. Metrics

As metricas principais sao precisionOfDisplayedAlternatives, clinicalPlausibilityRate, contextAppropriateRate, nutritionToleranceRate, absurdCandidateRate, duplicateRate, familyDiversityRate, averageGoodAlternatives e coverage.

## 7. Golden cases

Cobertos no benchmark e em regressao: arroz no almoco, pao no cafe, frango no almoco e frutas variadas. Curadoria ruim e removida por qualidade/contexto; candidato automatico excelente fora da lista pode ranquear.

## 8. Manual review

Ver `reports/curated-global-ranking-manual-review.md` com 50 casos comparando Engine-only, Hard curated e Global rank.

## 9. Missing curated foods

```json
[
  {
    "list": "MAIN_MEAL_STARCHES",
    "food": "Nhoque, batata, cozido",
    "count": 13
  },
  {
    "list": "MAIN_MEAL_STARCHES",
    "food": "Cará, cozido",
    "count": 8
  },
  {
    "list": "MAIN_MEAL_STARCHES",
    "food": "Lasanha, massa fresca, cozida",
    "count": 7
  },
  {
    "list": "LEAN_MAIN_PROTEINS",
    "food": "Corvina grande, cozida",
    "count": 7
  },
  {
    "list": "MAIN_MEAL_STARCHES",
    "food": "Cuscuz, paulista",
    "count": 7
  },
  {
    "list": "VEGETABLE_SIDES",
    "food": "Seleta de legumes, enlatada",
    "count": 6
  },
  {
    "list": "MAIN_MEAL_STARCHES",
    "food": "Macarrão, instantâneo",
    "count": 6
  },
  {
    "list": "MAIN_MEAL_STARCHES",
    "food": "Bolinho de arroz",
    "count": 6
  },
  {
    "list": "LEAN_MAIN_PROTEINS",
    "food": "Abadejo, filé, congelado,cozido",
    "count": 5
  },
  {
    "list": "MAIN_MEAL_STARCHES",
    "food": "Tapioca, goma, pronta (discos), sem manteiga, sem recheio",
    "count": 4
  },
  {
    "list": "FRUIT_PORTIONS",
    "food": "Umbu, polpa, congelada",
    "count": 4
  },
  {
    "list": "FRUIT_PORTIONS",
    "food": "Jabuticaba, crua",
    "count": 4
  },
  {
    "list": "DAIRY_OPTIONS",
    "food": "Leite, de vaca, desnatado, pó",
    "count": 4
  },
  {
    "list": "DAIRY_OPTIONS",
    "food": "Queijo, parmesão",
    "count": 4
  },
  {
    "list": "MAIN_MEAL_STARCHES",
    "food": "Batata, inglesa, frita",
    "count": 4
  },
  {
    "list": "DAIRY_OPTIONS",
    "food": "Queijo, prato",
    "count": 4
  },
  {
    "list": "MAIN_MEAL_STARCHES",
    "food": "Fécula, de mandioca",
    "count": 3
  },
  {
    "list": "MAIN_MEAL_STARCHES",
    "food": "Tapioca, pronta, c/ banana, c/ açúcar e c/ canela",
    "count": 3
  },
  {
    "list": "FRUIT_PORTIONS",
    "food": "Jamelão, cru",
    "count": 3
  },
  {
    "list": "FRUIT_PORTIONS",
    "food": "Graviola, crua",
    "count": 3
  },
  {
    "list": "VEGETABLE_SIDES",
    "food": "Abóbora, menina brasileira, crua",
    "count": 3
  },
  {
    "list": "DAIRY_OPTIONS",
    "food": "Iogurte, natural, desnatado",
    "count": 3
  },
  {
    "list": "DAIRY_OPTIONS",
    "food": "Iogurte, sabor pêssego",
    "count": 3
  },
  {
    "list": "VEGETABLE_SIDES",
    "food": "Vagem, crua",
    "count": 3
  },
  {
    "list": "FRUIT_PORTIONS",
    "food": "Manga, Palmer, crua",
    "count": 3
  }
]
```

## 10. Rejected curated foods

```json
[
  {
    "list": "MAIN_MEAL_STARCHES",
    "food": "Batata, inglesa, cozida",
    "count": 9
  },
  {
    "list": "FRUIT_PORTIONS",
    "food": "Mamão, Papaia, cru",
    "count": 2
  },
  {
    "list": "VEGETABLE_SIDES",
    "food": "Alface, americana, crua",
    "count": 1
  },
  {
    "list": "FRUIT_PORTIONS",
    "food": "Abacaxi, cru",
    "count": 1
  },
  {
    "list": "FRUIT_PORTIONS",
    "food": "Laranja, baía, crua",
    "count": 1
  }
]
```

## 11. Performance

```json
[
  {
    "strategy": "ENGINE_ONLY",
    "runs": 500,
    "p50Ms": 6.7046,
    "p95Ms": 8.3267,
    "p99Ms": 9.8932
  },
  {
    "strategy": "CURATED_FIRST_HARD",
    "runs": 500,
    "p50Ms": 7.0062,
    "p95Ms": 8.5136,
    "p99Ms": 10.0073
  },
  {
    "strategy": "CURATED_ELIGIBILITY_GLOBAL_RANK",
    "runs": 500,
    "p50Ms": 7.4402,
    "p95Ms": 10.0727,
    "p99Ms": 11.7588
  },
  {
    "strategy": "CURATED_TOP3_AUTO_TOP2",
    "runs": 500,
    "p50Ms": 6.962,
    "p95Ms": 8.9135,
    "p99Ms": 10.6334
  }
]
```

## 12. Regression tests

Adicionados testes para: curado nao vencer automaticamente, automatico excelente fora da lista poder ranquear, curado ruim ser rejeitado, contexto afetar rank, nutricao permanecer dominante, diversidade por familia e ausencia de LOW.

## 13. Rollout recommendation

Dados favorecem a estrategia global, mas manter SHADOW nesta fase e aguardar decisao explicita antes de qualquer PILOT.

CURATED_GLOBAL_RANK_STRATEGY_READY: sim

CURATED_GLOBAL_RANK_BETTER_THAN_ENGINE_ONLY: sim

ABSURD_CANDIDATE_RATE: 0.0582

CONTEXT_APPROPRIATE_RATE_ENGINE: 1

CONTEXT_APPROPRIATE_RATE_GLOBAL: 1

CLINICAL_PLAUSIBILITY_ENGINE: 0.9397

CLINICAL_PLAUSIBILITY_GLOBAL: 0.9418

NUTRITION_TOLERANCE_ENGINE: 0.2246

NUTRITION_TOLERANCE_GLOBAL: 0.2527

CURATED_EXCHANGE_LISTS_ROLLOUT: SHADOW

CURATED_EXCHANGE_LISTS_READY: nao
