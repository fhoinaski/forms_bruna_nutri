# Runtime Shadow Comparison — Fase 4

Gerado em: 2026-08-22T15:43:35.111Z
Total de queries: 519 (>= 500 exigido pelo item 13)
Tempo total: 244.7s

## Outcomes

- CANONICAL_FOUND_MORE: 378 (72.8%)
- CANONICAL_AMBIGUOUS: 84 (16.2%)
- DIFFERENT_TOP: 13 (2.5%)
- SAME_TOP: 44 (8.5%)

## Latência (ms)

| | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|
| round-trip total (wrapper) | 365.66 | 723.57 | 810.47 | 2399.85 |
| resolver atual | 361.91 | 723.44 | 810.33 | 2396.99 |
| resolver canônico (D1 real) | 351.97 | 390.24 | 600.79 | 2399.73 |

Telemetria nunca guarda texto livre de query — só hash sha256, status, fonte, score e latência (ver `CanonicalShadowTelemetryEvent`).