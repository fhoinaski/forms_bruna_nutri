# USDA Pilot Import Report

Batch: USDA_PILOT_20260816
Target local DB: `F:\bruna_nutri_forms\forms_bruna_nutri\reports\food-kb-usda-pilot.sqlite`

## Import

- Pilot selected: 720
- Created foods: 720
- Created nutrient rows: 23011
- No-op foods on rerun: 720
- Storage delta: 9515008 bytes

Second execution of the same batch:

- Created foods: 0
- Created nutrient rows: 0
- Duplicated foods: 0
- Duplicated nutrient rows: 0
- Storage delta on rerun: 0 bytes

## Categories

- Cereais: 70
- Carnes: 60
- Aves: 55
- Peixes: 55
- Ovos: 35
- Leite e laticinios: 65
- Frutas: 70
- Verduras: 50
- Legumes: 70
- Leguminosas: 55
- Oleaginosas: 45
- Oleos: 35
- Tuberculos: 45
- Quality fill: 10

## Integrity

- integrity_check: ok
- foreign_key_check rows: 0
- duplicate source_id: 0
- orphan nutrients: 0
- negative values: 0
- audited foods: 50
- audit diffs: 0

## Units

- g: 6452
- kJ: 720
- kcal: 720
- mcg: 3600
- mg: 11519

## NULL vs Zero

- Imported true zero nutrient rows: 2842
- Source NULL nutrient values not imported as rows: 29

## Nutrient Coverage

| Nutrient | Unit | Rows |
| --- | --- | ---: |
| CALCIUM | mg | 720 |
| CARBOHYDRATE | g | 720 |
| CHOLESTEROL | mg | 720 |
| COPPER | mg | 720 |
| ENERGY_KCAL | kcal | 720 |
| ENERGY_KJ | kJ | 720 |
| FIBER | g | 720 |
| FOLATE | mcg | 720 |
| IRON | mg | 720 |
| MAGNESIUM | mg | 720 |
| MANGANESE | mg | 719 |
| MONOUNSATURATED_FAT | g | 720 |
| NIACIN | mg | 720 |
| PHOSPHORUS | mg | 720 |
| POLYUNSATURATED_FAT | g | 720 |
| POTASSIUM | mg | 720 |
| PROTEIN | g | 720 |
| RIBOFLAVIN | mg | 720 |
| SATURATED_FAT | g | 720 |
| SELENIUM | mcg | 720 |
| SODIUM | mg | 720 |
| SUGARS | g | 720 |
| THIAMIN | mg | 720 |
| TOTAL_FAT | g | 720 |
| TRANS_FAT | g | 692 |
| VITAMIN_A | mcg | 720 |
| VITAMIN_B12 | mcg | 720 |
| VITAMIN_B6 | mg | 720 |
| VITAMIN_C | mg | 720 |
| VITAMIN_D | mcg | 720 |
| VITAMIN_E | mg | 720 |
| ZINC | mg | 720 |

Vitamin K and pantothenic acid (B5) are present in the internal vocabulary but were not imported in this pilot because this V3 copy has no `vitamin_k_*` or `pantothenic_acid_*` columns in `food_nutrients`.

## Performance

| Query | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: |
| arroz | 0.171 | 0.231 | 0.546 |
| feijao | 0.136 | 0.234 | 0.323 |
| banana | 0.157 | 0.286 | 0.363 |
| leite | 0.143 | 0.153 | 0.156 |
| ovo | 0.148 | 0.166 | 0.179 |
| frango | 0.130 | 0.141 | 0.142 |
| rice | 0.171 | 0.198 | 0.282 |
| salmon | 0.310 | 0.461 | 0.476 |
| turkey | 0.325 | 0.414 | 0.440 |
| blueberry | 0.133 | 0.206 | 0.208 |
| greek yogurt | 0.151 | 0.224 | 0.256 |
| quinoa | 0.171 | 0.342 | 0.495 |

Benchmark scope: direct SQLite local query against `reports/food-kb-usda-pilot.sqlite`. This isolates the USDA search query cost and does not include HTTP/D1 network latency or endpoint JSON serialization.

`rice` latency decomposition in this local pilot:

- local/TACO search: not included in the SQLite-only measurement;
- USDA SQLite query p50: 0.171 ms;
- merge/ranking: negligible for 20 rows in-process;
- serialization: not included;
- endpoint complete: not measured in this local pilot.

The Fase 6 D1-remote measurement remains the better signal for networked endpoint behavior: Brazilian queries p50 ~172-184 ms and `rice` p50 ~344 ms with USDA empty. The pilot proves the SQL itself is not the bottleneck; remote D1/network is the likely dominant component.

Query-plan note: the local USDA pilot query uses `food_catalog_usda_foods_search_idx` for the table scan/order context, but `%term%` LIKE cannot fully use a prefix index. Prefix queries can use the normalized-name index more effectively; this should be revisited before importing the full 7.790 if endpoint p95 is above target.

## Decision

GO_WITH_FIXES: piloto fiel e idempotente; antes da carga completa, reduzir os 7.790 para allowlist operacional por grupo/uso clinico e revisar performance em ambiente alvo.

Do not import the remaining 7.790 yet.
