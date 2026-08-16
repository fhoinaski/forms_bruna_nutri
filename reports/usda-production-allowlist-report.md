# USDA Production Allowlist Report

Version: USDA_ALLOWLIST_V1
Source DB: `F:\Downloads\food_knowledge_base_v3.sqlite`
Allowlist: `F:\bruna_nutri_forms\forms_bruna_nutri\data\usda-production-allowlist.json`
Benchmark DB: `F:\bruna_nutri_forms\forms_bruna_nutri\reports\usda-allowlist-benchmark-v2.sqlite`

## Elegiveis totais

- Eligible records from V3 rules: 7838
- Selected for production allowlist: 2895
- Rejected/review after operational selection: 4943
- Full USDA import was not executed.
- Production was not modified.

## Criterios

Score deterministico, sem LLM como autoridade:

- Nutrient coverage: ate 30 pontos.
- Name clarity: ate 15 pontos, penalizando nomes longos e excesso de qualificadores.
- Practical/simple use: ate 20 pontos, favorecendo alimentos simples ou preparos comuns.
- Source quality: ate 15 pontos, favorecendo SR Legacy/Foundation e data_quality COMPLETE.
- Penalties: registros institucionais/obscuros, industrializados de baixa utilidade clinica, nomes muito longos.
- Deduplicacao operacional: maximo 2-3 itens por chave normalizada similar, preservando source records na V3 externa.

## Distribuicao

| Grupo | Elegiveis | Allowlist | % |
| --- | ---: | ---: | ---: |
| Cereais | 670 | 320 | 47.8% |
| Leguminosas | 126 | 115 | 91.3% |
| Carnes | 2319 | 310 | 13.4% |
| Aves | 222 | 205 | 92.3% |
| Peixes | 259 | 258 | 99.6% |
| Frutos do mar | 83 | 83 | 100% |
| Ovos | 76 | 75 | 98.7% |
| Laticinios | 466 | 320 | 68.7% |
| Frutas | 335 | 250 | 74.6% |
| Verduras | 82 | 77 | 93.9% |
| Legumes | 207 | 191 | 92.3% |
| Tuberculos | 64 | 60 | 93.8% |
| Oleaginosas | 90 | 88 | 97.8% |
| Sementes | 44 | 43 | 97.7% |
| Oleos e gorduras | 144 | 100 | 69.4% |
| Bebidas | 275 | 120 | 43.6% |
| Preparacoes simples | 498 | 280 | 56.2% |
| Fora dos grupos operacionais | 1878 | 0 | 0% |

## Rejeitados

| Motivo | Count |
| --- | ---: |
| OUT_OF_OPERATIONAL_GROUPS | 3756 |
| LOW_PRACTICAL_RELEVANCE | 517 |
| NEAR_DUPLICATE_REVIEW | 27 |
| LOW_UTILITY_SCORE | 15 |

## Dry-run allowlist

- Foods: 2895
- Nutrient rows: 85971
- Aliases: 0
- Portions: 0
- Estimated storage: 13598208 bytes (12.968 MB)
- Conflicts: 0

## Benchmark local

Escopo: SQLite local com schema D1-compativel para carga intermediaria de 1500 alimentos. Nao e benchmark remoto D1.

| Query | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: |
| arroz | 0.335 | 0.626 | 0.979 |
| feijao | 0.259 | 0.276 | 0.307 |
| banana | 0.278 | 0.351 | 0.379 |
| leite | 0.289 | 0.645 | 0.646 |
| ovo | 0.309 | 0.329 | 0.422 |
| frango | 0.27 | 0.688 | 0.734 |
| rice | 0.375 | 0.391 | 0.399 |
| salmon | 0.34 | 0.755 | 1.035 |
| yogurt | 0.282 | 0.511 | 0.622 |
| quinoa | 0.241 | 0.418 | 0.422 |
| blueberry | 0.258 | 0.267 | 0.271 |

## Query plans

Query `rice`:

- SCAN food_catalog_usda_foods
- USE TEMP B-TREE FOR ORDER BY

Observacao: `LIKE '%term%'` tende a escanear o indice/tabela para substring. Prefix search ou FTS devem ser avaliados no D1 remoto antes da carga final.

## Idempotencia

- First import created foods: 1500
- First import created nutrient rows: 44308
- Second import created foods: 0
- Second import created nutrient rows: 0
- Second import noop foods: 1500

## Rollback

- Batch before rollback: 1500 foods
- Batch after rollback: 0 foods
- Orphan nutrients after rollback: 0

## Auditoria 100 itens

- Audited items: 100
- PASS: 97
- REVIEW: 3

## Ambiente alvo

Benchmark remoto D1/staging nao foi executado nesta rodada porque o repo nao contem configuracao separada de staging/preview; ha apenas variaveis genericas `CLOUDFLARE_D1_DATABASE_ID` em `.env.local`, que nao sao prova suficiente de ambiente nao produtivo. Por seguranca, nenhuma escrita remota foi feita.

## Recomendacao

GO_WITH_INDEX/CACHE: allowlist operacional esta pronta para benchmark remoto controlado, mas a carga final deve esperar uma base D1 staging/preview explicitamente identificada e medicao endpoint real. Se o D1 remoto repetir latencia alta com `LIKE '%term%'`, avaliar FTS ou prefix strategy antes de importar a allowlist completa.

Do not import the full allowlist or the remaining 7.790 yet.
