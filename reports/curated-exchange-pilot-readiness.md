# Curated Exchange Pilot Readiness

Data: 2026-08-23

## 1. Objetivo

Validar um piloto controlado da estrategia `CURATED_ELIGIBILITY_GLOBAL_RANK` no fluxo real do `MealPlanEditor`, preservando `ENGINE_ONLY` como fallback e sem ativacao global.

## 2. Escopo implementado

- Runtime `OFF` / `SHADOW` / `PILOT` / `ON` validado no repositorio de grupos de troca.
- `PILOT` restrito por allowlist de admin.
- Geracao direta, geracao por item resolvido e geracao em lote recebem `ownerAdminId`.
- Telemetria interna de geracao e revisao clinica gravada em `admin_audit_logs`.
- UI, portal e print continuam sem expor estrategia interna.

## 3. Fora de escopo

- Nenhuma ativacao global foi feita.
- `ENGINE_ONLY` nao foi removido.
- Nenhuma migration ou alteracao de schema foi adicionada nesta fase.
- Nutrition Engine e resolver canonico nao foram reescritos.
- `ON` nao foi recomendado.

## 4. Feature flags

`CURATED_EXCHANGE_LISTS_MODE` aceita:

- `OFF`: usa e persiste `ENGINE_ONLY`.
- `SHADOW`: calcula comparacao interna, mas exibe/persiste `ENGINE_ONLY`.
- `PILOT`: usa global rank somente para admin allowlisted.
- `ON`: suportado pelo runtime, nao recomendado nesta fase.

Allowlist do piloto:

- `CURATED_EXCHANGE_PILOT_ADMIN_IDS=admin-1,admin-2`
- Se vazia ou sem o admin atual, `PILOT` cai para `SHADOW` com `fallbackReason=PILOT_ADMIN_NOT_ALLOWED`.

## 5. Runtime do PILOT

Em `PILOT` autorizado, o fluxo solicitado e:

`Generate alternatives -> CURATED_ELIGIBILITY_GLOBAL_RANK -> persistir resultado curado-global se houver alternativas validas`.

O piloto usa curadoria como sinal de elegibilidade/contexto e mantem o calculo de quantidade no motor deterministico.

## 6. Fallback obrigatorio

Fallback para `ENGINE_ONLY` implementado para:

- modo `OFF`;
- modo `SHADOW`;
- admin nao autorizado no `PILOT`;
- ausencia de lista curada;
- erro no hard curated;
- erro no global rank;
- resultado curado vazio.

Nenhum fallback fica silencioso: `strategyRequested`, `strategyUsed`, `fallback` e `fallbackReason` sao registrados.

## 7. Telemetria sem PHI

Geracao registra apenas:

- estrategia solicitada/usada;
- fallback e motivo;
- contexto da refeicao;
- grupo alimentar e papel culinario;
- referencia segura do alimento principal (`source:sourceId`);
- contagem total, curada e automatica de candidatos;
- duracao;
- comparacao shadow quando aplicavel.

Nao registra nome do paciente, diagnostico, anamnese, observacoes ou plano completo.

## 8. Comportamento clinico

A rota de revisao registra eventos agregados para:

- aprovados;
- rejeitados;
- editados;
- adicionados manualmente;
- estrategia de origem do grupo;
- quantidade de candidatos.

Esses dados permitem calcular approvalRate, rejectionRate, manualReplacementRate, averageAlternativesKept e regenerationRate por estrategia.

## 9. Portal e print

Portal e print continuam lendo apenas alternativas `APPROVED`. Nenhum dado de estrategia, lista, ranking ou fallback e exibido ao paciente.

E2E validou:

- print mostra substituicao aprovada;
- portal mostra substituicao aprovada;
- total do plano nao soma alternativa como item principal.

## 10. Historico

Planos antigos e snapshots existentes nao sao migrados. Como nao houve schema novo, rollback nao exige migracao reversa.

## 11. Casos dourados

Base de revisao manual mantida em `reports/curated-global-ranking-manual-review.md`, incluindo:

- arroz no almoco;
- carboidratos de cafe/lanche;
- banana/frutas;
- frango no almoco;
- feijoes/leguminosas;
- vegetais.

