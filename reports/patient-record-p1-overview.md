# Patient Record P1 - Patient Shell + Overview

Data: 2026-08-23

## Baseline

Partimos da auditoria concluida do prontuario do paciente, com os documentos:

- `reports/patient-record-current-state.md`
- `reports/patient-record-target-ux.md`
- `reports/patient-record-data-contract.md`
- `reports/patient-record-restructure-final.md`

Escopo executado somente na rota existente `/dashboard/clients/[id]`. Nenhuma rota paralela `patient-v2` foi criada e nenhuma migration/schema foi necessaria para P1.

## Audit Findings Used

- O resumo antigo misturava cadastro, operacao e acompanhamento clinico na primeira tela.
- A tela inicial precisava funcionar como cockpit de atendimento, nao como formulario cadastral.
- Dados derivados deveriam vir de um contrato central, sem zeros falsos e sem depender de historico completo.
- Plano alimentar ativo e rascunho precisavam aparecer como estados distintos.

## Architecture

Foi criado o contrato central `PatientRecordSummaryViewModel` em `lib/repositories/patient-record-summary.ts`, consumido pelo Server Component de `/dashboard/clients/[id]` e pela rota `GET /api/admin/clients/[id]/record-summary`.

O carregamento inicial usa `Promise.all` com `loadClientSnapshot(id)` e `getPatientRecordSummary(id)`. Atualizacoes relevantes no workspace chamam `reloadPatientSummary()` para manter o resumo coerente.

## Shell

O shell do paciente agora prioriza:

- nome do paciente;
- idade derivada;
- status canonico do cadastro;
- objetivo principal vindo da anamnese;
- ultima consulta;
- proxima consulta;
- ate 3 acoes rapidas: iniciar/retomar consulta, plano alimentar, nova avaliacao.

Pacientes arquivados desabilitam acoes clinicas de iniciar consulta e nova avaliacao.

## Navigation

Navegacao principal reorganizada:

- Resumo
- Consultas
- Anamnese
- Antropometria
- Plano alimentar
- Evolucao
- Mais

Dados cadastrais, portal e administrativo foram deslocados para `Mais`, reduzindo ruido na entrada do prontuario.

## Summary ViewModel

`getPatientRecordSummary(patientId)` faz leitura agregada com `d1Batch`, evitando N+1 e sem carregar historico completo. O contrato retorna somente dados de resumo:

- paciente;
- ultima consulta concluida;
- consulta ativa;
- proxima consulta futura;
- ultimas avaliacoes antropometricas limitadas;
- plano ativo;
- rascunho de plano;
- restricoes estruturadas ativas;
- protocolos ativos;
- pendencias objetivas.

## Cards

Cards P1 implementados:

- ultima consulta;
- proxima consulta;
- peso atual + tendencia;
- plano alimentar ativo.

Estados vazios usam texto clinico util e nao renderizam `0 kg` quando nao ha antropometria.

## Active/Draft

Plano ativo e rascunho sao separados pelo status canonico em `meal_plans.status`.

- Ativo aparece como plano entregue/publicavel.
- Draft aparece como pendencia de edicao.
- O rascunho nao substitui nem mascara o plano ativo.

Limitacao P1: `meal_plans` nao possui `published_at`; o resumo usa `updated_at` como data exibida do plano ativo.

## Restrictions

As restricoes usam `patient_clinical_markers` ativos e estruturados. O resumo nao tenta inferir restricoes de texto livre, nao usa IA e nao cria alerta artificial quando nao ha dado real.

## Pending Actions

Pendencias objetivas no resumo:

- rascunho de plano alimentar;
- consulta ativa;
- tarefas pendentes;
- pagamentos pendentes.

## Security

Autenticacao server-side mantida:

- pagina `/dashboard/clients/[id]` exige sessao via `getSessionFromCookies`;
- API `record-summary` exige `getAdminFromRequest`;
- paciente inexistente retorna 404;
- teste E2E valida que a rota retorna o paciente solicitado e nao mistura dados entre IDs.

