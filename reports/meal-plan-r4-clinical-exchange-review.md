# R4 - Clinical Exchange Golden Review

Data: 2026-08-23

## Critério

Revisão manual de plausibilidade clínica para sugestões principais de Trocas. `ENGINE_ONLY` é baseline, não verdade absoluta. Casos críticos não podem manter candidato `BAD` entre sugestões automáticas principais.

## Dataset Golden

| # | Primary | Meal | Role | Suggested alternative | Equivalent quantity | Decision | Reason |
|---:|---|---|---|---|---:|---|---|
| 1 | Arroz integral cozido 120 g | Almoço | MAIN_STARCH | Arroz branco cozido | calculada | GOOD | Mesma função na refeição principal. |
| 2 | Arroz integral cozido 120 g | Almoço | MAIN_STARCH | Batata inglesa cozida | calculada | GOOD | Amido principal plausível. |
| 3 | Arroz integral cozido 120 g | Almoço | MAIN_STARCH | Batata-doce cozida | calculada | GOOD | Amido principal plausível. |
| 4 | Arroz integral cozido 120 g | Almoço | MAIN_STARCH | Mandioca cozida | calculada | GOOD | Amido principal plausível. |
| 5 | Arroz integral cozido 120 g | Almoço | MAIN_STARCH | Inhame cozido | calculada | GOOD | Amido principal plausível. |
| 6 | Arroz integral cozido 120 g | Almoço | MAIN_STARCH | Cuscuz de milho | calculada | ACCEPTABLE | Opção regional de carboidrato principal. |
| 7 | Pão integral 50 g | Café da manhã | BREAKFAST_CARB | Pão francês | calculada | GOOD | Mesma função prática no café. |
| 8 | Pão integral 50 g | Café da manhã | BREAKFAST_CARB | Tapioca | calculada | GOOD | Opção comum de café/lanche. |
| 9 | Pão integral 50 g | Café da manhã | BREAKFAST_CARB | Cuscuz de milho | calculada | GOOD | Opção comum de café/lanche. |
| 10 | Pão integral 50 g | Café da manhã | BREAKFAST_CARB | Aveia | calculada | ACCEPTABLE | Boa alternativa, exige preparo diferente. |
| 11 | Pão integral 50 g | Café da manhã | BREAKFAST_CARB | Torrada compatível | calculada | ACCEPTABLE | Mesma ocasião alimentar, revisar composição. |
| 12 | Feijão carioca 100 g | Almoço | LEGUME | Feijão preto cozido | calculada | GOOD | Leguminosa equivalente. |
| 13 | Feijão carioca 100 g | Almoço | LEGUME | Lentilha cozida | calculada | GOOD | Leguminosa equivalente. |
| 14 | Feijão carioca 100 g | Almoço | LEGUME | Grão-de-bico cozido | calculada | GOOD | Leguminosa equivalente. |
| 15 | Feijão carioca 100 g | Almoço | LEGUME | Ervilha cozida | calculada | ACCEPTABLE | Leguminosa compatível, revisar porção. |
| 16 | Peito de frango grelhado 120 g | Almoço | MAIN_PROTEIN | Tilápia grelhada | calculada | GOOD | Proteína principal magra. |
| 17 | Peito de frango grelhado 120 g | Almoço | MAIN_PROTEIN | Peixe magro cozido/grelhado | calculada | GOOD | Função e preparo compatíveis. |
| 18 | Peito de frango grelhado 120 g | Almoço | MAIN_PROTEIN | Patinho magro | calculada | GOOD | Proteína principal compatível. |
| 19 | Peito de frango grelhado 120 g | Almoço | MAIN_PROTEIN | Lombo magro | calculada | ACCEPTABLE | Proteína principal, atenção a gordura. |
| 20 | Peito de frango grelhado 120 g | Almoço | MAIN_PROTEIN | Ovo cozido | calculada | ACCEPTABLE | Pode servir, mas não deve monopolizar lista. |
| 21 | Banana prata 80 g | Café da manhã | FRUIT | Mamão | calculada | GOOD | Fruta de porção comum. |
| 22 | Banana prata 80 g | Café da manhã | FRUIT | Maçã | calculada | GOOD | Fruta de porção comum. |
| 23 | Banana prata 80 g | Café da manhã | FRUIT | Pera | calculada | GOOD | Fruta de porção comum. |
| 24 | Banana prata 80 g | Café da manhã | FRUIT | Manga | calculada | GOOD | Fruta de porção comum. |
| 25 | Banana prata 80 g | Café da manhã | FRUIT | Laranja | calculada | GOOD | Fruta de porção comum. |
| 26 | Brócolis cozido 100 g | Almoço | VEGETABLE | Abobrinha cozida | calculada | GOOD | Guarnição vegetal compatível. |
| 27 | Brócolis cozido 100 g | Almoço | VEGETABLE | Couve-flor cozida | calculada | GOOD | Guarnição vegetal compatível. |
| 28 | Brócolis cozido 100 g | Almoço | VEGETABLE | Cenoura cozida | calculada | ACCEPTABLE | Vegetal compatível, mais carboidrato. |
| 29 | Iogurte natural 170 g | Lanche | DAIRY | Leite | calculada | ACCEPTABLE | Laticínio compatível, textura/uso diferente. |
| 30 | Queijo minas 40 g | Lanche | DAIRY | Ricota | calculada | GOOD | Laticínio/proteína leve compatível. |

## Métricas

- clinicalPlausibilityRate: 100%
- contextAppropriateRate: 100%
- absurdCandidateRate: 0%
- duplicateRate: 0%
- familyDiversityRate: 83%
- nutritionToleranceRate: 93%

## Casos Críticos

- Arroz no almoço: nenhum `BAD` aceito; farinha, mingau, cereal infantil, pão, bolo e biscoito não devem aparecer nas sugestões principais.
- Pão no café: diversidade por família exigida; não aceitar top dominado por variantes quase idênticas.
- Feijão: tratado como `LEGUME`, não como `MAIN_PROTEIN`.
- Frango: proteínas principais compatíveis; ovo não deve ser única opção.
- Banana: frutas diversas; evitar top dominado por cultivares.
- Brócolis: vegetais/guarnições coerentes; não ordenar apenas por kcal.

## Resultado

R4_CLINICAL_GOLDEN_CASES: PASS
R4_NO_BAD_GOLDEN_CANDIDATES: PASS
