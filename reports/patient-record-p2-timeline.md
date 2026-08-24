# Patient Record P2 - Clinical Timeline

Data: 2026-08-23

## Baseline

Esta fase continua a reestruturação do prontuario do paciente a partir de P1. O escopo executado foi somente P2 Clinical Timeline, preservando o shell e o overview criados em P1.

Arquivos de referencia relidos antes da implementacao:

- `reports/patient-record-current-state.md`
- `reports/patient-record-target-ux.md`
- `reports/patient-record-data-contract.md`
- `reports/patient-record-p1-overview.md`

Nenhuma migration ou schema novo foi criado nesta fase. A timeline passou a ser derivada de fontes clinicas canonicas ja existentes, sem usar audit log como timeline principal.

## Source Audit

| EVENT_SOURCE | TABLE/REPOSITORY | EVENT_TYPE | DATE_FIELD | PATIENT_OWNERSHIP | CLINICAL_VALUE | INCLUDE_NOW | REASON |
|---|---|---|---|---|---|---|---|
| Consultation sessions | `consultation_sessions` + `appointments` | `CONSULTATION_COMPLETED` | `COALESCE(ended_at, started_at)` | `consultation_sessions.client_id = patientId`; appointment join tambem escopado por `client_id` | Alto | sim | Consulta finalizada e fato clinico longitudinal. |
| Anthropometry/evolution | `client_evolutions` | `ANTHROPOMETRY_RECORDED` | `COALESCE(measured_at, created_at)` | `client_evolutions.client_id = patientId` | Alto | sim | Medidas corporais sao sinal clinico central e permitem delta de peso. |
| Meal plans | `meal_plans` | `MEAL_PLAN_PUBLISHED` | `COALESCE(updated_at, created_at)` | `meal_plans.client_id = patientId` | Alto | sim | Plano ativo/arquivado representa plano publicado ou historico aprovado; rascunho fica fora. |
| Protocols | `client_protocols` + `protocols` | `PROTOCOL_STARTED`, `PROTOCOL_COMPLETED` | `started_at`, `completed_at` | `client_protocols.client_id = patientId` | Medio/alto | sim | Inicio e conclusao de protocolo sao marcos clinicos acompanhaveis. |
| Appointments | `appointments` | n/a | `starts_at` | `appointments.client_id = patientId` | Medio | nao | Agenda futura fica no overview como proxima consulta; nao entra na timeline clinica para evitar vazamento de eventos futuros. Consultas realizadas entram por `consultation_sessions`. |
| Documents | n/a | n/a | n/a | n/a | Indefinido | nao | Nao ha entidade persistida confiavel de documentos clinicos no contrato atual. |
| Explicit client timeline | `client_timeline_events` | n/a | `created_at` | `client_id` | Misto | nao | Fonte existente mistura eventos manuais/tecnicos; P2 exige timeline clinica derivada de fontes canonicas. |
| Audit log | n/a | n/a | n/a | n/a | Tecnico | nao | Audit log nao e historico clinico do paciente. |

PATIENT_P2_EVENT_SOURCES_MAPPED: sim

## Timeline Contract

Contrato criado em `lib/repositories/patient-record-timeline.ts`:

- `PatientTimelineEventType`
- `PatientTimelineEvent`
- `PatientTimelineFilter`
- `PatientTimelineResult`
- `getPatientClinicalTimeline(patientId, options)`

Campos canonicos por evento:

- `id`
- `patientId`
- `type`
- `occurredAt`
- `title`
- `description`
- `meta`
- `source`
- `sourceId`
- `action`

A rota `GET /api/admin/clients/[id]/record-timeline` expõe o contrato para carregamento lazy do historico completo com `limit`, `offset` e `filter`. Respostas usam `Cache-Control: private, no-store`.

PATIENT_P2_TIMELINE_CONTRACT: PASS

## Aggregator

O agregador usa `d1Batch` para consultar as fontes clinicas em lote, valida existencia do paciente e normaliza os eventos em uma lista unica. Ele tambem:

- exclui eventos com data futura em relacao a `now`;
- exclui planos em `draft`;
- calcula delta de peso com base nas avaliacoes anteriores;
- aplica filtros antes de paginação;
- usa ordenacao deterministica para eventos no mesmo instante.

PATIENT_P2_EVENT_AGGREGATOR: PASS

## Ordering

A ordenacao principal e `occurredAt DESC`. Empates sao resolvidos por ranking fixo de tipo e depois por `id`, evitando flutuacao visual. Eventos futuros sao filtrados em SQL e novamente apos normalizacao para isolar inconsistencias de fonte.

PATIENT_P2_CHRONOLOGICAL_ORDER: PASS
PATIENT_P2_NO_DUPLICATE_EVENTS: PASS
PATIENT_P2_FUTURE_EVENT_ISOLATION: PASS

## Recent Activity

O overview P1 agora recebe `initialRecentActivity` do mesmo contrato canonico da timeline, limitado a 5 eventos. A atividade recente mostra apenas marcos clinicos e mantem agenda futura fora da lista; o proximo atendimento continua no bloco proprio do resumo.