Limitacao arquitetural: o produto atual usa contexto de admin autenticado unico; nao ha matriz multi-tenant granular para testar ownership entre organizacoes distintas nesta fase.

## Responsive

O shell e o overview foram validados em desktop, tablet 768 e mobile 390. A grade do resumo colapsa em uma coluna no mobile, mantendo tabs e acoes acessiveis.

## Accessibility

Baseline acessivel validado por seletores semanticos do Playwright:

- `heading`;
- `button`;
- `tab`;
- regioes principais com texto visivel;
- SVG de tendencia com `role="img"` e `aria-label`.

Nao foi executado axe automatizado nesta fase.

## Performance

O resumo evita busca client-side inicial e evita N+1 via `d1Batch`. Consultas pesadas/historicos completos continuam carregando sob demanda nas abas especificas.

## Tests

Gates executados:

- `npm run ci:artifact-check`: PASS
- `npm run migrate:d1:check`: PASS - 67 migracoes validadas
- `npm run schema:runtime-check`: PASS
- `npm run lint`: PASS
- `npx tsc --noEmit`: PASS
- `npx vitest run tests/patient-record-summary.test.ts`: PASS - 4 tests
- `npm test`: PASS - 205 files, 1789 tests
- `npm run build`: PASS
- `E2E_PORT=3015 npx playwright test e2e/patient-record-p1-overview.spec.ts`: PASS - 14 tests

## Screenshots

Geradas em `reports/screenshots/patient-record/`:

- `P1-01-patient-overview-complete-desktop-chromium-desktop-r0.png`
- `P1-01-patient-overview-complete-desktop-mobile-chrome-r0.png`
- `P1-02-patient-overview-empty-desktop-chromium-desktop-r0.png`
- `P1-02-patient-overview-empty-desktop-mobile-chrome-r0.png`
- `P1-03-active-draft-meal-plan-chromium-desktop-r0.png`
- `P1-03-active-draft-meal-plan-mobile-chrome-r0.png`
- `P1-04-restrictions-important-info-chromium-desktop-r0.png`
- `P1-04-restrictions-important-info-mobile-chrome-r0.png`
- `P1-05-archived-patient-shell-chromium-desktop-r0.png`
- `P1-05-archived-patient-shell-mobile-chrome-r0.png`
- `P1-06-tablet-768-chromium-desktop-r0.png`
- `P1-06-tablet-768-mobile-chrome-r0.png`
- `P1-07-mobile-390-chromium-desktop-r0.png`
- `P1-07-mobile-390-mobile-chrome-r0.png`

## Limitations

- Sem novo schema nesta fase.
- Sem IA no resumo P1.
- Sem skeleton client-side para o carregamento inicial, porque o resumo e carregado no servidor antes da renderizacao.
- Sem teste cross-tenant real por ausencia de modelo multi-organizacao no escopo atual.

## P2 Readiness

P1 deixa o prontuario pronto para P2: cada aba principal tem destino claro e o resumo central ja separa estado clinico atual, pendencias, restricoes e plano ativo/rascunho por contrato.

## Markers

PATIENT_P1_SHELL_READY: sim
PATIENT_P1_NAVIGATION_READY: sim
PATIENT_P1_SUMMARY_VIEWMODEL: PASS
PATIENT_P1_LATEST_CONSULTATION: PASS
PATIENT_P1_NEXT_APPOINTMENT: PASS
PATIENT_P1_ANTHROPOMETRY_SUMMARY: PASS
PATIENT_P1_ACTIVE_DRAFT_PLAN: PASS
PATIENT_P1_RESTRICTIONS_SUMMARY: PASS
PATIENT_P1_EMPTY_STATE: PASS
PATIENT_P1_SECURITY: PASS
PATIENT_P1_RESPONSIVE: PASS
PATIENT_P1_ACCESSIBILITY: PASS
PATIENT_P1_VISUAL_REVIEW_READY: sim
PATIENT_P1_FULL_GATES: PASS
PATIENT_OVERVIEW_READY: sim
