# Canonical Nutrient Readiness — Fase 5 (item 11)

Gerado em: 2026-08-22 — dados reais do D1 (`food_nutrient_values`,
636.572 linhas). Total de alimentos por fonte: TBCA 7.522, IBGE_POF 1.944,
TACO 597.

`pct` = % de alimentos da fonte com esse nutriente reportado
(`status='reported' AND value IS NOT NULL`), por 100g, sem porção. Fonte
ausente de uma linha = 0% (a fonte nunca reporta esse nutriente).

## CORE (energy/protein/carbohydrate/fat/fiber)

| Nutriente | TACO | TBCA | IBGE_POF |
|---|---:|---:|---:|
| ENERGY_KCAL | 99,0% | 83,4% | 97,4% |
| PROTEIN | 96,5% | 86,4% | 94,1% |
| CARBOHYDRATE | 97,5% | 83,4% | 69,4% |
| TOTAL_FAT | 93,8% | 81,7% | 93,4% |
| FIBER | 59,5% | 83,8% | 55,0% |

**CORE está bem coberto nas 3 fontes** — a pior célula é FIBER na IBGE_POF
(55%), ainda assim majoritária.

## CLINICAL

| Nutriente | TACO | TBCA | IBGE_POF |
|---|---:|---:|---:|
| SODIUM | 87,6% | 82,2% | 0% |
| CALCIUM | 97,0% | 85,2% | 0% |
| IRON | 92,8% | 84,4% | 0% |
| MAGNESIUM | 96,6% | 84,0% | 0% |
| POTASSIUM | 97,5% | 84,3% | 0% |
| ZINC | 91,0% | 83,9% | 0% |
| FOLATE | 0% | 78,3% | 0,3% |
| VITAMIN_B12 | 0% | 80,0% | 0,4% |
| VITAMIN_D | 0% | 74,7% | 0,5% |
| VITAMIN_C | 34,8% | 74,5% | 0,5% |
| ADDED_SUGAR | 0% | 63,1% | 13,1% |
| ADDED_SALT | 0% | 63,3% | 0% |

## Achados

- **TBCA é a única fonte com cobertura real em toda a lista CLINICAL** —
  inclusive os nutrientes que TACO/IBGE_POF simplesmente não reportam
  (FOLATE, VITAMIN_B12, VITAMIN_D, ADDED_SALT).
- **IBGE_POF praticamente não tem minerais/vitaminas** (0% em SODIUM,
  CALCIUM, IRON, MAGNESIUM, POTASSIUM, ZINC, FOLATE≈0%, VITAMIN_B12≈0%,
  VITAMIN_D≈0%, VITAMIN_C≈0%) — é uma fonte forte pra identidade/consumo
  regional (Fase 1), fraca pra dado clínico de micronutriente.
- **TACO não reporta FOLATE/VITAMIN_B12/VITAMIN_D/ADDED_SUGAR/ADDED_SALT
  em nenhum alimento** (0%) — mas é forte em minerais (Ca/Fe/Mg/K/Zn todos
  >90%).
- Nenhuma fonte tem 100% em nenhum nutriente — sempre vai haver `status
  != reported` (trace/missing/not_applicable/unparsed) pra alguma fração,
  preservado fielmente desde a importação (nunca reescrito).

## Cobertura por fonte (resumo)

| Fonte | CORE | CLINICAL (minerais) | CLINICAL (vitaminas raras) |
|---|---|---|---|
| TBCA | boa (81-86%) | boa (82-85%) | **única com cobertura real** (74-80%) |
| TACO | boa (59-99%) | boa (87-97%) | nenhuma (0%) |
| IBGE_POF | razoável (55-97%) | **nenhuma (0%)** | quase nenhuma (0-13%) |
