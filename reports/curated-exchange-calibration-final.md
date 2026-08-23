# Curated Exchange Calibration Final

Data: 2026-08-22

## 1. Analise dos 120 casos

A auditoria foi refeita caso a caso com primaryFood, contexto, classificacao, lista selecionada, top N do motor, top N hibrido, origem dos candidatos, utilidade e vencedor.

```json
{
  "HYBRID_BETTER": 6,
  "ENGINE_BETTER": 6,
  "TIE": 106,
  "INSUFFICIENT_DATA": 2
}
```

## 2. Resultados por grupo

```json
{
  "CARBOHYDRATE": {
    "HYBRID_BETTER": 1,
    "ENGINE_BETTER": 0,
    "TIE": 30,
    "INSUFFICIENT_DATA": 0
  },
  "PROTEIN": {
    "HYBRID_BETTER": 3,
    "ENGINE_BETTER": 1,
    "TIE": 19,
    "INSUFFICIENT_DATA": 1
  },
  "FRUIT": {
    "HYBRID_BETTER": 1,
    "ENGINE_BETTER": 3,
    "TIE": 20,
    "INSUFFICIENT_DATA": 0
  },
  "DAIRY": {
    "HYBRID_BETTER": 0,
    "ENGINE_BETTER": 0,
    "TIE": 20,
    "INSUFFICIENT_DATA": 0
  },
  "VEGETABLE": {
    "HYBRID_BETTER": 1,
    "ENGINE_BETTER": 2,
    "TIE": 16,
    "INSUFFICIENT_DATA": 1
  },
  "LEGUME": {
    "HYBRID_BETTER": 0,
    "ENGINE_BETTER": 0,
    "TIE": 1,
    "INSUFFICIENT_DATA": 0
  }
}
```

## 3. Resultados por contexto

```json
{
  "LUNCH": {
    "HYBRID_BETTER": 4,
    "ENGINE_BETTER": 1,
    "TIE": 37,
    "INSUFFICIENT_DATA": 0
  },
  "BREAKFAST": {
    "HYBRID_BETTER": 0,
    "ENGINE_BETTER": 2,
    "TIE": 19,
    "INSUFFICIENT_DATA": 0
  },
  "DINNER": {
    "HYBRID_BETTER": 1,
    "ENGINE_BETTER": 2,
    "TIE": 25,
    "INSUFFICIENT_DATA": 2
  },
  "SNACK": {
    "HYBRID_BETTER": 1,
    "ENGINE_BETTER": 1,
    "TIE": 25,
    "INSUFFICIENT_DATA": 0
  }
}
```

## 4. Qualidade de cada SYSTEM list

```json
[
  {
    "slug": "MAIN_MEAL_STARCHES",
    "numberOfFoods": 6,
    "calculableFoods": 6,
    "timesSelected": 27,
    "timesProducedCandidate": 17,
    "averageUsefulCandidates": 1.7778,
    "duplicateRate": 0,
    "fallbackRate": 1,
    "contextMismatchRate": 0,
    "status": "LOW_VALUE"
  },
  {
    "slug": "BREAKFAST_CARBS",
    "numberOfFoods": 6,
    "calculableFoods": 6,
    "timesSelected": 4,
    "timesProducedCandidate": 2,
    "averageUsefulCandidates": 1.5,
    "duplicateRate": 0,
    "fallbackRate": 1,
    "contextMismatchRate": 0,
    "status": "LOW_VALUE"
  },
  {
    "slug": "LEAN_MAIN_PROTEINS",
    "numberOfFoods": 3,
    "calculableFoods": 3,
    "timesSelected": 20,
    "timesProducedCandidate": 13,
    "averageUsefulCandidates": 1.75,
    "duplicateRate": 0,
    "fallbackRate": 1,
    "contextMismatchRate": 0,
    "status": "UNDERPOPULATED"
  },
  {
    "slug": "FRUIT_PORTIONS",
    "numberOfFoods": 4,
    "calculableFoods": 4,
    "timesSelected": 24,
    "timesProducedCandidate": 21,
    "averageUsefulCandidates": 2.4583,
    "duplicateRate": 0,
    "fallbackRate": 0.125,
    "contextMismatchRate": 0,
    "status": "GOOD"
  },
  {
    "slug": "DAIRY_OPTIONS",
    "numberOfFoods": 3,
    "calculableFoods": 2,
    "timesSelected": 20,
    "timesProducedCandidate": 5,
    "averageUsefulCandidates": 0.25,
    "duplicateRate": 0.2,
    "fallbackRate": 1,
    "contextMismatchRate": 0,
    "status": "UNDERPOPULATED"
  },
  {
    "slug": "LEGUME_OPTIONS",
    "numberOfFoods": 2,
    "calculableFoods": 2,
    "timesSelected": 3,
    "timesProducedCandidate": 1,
    "averageUsefulCandidates": 0.3333,
    "duplicateRate": 0,
    "fallbackRate": 0.6667,
    "contextMismatchRate": 0,
    "status": "UNDERPOPULATED"
  },
  {
    "slug": "VEGETABLE_SIDES",
    "numberOfFoods": 3,
    "calculableFoods": 3,
    "timesSelected": 20,
    "timesProducedCandidate": 15,
    "averageUsefulCandidates": 0.9,
    "duplicateRate": 0,
    "fallbackRate": 0.95,
    "contextMismatchRate": 0,
    "status": "UNDERPOPULATED"
  }
]
```

