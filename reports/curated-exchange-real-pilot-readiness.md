# Curated Exchange Real Pilot Readiness

Data: 2026-08-23

## 1. Runtime verification

Runtime `PILOT` ja existe e foi mantido sem ativacao global.

Estados suportados:

- `OFF`: engine-only.
- `SHADOW`: compara internamente, mas exibe/persiste engine-only.
- `PILOT`: usa global rank apenas para admin allowlisted.
- `ON`: suportado no codigo, nao recomendado.

Nenhuma alteracao foi feita no Nutrition Engine, resolver canonico, ranking ou schema.

## 2. Allowlist

Ativacao operacional:

```bash
CURATED_EXCHANGE_LISTS_MODE=PILOT
CURATED_EXCHANGE_PILOT_ADMIN_IDS=<id_autorizado>
```

IDs reais nao devem ser impressos em relatorios. Conta fora da allowlist continua em `ENGINE_ONLY`, mesmo com modo `PILOT`.

## 3. UI behavior

O `MealPlanEditor` continua simples: mostra alimento, quantidade equivalente, selecao e aprovacao. A UI principal nao mostra:

- `candidateOrigin`;
- `score`;
- `curatedListId`;
- `strategyUsed`;
- `pilot`;
- `ranking`;
- `debug`.

O texto visual que indicava lista curada foi removido do painel principal.

## 4. Telemetry

Eventos registrados:

- `SUGGESTION_SHOWN`
- `SUGGESTION_APPROVED`
- `SUGGESTION_REJECTED`
- `SUGGESTION_EDITED`
- `SUGGESTION_REPLACED_MANUALLY`
- `ALTERNATIVES_REGENERATED`

Chaves de correlacao:

- `exchangeGroupId`
- `mealPlanItemId`
- `strategyUsed`

Tambem sao registrados refs seguras `source:sourceId` para comparar pilot vs shadow engine-only sem expor dados sensiveis.

## 5. Pilot metrics

Script criado:

```bash
npx tsx scripts/curated-exchange-pilot-report.ts
```

Com periodo:

```bash
npx tsx scripts/curated-exchange-pilot-report.ts --from 2026-08-23T00:00:00.000Z --to 2026-08-30T23:59:59.999Z
```

Saida:

```txt
reports/curated-exchange-pilot-usage.md
```

Metricas calculadas:

- `approvalRate`
- `rejectionRate`
- `manualReplacementRate`
- `regenerationRate`
- `averageApprovedPerItem`
- `averageSuggestedPerItem`
- `fallbackRate`
- `USEFUL_SUGGESTION_RATE`
- `MANUAL_INTERVENTION_RATE`
- `FIRST_PASS_ACCEPTANCE_RATE`
- `pilotOnlyApproved`

Execucao local gerou relatorio vazio seguro porque as variaveis D1 nao estavam configuradas nesta sessao. Isso e esperado fora de ambiente operacional.

## 6. Golden scenarios

Casos prioritarios definidos no runbook:

- pao integral;
- arroz;
- feijao;
- frango;
- peixe;
- ovo;
- banana;
- mamao;
- iogurte;
- aveia;
- batata;
- mandioca;
- cuscuz;
- vegetais.

E2E critico cobre pao integral em fluxo real de template, geracao, aprovacao, reload, portal e print. Arroz, banana, proteina e vegetais permanecem cobertos por benchmark/revisao offline ate haver uso real suficiente.

## 7. Whole-plan review

O script operacional gera tabela:

```txt
Meal | Primary | Suggested | Approved | Rejected | Manual | StrategyUsed
```

Sem nome do paciente, email, diagnostico, anamnese ou notas.

## 8. Portal/print

Portal e print continuam lendo apenas alternativas `APPROVED`.

E2E critico valida:

- plano gerado por admin allowlisted;
- alternativa aprovada;
- reload;
- publicacao;
- portal;
- print;
- ausencia de termos internos no texto visivel ao paciente.

## 9. Performance

Benchmark 500 casos da fase anterior continua sendo referencia:

- `CURATED_ELIGIBILITY_GLOBAL_RANK` p95: 10.0727 ms.
- `ENGINE_ONLY` p95: 8.3267 ms.
- Sem regressao bloqueante.

Esta fase nao alterou ranking nem pesos.

## 10. Rollback

Kill switch:

```bash
CURATED_EXCHANGE_LISTS_MODE=SHADOW
```

Desligamento completo da resolucao curada:

```bash
CURATED_EXCHANGE_LISTS_MODE=OFF
```

Sem migration. Sem perda de planos. Alternativas ja aprovadas permanecem snapshots aprovados e nao sao recalculadas por mudanca de flag.

## 11. Privacy

Telemetria e relatorios nao incluem:

- nome do paciente;
- email;
- diagnostico;
- anamnese;
- observacoes clinicas;
- plano completo.

Dados permitidos: refs seguras, contexto de refeicao, grupo, papel culinario, estrategia e contagens agregadas.

## 12. Sample-size recommendation

Nao considerar `ON` com poucos dados.

Meta minima antes de avaliar default:

- >= 50 meal-plan items revisados;
- preferencialmente >= 10 planos;
- variedade de refeicoes/contextos.

Se nao houver baseline, o primeiro periodo do piloto deve virar baseline.

## 13. Risks

- Ainda nao ha dados reais suficientes para declarar valor clinico superior.
- Motivo de rejeicao e opcional; se pouco usado, analise qualitativa ficara limitada.
- `PILOT` depende de allowlist correta.
- Fallback deve ser interpretado como mecanismo de seguranca, nao erro automatico.

## 14. Recommendation

Prosseguir apenas com `PILOT` clinico controlado.

Nao ativar `ON`.

Nao ajustar pesos, listas system, thresholds ou familias com base em poucos usos. Se a telemetria apontar problema, gerar proposta separada para revisao humana.

Marcadores finais:

- `REAL_PILOT_ALLOWLIST_READY: sim`
- `REAL_PILOT_TELEMETRY_READY: sim`
- `REAL_PILOT_REPORTING_READY: sim`
- `REAL_PILOT_KILL_SWITCH_READY: sim`
- `REAL_PILOT_PORTAL_PRINT_READY: sim`
- `REAL_PILOT_CLINICAL_USE_READY: sim`
- `CURATED_EXCHANGE_LISTS_ROLLOUT: PILOT`
- `CURATED_EXCHANGE_LISTS_READY: nao`
