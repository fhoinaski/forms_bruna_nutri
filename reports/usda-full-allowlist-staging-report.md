# USDA Full Allowlist Staging Report

## Import

- Environment: staging
- Database name: forms_bruna_nutri_staging
- Database id: 88baf58a-dea4-4fa8-98c4-a220ae5dbf55
- Cloudflare verified: forms_bruna_nutri_staging / 88baf58a-dea4-4fa8-98c4-a220ae5dbf55
- Allowlist: USDA_ALLOWLIST_V1
- Expected foods: 2895
- Batch: USDA_ALLOWLIST_V1
- Dry-run loaded foods: 2895
- Dry-run unique IDs: 2895
- Dry-run nutrient rows: 85971
- Dry-run rejects: 0
- Dry-run conflicts: 0
- Estimated D1 file size: 32545260 bytes
- First import created foods: 2895
- First import created nutrients: 85971
- FTS rows after import: 2895
- Failures: 0

## Idempotência

- Second import created foods: 0
- Second import created nutrients: 0
- Second import noop foods: 2895
- Duplicate FTS rows: 0

## Review Items

- USDA_SR_LEGACY:170259: Frozen novelties, ice type, sugar free, orange, cherry, and grape POPSICLE pops; present=true; decision=KEPT_MARKED_REVIEW_BEFORE_PRODUCTION_RECHECK
- USDA_SR_LEGACY:173186: Beverages, V8 SPLASH Smoothies, Peach Mango; present=true; decision=KEPT_MARKED_REVIEW_BEFORE_PRODUCTION_RECHECK
- USDA_SR_LEGACY:169635: Snacks, SUNKIST, SUNKIST Fruit Roll, strawberry, with vitamins A, C, and E; present=true; decision=KEPT_MARKED_REVIEW_BEFORE_PRODUCTION_RECHECK
- USDA_SR_LEGACY:171431: Margarine, margarine-like vegetable oil spread, 67-70% fat, tub; present=true; decision=KEPT_MARKED_REVIEW_BEFORE_PRODUCTION_RECHECK
- USDA_SR_LEGACY:173781: SILK Blueberry soy yogurt; present=true; decision=KEPT_MARKED_REVIEW_BEFORE_PRODUCTION_RECHECK

## Counts

- USDA foods: 2895
- USDA nutrients: 85971
- USDA FTS rows: 2895
- Import batch rows: 2

## Integrity

- Orphan nutrients: 0
- Orphan FTS: 0
- Foods without source ID: 0
- Broken batch refs: 0
- Negative values: 0
- Unknown units: 0
- Unknown nutrient codes: 0
- Duplicate nutrient code per food: 0
- NULL nutrient values retained: 0
- Real zero values retained: 12377

## Coverage

| Nutrient |Foods |Coverage |
| --- |--- |--- |
| CALCIUM |2866 |98.998% |
| CARBOHYDRATE |2895 |100% |
| CHOLESTEROL |2811 |97.098% |
| COPPER |2752 |95.06% |
| ENERGY_KCAL |2895 |100% |
| ENERGY_KJ |2895 |100% |
| FIBER |2733 |94.404% |
| FOLATE |2667 |92.124% |
| IRON |2869 |99.102% |
| MAGNESIUM |2796 |96.58% |
| MANGANESE |2484 |85.803% |
| MONOUNSATURATED_FAT |2770 |95.682% |
| NIACIN |2799 |96.684% |
| PHOSPHORUS |2810 |97.064% |
| POLYUNSATURATED_FAT |2771 |95.717% |
| POTASSIUM |2818 |97.34% |
| PROTEIN |2895 |100% |
| RIBOFLAVIN |2800 |96.718% |
| SATURATED_FAT |2819 |97.375% |
| SELENIUM |2634 |90.984% |
| SODIUM |2878 |99.413% |
| SUGARS |2219 |76.649% |
| THIAMIN |2796 |96.58% |
| TOTAL_FAT |2895 |100% |
| TRANS_FAT |1549 |53.506% |
| VITAMIN_A |2633 |90.95% |
| VITAMIN_B12 |2722 |94.024% |
| VITAMIN_B6 |2769 |95.648% |
| VITAMIN_C |2763 |95.44% |
| VITAMIN_D |2036 |70.328% |
| VITAMIN_E |2142 |73.99% |
| ZINC |2790 |96.373% |

## Group Distribution

| Group |Foods |
| --- |--- |
| Cereais |320 |
| Laticinios |320 |
| Carnes |310 |
| Preparacoes simples |280 |
| Peixes |258 |
| Frutas |250 |
| Aves |205 |
| Legumes |191 |
| Bebidas |120 |
| Leguminosas |115 |
| Oleos e gorduras |100 |
| Oleaginosas |88 |
| Frutos do mar |83 |
| Verduras |77 |
| Ovos |75 |
| Tuberculos |60 |
| Sementes |43 |

## Auditoria 200

