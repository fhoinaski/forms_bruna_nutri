# Curated Exchange Pilot Runbook

## Objetivo

Habilitar o piloto controlado das listas curadas de equivalentes para nutricionista autorizada, coletando evidencia de uso real antes de qualquer decisao sobre `ON`.

## Ativacao controlada

Configurar no ambiente:

```bash
CURATED_EXCHANGE_LISTS_MODE=PILOT
CURATED_EXCHANGE_PILOT_ADMIN_IDS=<id_autorizado>
```

Use apenas IDs de admin autorizados. Nao publicar IDs reais em relatorios, prints ou tickets compartilhados.

## Comportamento esperado

- Admin allowlisted: `strategyRequested=CURATED_ELIGIBILITY_GLOBAL_RANK`.
- Admin allowlisted sem fallback: `strategyUsed=CURATED_ELIGIBILITY_GLOBAL_RANK`.
- Admin nao allowlisted: `strategyUsed=ENGINE_ONLY`, mesmo com `CURATED_EXCHANGE_LISTS_MODE=PILOT`.
- Paciente ve apenas alternativas aprovadas no portal e no print.

## Kill switch

Para voltar visualmente ao comportamento engine-only sem perda de dados:

```bash
CURATED_EXCHANGE_LISTS_MODE=SHADOW
```

Para desligar tambem a resolucao curada:

```bash
CURATED_EXCHANGE_LISTS_MODE=OFF
```

Nao ha migration reversa. Grupos ja aprovados continuam como snapshot aprovado e nao sao recalculados por mudanca de flag.

## Telemetria

Eventos gravados em `admin_audit_logs`:

- `SUGGESTION_SHOWN`
- `SUGGESTION_APPROVED`
- `SUGGESTION_REJECTED`
- `SUGGESTION_EDITED`
- `SUGGESTION_REPLACED_MANUALLY`
- `ALTERNATIVES_REGENERATED`

Campos seguros:

- `exchangeGroupId`
- `mealPlanItemId`
- `strategyUsed`
- `strategyRequested`
- `fallbackReason`
- `fallbackCategory`
- `mealContext`
- `foodGroup`
- `culinaryRole`
- referencias de alimentos no formato `source:sourceId`
- contagens agregadas
- duracao

Nao registrar nome do paciente, email, diagnostico, anamnese, observacoes clinicas ou plano completo.

## Motivo opcional de rejeicao

A API aceita motivo opcional em rejeicoes:

- `CULINARY_MISMATCH`
- `NUTRITION_MISMATCH`
- `PATIENT_PREFERENCE`
- `MEAL_CONTEXT`
- `TOO_SIMILAR`
- `NOT_PRACTICAL`
- `OTHER`

Nao tornar o motivo obrigatorio durante a consulta.

## Relatorio operacional

Gerar relatorio:

```bash
npx tsx scripts/curated-exchange-pilot-report.ts
```

Por periodo:

```bash
npx tsx scripts/curated-exchange-pilot-report.ts --from 2026-08-23T00:00:00.000Z --to 2026-08-30T23:59:59.999Z
```

Saida padrao:

```txt
reports/curated-exchange-pilot-usage.md
```

## Metricas

- `USEFUL_SUGGESTION_RATE`: `(approved + edited_and_kept) / reviewedSuggestions`.
- `MANUAL_INTERVENTION_RATE`: itens com busca manual, regeneracao ou exclusao total / itens com alternativas geradas.
- `FIRST_PASS_ACCEPTANCE_RATE`: itens com pelo menos uma sugestao aprovada sem regeneracao / itens revisados.
- `fallbackRate`: `GLOBAL_RANK_REQUESTED` mas `ENGINE_ONLY` usado.
- `approvalRate`, `rejectionRate`, `manualReplacementRate`, `regenerationRate`.
- `averageApprovedPerItem`, `averageSuggestedPerItem`.
- `pilotOnlyApproved`: aprovadas pelo piloto que nao estavam no shadow engine-only.

## Interpretacao

Fallback nao e erro por si so. Avaliar se:

- evita quebra de atendimento;
- entrega alternativas uteis;
- ocorre em frequencia aceitavel;
- nao aumenta rejeicoes por absurdo, contexto ou similaridade excessiva.

## Amostra minima antes de ON

Nao avaliar `ON` com poucos itens.

Recomendacao minima:

- pelo menos 50 itens de plano revisados;
- preferencialmente pelo menos 10 planos;
- variedade de refeicoes e alimentos.

Se nao houver baseline de uso, usar o primeiro periodo do piloto como baseline e manter `PILOT`.

## Casos prioritarios

Observar:

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

## Go/no-go futuro

Considerar avaliacao para `ON` somente se houver amostra suficiente e:

- `USEFUL_SUGGESTION_RATE >= baseline`;
- `FIRST_PASS_ACCEPTANCE_RATE >= baseline`;
- `MANUAL_INTERVENTION_RATE <= baseline`;
- rejeicoes por absurdo/contexto nao aumentarem;
- fallback nao comprometer UX;
- nenhum P0 aberto.

Nao ajustar pesos, listas system, thresholds ou familias automaticamente a partir do piloto. Gerar propostas para revisao humana.
