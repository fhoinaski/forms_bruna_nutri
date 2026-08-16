# USDA Production Import Report

## Database alvo

- Environment: production
- Database name: forms_bruna_nutri
- Database id: 5a1f3b97-ba6f-48b0-af09-811117d67d68
- Confirmed not staging: true
- Staging blocked target: forms_bruna_nutri_staging / 88baf58a-dea4-4fa8-98c4-a220ae5dbf55

## Pré-import

- Production file size before USDA import: 1888256 bytes
- Migrations before import: 50 applied after official migration step
- USDA foods before import: 0
- USDA nutrients before import: 0
- USDA FTS before import: 0
- Import batches before import: 0
- Orphan nutrients before import: 0
- Orphan FTS before import: 0

## Import

- Environment: production
- Database name: forms_bruna_nutri
- Database id: 5a1f3b97-ba6f-48b0-af09-811117d67d68
- Cloudflare verified: forms_bruna_nutri / 5a1f3b97-ba6f-48b0-af09-811117d67d68
- Allowlist: USDA_ALLOWLIST_V1
- Expected foods: 2895
- Batch: USDA_ALLOWLIST_V1
- Dry-run loaded foods: 2895
- Dry-run unique IDs: 2895
- Dry-run nutrient rows: 85971
- Dry-run rejects: 0
- Dry-run conflicts: 0
- Existing DB source_id conflicts: 0
- Estimated D1 file size: 32987628 bytes
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
- Import batch rows: 1

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
| arroz |0 |173.692 |181.966 |181.966 |0.92 |
| feijao |0 |169.431 |177.158 |177.158 |0.974 |
| banana |20 |173.102 |183.798 |183.798 |0.76 |
| leite |0 |167.933 |264.724 |264.724 |1.018 |
| ovo |2 |175.331 |181.964 |181.964 |1.054 |
| frango |0 |174.689 |178.469 |178.469 |1.007 |
| rice |20 |172.773 |183.739 |183.739 |1.153 |
| salmon |20 |170.94 |184.128 |184.128 |1.067 |
| turkey |20 |171.695 |183.241 |183.241 |1.055 |
| yogurt |20 |174.47 |277.344 |277.344 |0.907 |
| quinoa |2 |169.284 |187.071 |187.071 |0.788 |
| blueberry |19 |173.486 |191.966 |191.966 |0.908 |
| ric |20 |170.686 |185.949 |185.949 |1.058 |
| sal |20 |172.358 |195.54 |195.54 |0.877 |
| yog |20 |168.32 |176.053 |176.053 |2.289 |

### Prefix

| Query |Results |p50 wall ms |p95 wall ms |max wall ms |p50 D1 ms |
| --- |--- |--- |--- |--- |--- |
| arroz |0 |172.893 |185.962 |185.962 |0.7 |
| feijao |0 |176.362 |185.992 |185.992 |0.704 |
| banana |1 |175.547 |191.256 |191.256 |0.934 |
| leite |0 |172.76 |179.968 |179.968 |0.723 |
| ovo |0 |171.053 |178.738 |178.738 |0.669 |
| frango |0 |178.489 |197.508 |197.508 |0.913 |
| rice |20 |177.58 |198.242 |198.242 |0.864 |
| salmon |5 |175.296 |182.331 |182.331 |0.766 |
| turkey |20 |176.357 |193.359 |193.359 |0.974 |
| yogurt |20 |173.189 |247.154 |247.154 |0.939 |
| quinoa |1 |170.633 |222.62 |222.62 |0.83 |
| blueberry |0 |174.506 |184.171 |184.171 |1.877 |
| ric |20 |173.104 |180.327 |180.327 |0.854 |
| sal |15 |174.64 |213.488 |213.488 |0.721 |
| yog |20 |175.348 |187.128 |187.128 |0.853 |

### FTS

| Query |Results |p50 wall ms |p95 wall ms |max wall ms |p50 D1 ms |
| --- |--- |--- |--- |--- |--- |
| arroz |0 |171.141 |180.25 |180.25 |0.206 |
| feijao |0 |174.169 |180.636 |180.636 |0.245 |
| banana |20 |171.104 |182.864 |182.864 |0.329 |
| leite |0 |174.842 |189.8 |189.8 |0.175 |
| ovo |0 |175.353 |247.196 |247.196 |0.196 |
| frango |0 |173.904 |186.143 |186.143 |0.29 |
| rice |20 |176.759 |184.562 |184.562 |0.435 |
| salmon |20 |176.181 |410.219 |410.219 |0.338 |
| turkey |20 |171.917 |187.536 |187.536 |0.521 |
| yogurt |20 |173.258 |189.783 |189.783 |0.451 |
| quinoa |2 |173.271 |183.671 |183.671 |0.265 |
| blueberry |19 |172.197 |181.258 |181.258 |0.448 |
| ric |20 |173.422 |191.284 |191.284 |0.341 |
| sal |20 |173.87 |180.524 |180.524 |0.433 |
| yog |20 |172.557 |190.122 |190.122 |0.405 |

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
- Snapshot: Validated by immutable source_id/name/nutrient values captured from imported rows; no clinical production patient data was mutated for smoke testing.
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

- Before bytes: 1888256
- After full import bytes: 33316864
- After rollback bytes: 33316864
- After reimport bytes: 33316864
- Full import delta bytes: 31428608
- Relative row growth vs Phase 9: 1.93x foods.
- Operational projection: search remains bounded by LIMIT and hybrid fallback. Do not infer financial cost without Cloudflare billing data.

## Rollback

- Executed: no
- Reason: Production import succeeded; rollback kept ready but not executed.
- Rollback before foods: 0
- Rollback before nutrients: 0
- Rollback before FTS: 0
- After rollback batch foods: not executed
- After rollback orphan nutrients: not executed
- After rollback orphan FTS: not executed
- TACO intact: USDA-only rollback touches only food_catalog_usda_* and import_batches.

## Reimport

- Executed: no
- Reimport created foods: not executed
- Reimport created nutrients: not executed
- Reimport FTS rows: not executed
- Final production foods: 2895
- Final production nutrients: 85971
- Final production FTS: 2895

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

PRODUCTION_IMPORT_SUCCESS