- Sample size: 200
- Mismatches: 0
- Mismatch examples: none

## Performance

Compared to Phase 9, the row count increased from 1,500 to 2,895 foods. Wall times remain dominated by remote D1/API latency; D1 internal timings remain low.

### Contains

| Query |Results |p50 wall ms |p95 wall ms |max wall ms |p50 D1 ms |
| --- |--- |--- |--- |--- |--- |
| arroz |0 |188.508 |511.945 |511.945 |1.168 |
| feijao |0 |185.586 |195.45 |195.45 |0.948 |
| banana |20 |188.358 |202.172 |202.172 |0.795 |
| leite |0 |182.816 |197.779 |197.779 |0.983 |
| ovo |2 |185.138 |201.569 |201.569 |0.877 |
| frango |0 |183.188 |195.126 |195.126 |0.932 |
| rice |20 |185.075 |203.405 |203.405 |0.861 |
| salmon |20 |185.912 |201.018 |201.018 |1.075 |
| turkey |20 |185.244 |191.206 |191.206 |1.127 |
| yogurt |20 |185.604 |195.79 |195.79 |0.942 |
| quinoa |2 |182.145 |187.92 |187.92 |0.865 |
| blueberry |19 |185.593 |264.369 |264.369 |1.207 |
| ric |20 |184.842 |201.179 |201.179 |0.815 |
| sal |20 |187.115 |261.055 |261.055 |1.276 |
| yog |20 |187.83 |237.17 |237.17 |0.935 |

### Prefix

| Query |Results |p50 wall ms |p95 wall ms |max wall ms |p50 D1 ms |
| --- |--- |--- |--- |--- |--- |
| arroz |0 |183.088 |193.637 |193.637 |0.601 |
| feijao |0 |186.601 |191.499 |191.499 |0.664 |
| banana |1 |182.71 |200.111 |200.111 |0.978 |
| leite |0 |186.12 |193.712 |193.712 |0.622 |
| ovo |0 |185.168 |195.658 |195.658 |0.567 |
| frango |0 |186.447 |252.644 |252.644 |0.805 |
| rice |20 |184.427 |192.949 |192.949 |0.657 |
| salmon |5 |185.445 |191.232 |191.232 |0.774 |
| turkey |20 |185.724 |199.325 |199.325 |0.744 |
| yogurt |20 |186.557 |196.168 |196.168 |0.951 |
| quinoa |1 |184.878 |197.242 |197.242 |0.886 |
| blueberry |0 |187.93 |197.734 |197.734 |0.994 |
| ric |20 |187.627 |420.842 |420.842 |0.75 |
| sal |15 |187.602 |195.382 |195.382 |0.806 |
| yog |20 |189.954 |200.222 |200.222 |0.929 |

### FTS

| Query |Results |p50 wall ms |p95 wall ms |max wall ms |p50 D1 ms |
| --- |--- |--- |--- |--- |--- |
| arroz |0 |184.853 |197.676 |197.676 |0.277 |
| feijao |0 |183.255 |208.707 |208.707 |0.294 |
| banana |20 |183.97 |232.843 |232.843 |0.56 |
| leite |0 |184.124 |218.99 |218.99 |0.274 |
| ovo |0 |185.815 |226.34 |226.34 |0.254 |
| frango |0 |182.969 |241.299 |241.299 |0.288 |
| rice |20 |185.096 |194.137 |194.137 |0.45 |
| salmon |20 |185.492 |195.949 |195.949 |0.423 |
| turkey |20 |187.025 |200.584 |200.584 |0.635 |
| yogurt |20 |186.856 |199.302 |199.302 |0.381 |
| quinoa |2 |183.819 |197.463 |197.463 |0.367 |
| blueberry |19 |189.95 |222.542 |222.542 |0.432 |
| ric |20 |187.311 |223.363 |223.363 |0.529 |
| sal |20 |188.626 |198.069 |198.069 |0.479 |
| yog |20 |188.228 |196.596 |196.596 |0.359 |

## Query Plan

### Contains
- SCAN food_catalog_usda_foods

### Prefix
- SCAN food_catalog_usda_foods

### FTS
- SCAN x VIRTUAL TABLE INDEX 0:M3
- SEARCH f USING INDEX sqlite_autoindex_food_catalog_usda_foods_1 (id=?)

## TACO Priority

- Query: arroz
- USDA candidates available: 0
- Decision: Runtime food catalog keeps local/TACO search first; USDA is fallback unless source=USDA.

## USDA Explicit

- Query: source=USDA rice
- Results: 10
- First result: USDA_SR_LEGACY:173347 - RICE-A-RONI, chicken flavor, unprepared

## MealPlan