## 5. Causas de ENGINE_BETTER

```json
{
  "CURATED_LIST_MISSING_GOOD_FOOD": 6,
  "CURATED_LIST_HAS_WEAK_FOOD": 0,
  "BAD_CONTEXT_MAPPING": 0,
  "BAD_ROLE_MAPPING": 0,
  "NUTRITION_DISTANCE": 0,
  "PREPARATION_CONFLICT": 0,
  "RESTRICTION_FILTER": 0,
  "SOURCE_NOT_CALCULABLE": 0,
  "FAMILY_DIVERSITY_SIDE_EFFECT": 0,
  "FALLBACK_ORDER": 0,
  "OTHER": 0
}
```

## 6. Problemas de mapping

A auditoria encontrou e corrigiu um mapping de baixo risco: alimentos classificados como BREAD_BASE no cafe/lanche agora podem resolver a lista BREAKFAST_CARBS. Depois da correcao, LUNCH/STARCH_MAIN -> MAIN_MEAL_STARCHES e BREAKFAST/BREAKFAST_CARB ou BREAD_BASE -> BREAKFAST_CARBS ficaram cobertos por teste. O ponto fraco restante nao e resolver a lista errada, mas listas pequenas ou genericas demais para vencer diversidade do motor automatico.

## 7. Problemas nutricionais

Candidatos curados conceitualmente validos ainda podem perder por distancia nutricional ou por quantidade pouco pratica. A lista deve continuar significando elegibilidade, nao prioridade absoluta.

## 8. Propostas de mudanca

Ver `reports/curated-exchange-list-change-proposals.md`. Nenhuma mudanca de lista SYSTEM foi aplicada automaticamente.

## 9. Estrategias de fusao comparadas

### 120 casos

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

### 500 casos

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

## 10. Novo benchmark

O benchmark estendido de 500 casos foi executado usando a nova funcao runtime `generateCuratedGlobalRankExchangeAlternatives`. A estrategia global trata curadoria como evidencia moderada e permite que um automatico contextualmente valido vença um curado nutricionalmente pior.

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

## 12. Testes

Esta fase adicionou auditoria offline, relatorios e teste unitario para mapping contextual/prioridade de template slot. Tambem gerou `reports/curated-exchange-clinical-review-set.md` com 50 casos rotulados GOOD/ACCEPTABLE/BAD por heuristica deterministica para revisao humana. Nao houve alteracao de schema nem ativacao de PILOT/ON.

## 13. Recomendacao de rollout

Manter SHADOW. Ha evidencia de que a estrategia de fusao atual `CURATED_FIRST_HARD` nao deve avancar para PILOT. A alternativa promissora e `CURATED_ELIGIBILITY_GLOBAL_QUALITY_RANK`, mas ela precisa virar mudanca explicita de codigo em fase separada e passar por revisao clinica.

CURATED_CALIBRATION_DATASET_READY: sim

SYSTEM_LISTS_CLINICALLY_CALIBRATED: nao

HYBRID_AFTER_BETTER_THAN_ENGINE_ONLY: nao

CURATED_EXCHANGE_LISTS_ROLLOUT: SHADOW

CURATED_EXCHANGE_LISTS_READY: nao