Resultado observado: a estrategia global nao deixa a lista curada vencer automaticamente; automaticos melhores podem ranquear quando clinicamente plausiveis.

## 12. Benchmark 500 casos

Relatorio regenerado: `reports/curated-global-ranking-validation.md`.

Marcadores:

- `CURATED_GLOBAL_RANK_STRATEGY_READY: sim`
- `CURATED_GLOBAL_RANK_BETTER_THAN_ENGINE_ONLY: sim`
- `ABSURD_CANDIDATE_RATE: 0.0582`
- `CONTEXT_APPROPRIATE_RATE_ENGINE: 1`
- `CONTEXT_APPROPRIATE_RATE_GLOBAL: 1`
- `CLINICAL_PLAUSIBILITY_ENGINE: 0.9397`
- `CLINICAL_PLAUSIBILITY_GLOBAL: 0.9418`
- `NUTRITION_TOLERANCE_ENGINE: 0.2246`
- `NUTRITION_TOLERANCE_GLOBAL: 0.2527`

Performance:

- `ENGINE_ONLY` p95: 8.3267 ms
- `CURATED_FIRST_HARD` p95: 8.5136 ms
- `CURATED_ELIGIBILITY_GLOBAL_RANK` p95: 10.0727 ms

Regressao: PASS.

## 13. Testes unitarios novos

Arquivo: `tests/curated-exchange-pilot.test.ts`.

Cobertura:

- `OFF` usa e persiste `ENGINE_ONLY`;
- `SHADOW` calcula comparacao, mas persiste `ENGINE_ONLY`;
- `PILOT` sem allowlist cai para `SHADOW/ENGINE_ONLY`;
- `PILOT` allowlisted usa `CURATED_ELIGIBILITY_GLOBAL_RANK`;
- `PILOT` sem lista curada fallbacka para `ENGINE_ONLY`.

## 14. E2E

Execucao normal:

- `e2e/meal-plan-substitutions.spec.ts`
- `e2e/meal-plan-ux2.spec.ts`
- Resultado: 13 passed, 2 flaky passed on retry, exit code 0.

Execucao PILOT:

- `CURATED_EXCHANGE_LISTS_MODE=PILOT`
- `CURATED_EXCHANGE_PILOT_ADMIN_IDS=e2e-admin-default`
- `e2e/meal-plan-substitutions.spec.ts`
- Resultado: 6 passed.

## 15. Gates executados

- `npm run ci:artifact-check`: PASS
- `npm run migrate:d1:check`: PASS
- `npm run schema:runtime-check`: PASS
- `npm run lint`: PASS
- `npx tsc --noEmit --incremental false`: PASS
- `npm test`: PASS, 196 arquivos / 1758 testes
- `npm run build`: PASS
- E2E relevante: PASS

## 16. Rollback e kill switch

Rollback:

- `CURATED_EXCHANGE_LISTS_MODE=SHADOW` preserva telemetria/comparacao e exibe engine.
- `CURATED_EXCHANGE_LISTS_MODE=OFF` desliga resolucao de lista curada e usa engine.

Sem migracao reversa.

## 17. Riscos residuais

- Os dados ainda exigem revisao clinica continuada antes de `ON`.
- `PILOT` depende de allowlist configurada corretamente.
- Dois testes UX apresentaram flake no primeiro attempt e passaram no retry; nao afetaram a jornada de substituicoes.

## 18. Recomendacao

Recomendacao tecnica: habilitar apenas `PILOT` controlado para admin/nutricionista autorizado.

Nao recomendar `ON`.

Nao alterar configuracao global nesta fase.

Marcadores finais:

- `CURATED_PILOT_RUNTIME_READY: sim`
- `CURATED_PILOT_FALLBACK_READY: sim`
- `CURATED_PILOT_TELEMETRY_READY: sim`
- `CURATED_PILOT_E2E_READY: sim`
- `CURATED_PILOT_BENCHMARK_REGRESSION: PASS`
- `CURATED_EXCHANGE_LISTS_ROLLOUT: PILOT`
- `CURATED_EXCHANGE_LISTS_READY: nao`