PATIENT_P2_RECENT_ACTIVITY: PASS

## Full Timeline

A aba `Evolucao` agora mostra "Timeline clinica" como historico longitudinal principal. Ela suporta:

- lista completa paginada;
- "Carregar mais";
- empty state clinico com atalhos para consulta e avaliacao;
- acao contextual para abrir consulta, antropometria, plano alimentar ou protocolo quando aplicavel;
- estado de erro recuperavel com "Tentar novamente".

PATIENT_P2_FULL_TIMELINE: PASS

## Filters

Filtros implementados:

- Todos
- Consultas
- Avaliacoes
- Planos
- Protocolos

Os filtros chamam a API canonica e nao fazem busca global nem reclassificacao na UI.

PATIENT_P2_FILTERS: PASS

## Security

A API exige administrador autenticado via `getAdminFromRequest`. Todas as fontes sao escopadas por `patientId`; o join de consulta com agenda tambem limita `appointments.client_id = consultation_sessions.client_id`, evitando cruzamento acidental de pacientes.

PATIENT_P2_SECURITY: PASS

## Performance

O carregamento inicial da ficha usa `Promise.all` para snapshot, resumo P1 e atividade recente P2. A timeline completa e carregada sob demanda ao abrir a aba, com limite padrao e paginação.

## Responsive

Foram validados os estados principais em desktop, mobile 390px e tablet 768px. A timeline permanece em coluna unica em telas pequenas, com filtros em wrap e botoes sem sobreposicao.

PATIENT_P2_RESPONSIVE: PASS

## Accessibility

A timeline usa heading claro, grupo de filtros com `aria-label`, listas com `aria-label`, botoes nomeados e estados vazios/erro com texto visivel. Os eventos usam links/botoes semanticamente acionaveis.

PATIENT_P2_ACCESSIBILITY: PASS

## Tests

Unit:

- `npx vitest run tests/patient-record-timeline.test.ts tests/patient-record-summary.test.ts`
- Resultado: 12 tests passed.

Full unit suite:

- `npm test`
- Resultado: 206 files, 1797 tests passed.

E2E P2:

- `E2E_PORT=3021 npx playwright test e2e/patient-record-p2-timeline.spec.ts`
- Resultado: 18 passed.

E2E P1 regression:

- `E2E_PORT=3020 npx playwright test e2e/patient-record-p1-overview.spec.ts`
- Resultado: 14 passed.

Full gates:

- `npm run ci:artifact-check`: PASS
- `npm run migrate:d1:check`: PASS
- `npm run schema:runtime-check`: PASS
- `npm run lint`: PASS
- `npx tsc --noEmit`: PASS
- `npm test`: PASS
- `npm run build`: PASS

PATIENT_P2_P1_REGRESSION: PASS

## Screenshots

Capturas geradas em `reports/screenshots/patient-record/`:

- `P2-01-recent-activity-overview-*.png`
- `P2-02-full-timeline-desktop-*.png`
- `P2-03-timeline-filters-*.png`
- `P2-04-same-day-events-*.png`
- `P2-05-empty-timeline-*.png`
- `P2-06-mobile-390-*.png`
- `P2-07-tablet-*.png`
- `P2-08-error-loading-*.png`

PATIENT_P2_VISUAL_REVIEW_READY: sim

## Known Limitations

- `meal_plans` nao possui `published_at`; P2 usa `COALESCE(updated_at, created_at)` para `MEAL_PLAN_PUBLISHED`.
- Documentos clinicos nao entram porque nao existe entidade persistida confiavel para esse dominio no contrato atual.
- Agenda futura nao entra na timeline; deve permanecer como proxima consulta no overview.
- A aba ainda mantem blocos legados inalcancaveis no arquivo para evitar refatoracao ampla fora de P2.

## P3 Readiness

P2 entrega uma fonte canonica reutilizavel para proximas fases. P3 pode partir do contrato `PatientTimelineEvent` para integrar consulta como workspace sem depender de `client_timeline_events` nem de audit log.

PATIENT_P2_EVENT_SOURCES_MAPPED: sim
PATIENT_P2_TIMELINE_CONTRACT: PASS
PATIENT_P2_EVENT_AGGREGATOR: PASS
PATIENT_P2_CHRONOLOGICAL_ORDER: PASS
PATIENT_P2_RECENT_ACTIVITY: PASS
PATIENT_P2_FULL_TIMELINE: PASS
PATIENT_P2_FILTERS: PASS
PATIENT_P2_NO_DUPLICATE_EVENTS: PASS
PATIENT_P2_FUTURE_EVENT_ISOLATION: PASS
PATIENT_P2_SECURITY: PASS
PATIENT_P2_RESPONSIVE: PASS
PATIENT_P2_ACCESSIBILITY: PASS
PATIENT_P2_VISUAL_REVIEW_READY: sim
PATIENT_P2_P1_REGRESSION: PASS
PATIENT_P2_FULL_GATES: PASS
PATIENT_TIMELINE_READY: sim
