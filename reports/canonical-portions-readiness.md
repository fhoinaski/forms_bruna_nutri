# Canonical Portions Readiness — Fase 5 (item 10)

Gerado em: 2026-08-22 — dados reais do D1 (`canonical_food_portions`,
8.157 medidas caseiras, todas TBCA).

## Números reais (D1 real)

| Métrica | Contagem | % do total |
|---|---:|---:|
| Total de medidas | 8.157 | 100% |
| `weight_source = structured_quantity` (gramas/mL veio estruturado da fonte) | 6.289 | 77,1% |
| `weight_source = parsed_from_label` (extraído heuristicamente do texto do label) | 1.809 | 22,2% |
| `weight_source = unknown` | 59 | 0,7% |
| Gramas explícitas (`gram_weight IS NOT NULL`) | 5.644 | 69,2% |
| Só mL, sem gramas (`ml_weight IS NOT NULL AND gram_weight IS NULL`) | 645 | 7,9% |
| Depende de `parsed_label_grams` (heurística de texto) | 1.809 | 22,2% |
| Ambíguas (`unknown` ou nenhum peso resolvido) | 59 | 0,7% |

## Confiança (`confidence`)

| confidence | Contagem | Composição |
|---|---:|---|
| high | 5.644 | 100% de `structured_quantity` com grama explícita |
| medium | 645 | 100% de `structured_quantity` só com mL (nunca convertido pra grama — decisão de Fase 1: nunca inventar densidade) |
| low | 1.868 | 1.809 `parsed_from_label` + 59 `unknown` |

**Achado real:** toda medida `parsed_from_label` tem `confidence = low` —
nenhuma tem `medium`/`high`. Isso é esperado (extrair peso de um texto de
label é sempre menos confiável que um campo estruturado da própria fonte),
mas significa que **nenhuma** medida `parsed_from_label` passa num filtro
conservador de "high/medium apenas".

## Quantas podem ser usadas com segurança no plano alimentar HOJE

Com uma política conservadora (só `gram_weight` explícito, `weight_source
= structured_quantity`, `confidence = high`):

**5.644 de 8.157 (69,2%)** podem ser usadas com segurança hoje, sem
nenhuma heurística extra.

As outras 2.513 (30,8%) — 645 só-mL + 1.809 parsed-from-label + 59
unknown — **não** devem entrar no cálculo automático do plano alimentar
sem revisão adicional: mL nunca é convertido pra grama (decisão de
arquitetura desde a Fase 1: densidade varia por alimento e nunca foi
medida), e `parsed_from_label` é heurística de texto, não dado
estruturado da fonte.

## Classificação READY/PARTIAL/NOT_READY

| Item | Status |
|---|---|
| Medidas com grama explícita (structured_quantity) | **READY** — usável hoje sem ressalva |
| Medidas só em mL | **NOT_READY** para uso automático (precisaria de densidade por alimento, não disponível) |
| Medidas parsed_from_label | **PARTIAL** — dado existe e é plausível, mas confidence=low em 100% dos casos; útil pra sugestão/exibição, não pra cálculo automático sem revisão humana |
| Medidas unknown | **NOT_READY** (0,7% do total, volume baixo) |
