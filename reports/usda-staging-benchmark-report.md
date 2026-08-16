# USDA Staging Benchmark Report

## Database

- Environment: staging
- Database name: forms_bruna_nutri_staging
- Database id: 88baf58a-dea4-4fa8-98c4-a220ae5dbf55
- Cloudflare name verified: forms_bruna_nutri_staging
- Cloudflare id verified: 88baf58a-dea4-4fa8-98c4-a220ae5dbf55

## Safety

- Import guard requires config.environment = staging.
- Database name must include staging and match Cloudflare metadata.
- The production-like database `forms_bruna_nutri` was not used.
- Batch id: USDA_STAGING_BENCHMARK_V1

## Review Items

- USDA_SR_LEGACY:170259: Frozen novelties, ice type, sugar free, orange, cherry, and grape POPSICLE pops (Frutas), score 63, coverage 19; decision KEEP_IN_ALLOWLIST_BUT_REVIEW_BEFORE_FULL_IMPORT
- USDA_SR_LEGACY:173186: Beverages, V8 SPLASH Smoothies, Peach Mango (Frutas), score 58, coverage 18; decision KEEP_IN_ALLOWLIST_BUT_REVIEW_BEFORE_FULL_IMPORT
- USDA_SR_LEGACY:169635: Snacks, SUNKIST, SUNKIST Fruit Roll, strawberry, with vitamins A, C, and E (Frutas), score 43.5, coverage 8; decision KEEP_IN_ALLOWLIST_BUT_REVIEW_BEFORE_FULL_IMPORT
- USDA_SR_LEGACY:171431: Margarine, margarine-like vegetable oil spread, 67-70% fat, tub (Legumes), score 51, coverage 11; decision KEEP_IN_ALLOWLIST_BUT_REVIEW_BEFORE_FULL_IMPORT
- USDA_SR_LEGACY:173781: SILK Blueberry soy yogurt (Leguminosas), score 54, coverage 14; decision KEEP_IN_ALLOWLIST_BUT_REVIEW_BEFORE_FULL_IMPORT

## Import

- Before staging counts: foods 0, nutrients 0, fts 0
- First import created foods: 1500
- First import created nutrients: 44308
- Second import foods after rerun: 0
- Second import nutrients after rerun: 0
- Second import noop foods: 1500
- After import counts: foods 1500, nutrients 44308, fts 1500

## Storage

- D1 file_size before import: 1220608 bytes
- D1 file_size after 1.500 import: 17334272 bytes
- D1 file_size after rollback: 1286144 bytes
- Observed file_size delta at import peak: 16113664 bytes
- Projection for 2.895 foods by row ratio: 31099372 bytes plus base schema/metadata

## Search Strategies

### A - CURRENT CONTAINS

| Query | Results | p50 wall ms | p95 wall ms | max wall ms | p50 D1 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| arroz | 0 | 185.05 | 222.891 | 222.891 | 0.637 |
| feijao | 0 | 186.676 | 221.381 | 221.381 | 0.568 |
| banana | 7 | 182.426 | 193.772 | 193.772 | 0.504 |
| leite | 0 | 183.747 | 432.204 | 432.204 | 0.669 |
| ovo | 1 | 183.415 | 190.637 | 190.637 | 0.857 |
| frango | 0 | 183.179 | 229.265 | 229.265 | 0.479 |
| rice | 20 | 187.077 | 190.396 | 190.396 | 0.892 |
| salmon | 20 | 186.953 | 211.487 | 211.487 | 0.519 |
| turkey | 20 | 185.355 | 194.548 | 194.548 | 0.636 |
| yogurt | 20 | 185.056 | 191.31 | 191.31 | 0.63 |
| quinoa | 2 | 185.687 | 215.754 | 215.754 | 0.518 |
| blueberry | 1 | 182.84 | 196.643 | 196.643 | 0.468 |
| ric | 20 | 185.904 | 233.493 | 233.493 | 0.774 |
| sal | 20 | 184.498 | 203.291 | 203.291 | 0.676 |
| yog | 20 | 187.135 | 216.162 | 216.162 | 0.602 |

### B - PREFIX

| Query | Results | p50 wall ms | p95 wall ms | max wall ms | p50 D1 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| arroz | 0 | 184.775 | 217.501 | 217.501 | 0.481 |
| feijao | 0 | 184.573 | 218.823 | 218.823 | 0.528 |
| banana | 0 | 187.045 | 205.563 | 205.563 | 0.469 |
| leite | 0 | 186.317 | 199.184 | 199.184 | 0.484 |
| ovo | 0 | 189.695 | 220.634 | 220.634 | 0.408 |
| frango | 0 | 186.276 | 194.228 | 194.228 | 0.441 |
| rice | 20 | 184.207 | 226.029 | 226.029 | 0.594 |
| salmon | 5 | 188.324 | 236.796 | 236.796 | 0.684 |
| turkey | 20 | 185.653 | 201.594 | 201.594 | 0.59 |
| yogurt | 9 | 185.347 | 228.887 | 228.887 | 0.452 |
| quinoa | 1 | 186.557 | 206.459 | 206.459 | 0.401 |
| blueberry | 0 | 183.658 | 198.576 | 198.576 | 0.403 |
| ric | 20 | 188.406 | 202.492 | 202.492 | 0.523 |
| sal | 11 | 186.969 | 205.202 | 205.202 | 0.414 |
| yog | 9 | 184.773 | 199.15 | 199.15 | 0.454 |

### C - FTS

| Query | Results | p50 wall ms | p95 wall ms | max wall ms | p50 D1 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| arroz | 0 | 184.139 | 188.246 | 188.246 | 0.281 |
| feijao | 0 | 186.174 | 511.405 | 511.405 | 0.243 |
| banana | 7 | 185.094 | 209.797 | 209.797 | 0.419 |
| leite | 0 | 185.734 | 207.99 | 207.99 | 0.243 |
| ovo | 0 | 187.49 | 260.92 | 260.92 | 0.271 |
| frango | 0 | 184.301 | 192.706 | 192.706 | 0.222 |
| rice | 20 | 186.034 | 190.388 | 190.388 | 0.413 |
| salmon | 20 | 186.796 | 213.597 | 213.597 | 0.515 |
| turkey | 20 | 185.044 | 199.885 | 199.885 | 0.538 |
| yogurt | 20 | 184.943 | 189.958 | 189.958 | 0.412 |
| quinoa | 2 | 187.624 | 268.079 | 268.079 | 0.278 |
| blueberry | 1 | 184.495 | 188.919 | 188.919 | 0.357 |
| ric | 20 | 183.477 | 193.255 | 193.255 | 0.424 |
| sal | 20 | 184.84 | 195.537 | 195.537 | 0.355 |
| yog | 20 | 184.217 | 223.105 | 223.105 | 0.445 |

## Query Plans

### Contains
- SCAN food_catalog_usda_foods

### Prefix
- SCAN food_catalog_usda_foods

### FTS
- SCAN x VIRTUAL TABLE INDEX 0:M3
- SEARCH f USING INDEX sqlite_autoindex_food_catalog_usda_foods_1 (id=?)

## Rollback

- Before rollback foods: 1500
- Before rollback FTS rows: 1500
- After rollback foods: 0
- Orphan nutrients after rollback: 0
- Orphan FTS after rollback: 0

## Recommendation

GO_FULL_ALLOWLIST_WITH_INDEX: staging is separated and protected; FTS is available and avoids the plain table scan for token search. Use HYBRID search: exact/prefix first, FTS for token/partial USDA fallback, contains only as bounded fallback. Do not import the full 2.895 in this phase.