- USDA real sample categories tested mathematically: cereal, carne, fruta, vegetal, laticinio, peixe.
- Foods: Cereais: USDA_SR_LEGACY:167939 (80 g); Carnes: USDA_SR_LEGACY:175290 (120 g); Frutas: USDA_SR_LEGACY:171714 (100 g); Verduras: USDA_SR_LEGACY:168462 (90 g); Laticinios: USDA_SR_LEGACY:172223 (200 g); Peixes: USDA_SR_LEGACY:173703 (130 g)
- Snapshot: Validated by immutable source_id/name/nutrient values captured from imported rows; staging mutation is not required to change application architecture.
- Multi-source: TACO + USDA + CUSTOM aggregation remains covered by unit/E2E gates; USDA clinical traits remain unknown.
- Food substitution regression: USDA does not enter safe clinical substitutions automatically.
- Clinical safety: USDA traits remain unknown.

## Nutrient Aggregation

| Nutrient |Value |Unit |
| --- |--- |--- |
| ENERGY_KCAL |1425.3 |kcal |
| ENERGY_KJ |5962.1 |kJ |
| PROTEIN |94.366 |g |
| CARBOHYDRATE |69.723 |g |
| SUGARS |18.97 |g |
| TOTAL_FAT |85.826 |g |
| SATURATED_FAT |38.437 |g |
| MONOUNSATURATED_FAT |27.006 |g |
| POLYUNSATURATED_FAT |9.148 |g |
| TRANS_FAT |2.756 |g |
| FIBER |8.88 |g |
| SODIUM |2239.2 |mg |
| CALCIUM |1280.6 |mg |
| IRON |7.957 |mg |
| MAGNESIUM |237.4 |mg |
| PHOSPHORUS |1481.6 |mg |
| POTASSIUM |2113.6 |mg |
| ZINC |10.323 |mg |
| COPPER |0.51 |mg |
| MANGANESE |1.272 |mg |
| SELENIUM |143.72 |mcg |
| VITAMIN_A |927.3 |mcg |
| VITAMIN_C |54.45 |mg |
| VITAMIN_D |25.19 |mcg |
| VITAMIN_E |6.825 |mg |
| THIAMIN |0.867 |mg |
| RIBOFLAVIN |1.098 |mg |
| NIACIN |21.631 |mg |
| VITAMIN_B6 |1.735 |mg |
| VITAMIN_B12 |8.37 |mcg |
| FOLATE |357.6 |mcg |
| CHOLESTEROL |282.6 |mg |

## Storage

- Before bytes: 1445888
- After full import bytes: 32858112
- After rollback bytes: 1650688
- After reimport bytes: 32813056
- Full import delta bytes: 31412224
- Relative row growth vs Phase 9: 1.93x foods.
- Operational projection: search remains bounded by LIMIT and hybrid fallback. Do not infer financial cost without Cloudflare billing data.

## Rollback

- Rollback before foods: 2895
- Rollback before nutrients: 85971
- Rollback before FTS: 2895
- After rollback batch foods: 0
- After rollback orphan nutrients: 0
- After rollback orphan FTS: 0
- TACO intact: USDA-only rollback touches only food_catalog_usda_* and import_batches.

## Reimport

- Reimport created foods: 2895
- Reimport created nutrients: 85971
- Reimport FTS rows: 2895
- Final staging foods: 2895
- Final staging nutrients: 85971
- Final staging FTS: 2895

## Observability

- Catalog version: USDA_ALLOWLIST_V1
- USDA count: 2895
- Import batch: USDA_ALLOWLIST_V1
- Last import status: COMPLETED
- Failures: 0

## Production Plan

Do not execute automatically. Prepare a versioned production config with explicit database name/id and approved import metadata before running.

- Expected database: forms_bruna_nutri
- Allowlist version: USDA_ALLOWLIST_V1
- Batch: USDA_ALLOWLIST_V1
- Quantity: 2895
- Required production config gate: `approved_imports.USDA_ALLOWLIST_V1 = { "enabled": true, "allowlist_version": "USDA_ALLOWLIST_V1", "expected_foods": 2895 }`
- Import command: `node scripts/usda-full-allowlist-staging.mjs --db F:/Downloads/food_knowledge_base_v3.sqlite --config config/d1-production-usda-allowlist.json --expected-database-name forms_bruna_nutri --expected-database-id <PRODUCTION_D1_DATABASE_ID>`
- Rollback SQL: `DELETE FROM food_catalog_usda_foods_fts WHERE food_id IN (SELECT id FROM food_catalog_usda_foods WHERE import_run_id = 'USDA_ALLOWLIST_V1'); DELETE FROM food_catalog_usda_foods WHERE import_run_id = 'USDA_ALLOWLIST_V1'; UPDATE import_batches SET status = 'ROLLED_BACK', updated_at = CURRENT_TIMESTAMP WHERE id = 'USDA_ALLOWLIST_V1';`
- Post-import verification: counts, integrity query, coverage, search benchmark, MealPlan gates.

The definitive import must require explicit database ID and name. A bare remote flag is not sufficient, and no generic force-production bypass exists.

## Decision

READY_FOR_PRODUCTION
