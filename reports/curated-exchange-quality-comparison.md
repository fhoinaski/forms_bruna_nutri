# Curated Exchange Quality Comparison

Data: 2026-08-22

## Objetivo

Comparar o motor automatico atual com o novo fluxo hibrido `curated-first + fallback automatico`, sem declarar melhora sem evidencia.

## Metodologia

- Amostra: 120 casos derivados de alimentos TACO em contextos reais de refeicao.
- Comparacao:
  - `ENGINE_ONLY`: motor automatico com filtros de grupo, funcao, contexto e diversidade.
  - `HYBRID_CURATED_FIRST`: lista curada quando resolvida, com fallback automatico validado quando necessario.
- Metricas:
  - alternativas geradas;
  - media de alternativas uteis por caso;
  - taxa de adequacao contextual;
  - taxa de candidatos absurdos;
  - taxa de duplicacao por caso;
  - participacao de candidatos curados.

## Resultado

```json
{
  "ENGINE_ONLY": {
    "cases": 120,
    "alternatives": 463,
    "averageUsefulAlternatives": 3.86,
    "contextAppropriateRate": 1,
    "absurdCandidateRate": 0,
    "duplicateCaseRate": 0,
    "curatedCandidateRate": 0
  },
  "HYBRID_CURATED_FIRST": {
    "cases": 120,
    "alternatives": 461,
    "averageUsefulAlternatives": 3.84,
    "contextAppropriateRate": 1,
    "absurdCandidateRate": 0,
    "duplicateCaseRate": 0,
    "curatedCandidateRate": 0.4187
  }
}
```

## Leitura

O hibrido aumentou a governanca do produto: 41,87% das alternativas passaram a vir de lista curada quando havia lista aplicavel.

O hibrido nao demonstrou melhora objetiva de qualidade sobre o motor automatico nesta amostra, porque:

- a media de alternativas uteis ficou ligeiramente menor: 3,84 contra 3,86;
- ambas as abordagens mantiveram 100% de adequacao contextual;
- ambas ficaram com 0% de candidatos absurdos e 0% de casos duplicados.

## Performance

Nao ha benchmark p50/p95/p99 suficiente para liberar `ON`. A arquitetura tende a reduzir busca quando listas curadas sao completas, mas a evidencia atual e insuficiente para concluir ganho operacional.

## Decisao de rollout

Recomendacao: `SHADOW`.

Motivo: schema, listas base e motor hibrido estao implementados, mas a comparacao ainda nao prova superioridade de qualidade. O modo `SHADOW` permite instrumentar casos reais sem alterar a experiencia persistida para a nutricionista.

## Condicoes para avancar

- Aumentar cobertura das listas `SYSTEM`.
- Permitir listas `USER` revisadas pela nutricionista.
- Medir p50/p95/p99 de geracao em dados reais.
- Rodar comparacao por tipo de refeicao e funcao culinaria.
- Avancar para `PILOT` apenas quando o hibrido mantiver ou superar variedade util e reduzir revisao manual.
