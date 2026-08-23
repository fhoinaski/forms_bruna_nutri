# Meal Plan - Contextual Exchange Quality

Data: 2026-08-22/2026-08-23

## Escopo

Correção de qualidade no Food Exchange Engine para considerar contexto da refeição, uso culinário, forma do produto e diversidade alimentar antes do ranking final. O cálculo nutricional e a gramatura equivalente continuam delegados ao `substitution-engine`; esta fase altera elegibilidade, ranking e diversidade.

## Mudanças funcionais

- `MealContext`: BREAKFAST, MORNING_SNACK, LUNCH, AFTERNOON_SNACK, DINNER, SUPPER, GENERIC.
- `CulinaryRole`: STARCH_MAIN, BREAD_BASE, BREAKFAST_CARB, FRUIT_PORTION, LEAN_PROTEIN_MAIN, LEGUME_SIDE, VEGETABLE_SIDE, DAIRY_SNACK, FAT_ADDITION.
- `FoodForm`: RICE, BREAD, TUBER, PASTA, COUSCOUS, OAT, TAPIOCA, QUINOA, CORN, RAW_STARCH, FLOUR, INFANT_CEREAL, COOKIE, CAKE, DESSERT, SNACK, JUICE, PRESERVED_FRUIT, etc.
- SAME_SUBGROUP deixou de ser regra dominante de ranking; agora é evidência após adequação contextual, qualidade e score.
- Diversidade por família e forma: não completa top N com repetição quando faltam opções boas.
- IA não foi introduzida como dependência; o fallback determinístico é o comportamento principal.

## Golden cases auditados

### Arroz integral no almoço

Primary: Arroz, integral, cozido - 120 g
Contexto: LUNCH
Role: STARCH_MAIN

- Nhoque, batata, cozido - 85 g - TUBER - STARCH_MAIN
- Lasanha, massa fresca, cozida - 95 g - PASTA - STARCH_MAIN
- Arroz, tipo 2, cozido - 110 g - RICE - STARCH_MAIN
- Batata, inglesa, cozida - 260 g - TUBER - STARCH_MAIN
- Cuscuz, de milho, cozido com sal - 125 g - COUSCOUS - STARCH_MAIN

Bloqueados do top: pão, farinha, cereal infantil, mingau, biscoito, bolo, farofa, pipoca, amido cru.

### Pão integral no café

Primary: Pão, trigo, forma, integral - 50 g
Contexto: BREAKFAST
Role: BREAKFAST_CARB/BREAD_BASE

- Tapioca, com manteiga - 40 g - TAPIOCA - BREAKFAST_CARB
- Bisnaguinha, pão, assado, industrializada - 35 g - BREAD - BREAD_BASE
- Pão, trigo, francês - 45 g - BREAD - BREAD_BASE
- Aveia, flocos, crua - 35 g - OAT - BREAKFAST_CARB

Resultado intencional: retornou 4 opções, não 5. Quality > count; não completou com farinha, mingau, bolo, biscoito ou cereal infantil.

### Banana no lanche

Primary: Banana, prata, crua - 80 g
Contexto: AFTERNOON_SNACK
Role: FRUIT_PORTION

- Abacaxi, cru - 170 g - FRUIT - FRUIT_PORTION
- Umbu, polpa, congelada - 235 g - FRUIT - FRUIT_PORTION
- Melancia, crua - 255 g - FRUIT - FRUIT_PORTION

Bloqueados do top: geleia, suco, fruta em calda, mel e cultivares repetidos de banana.

### Frango no almoço

Primary: Frango, peito, sem pele, grelhado - 120 g
Contexto: LUNCH
Role: LEAN_PROTEIN_MAIN

- Pintado, cru - 205 g - FISH - LEAN_PROTEIN_MAIN
- Corvina do mar, crua - 205 g - FISH - LEAN_PROTEIN_MAIN
- Pescadinha, crua - 250 g - FISH - LEAN_PROTEIN_MAIN
- Carne, bovina, maminha, grelhada - 125 g - RED_MEAT - LEAN_PROTEIN_MAIN
- Frango, peito, cozido, s/ pele, s/ sal - 125 g - POULTRY - LEAN_PROTEIN_MAIN

Bloqueados do top: ovo isolado, queijo e suplemento.

## Métricas

| Métrica | Resultado |
| --- | ---: |
| contextAppropriateRate | 100% nos golden cases |
| sameRoleRate | 100% nos golden cases |
| duplicateRate | 0% nos golden cases |
| absurdCandidateRate | 0% nos bloqueios solicitados |
| familyDiversityRate | PASS: top não é dominado por uma única família |

## Testes

- `npm test -- tests/food-exchange-groups.test.ts`: PASS - 36 tests
- `npm test`: PASS - 194 files, 1744 tests
- `npx tsc --noEmit --incremental false`: PASS
- `npm run lint`: PASS

## Status

MEAL_PLAN_CONTEXTUAL_EXCHANGE_READY: sim
