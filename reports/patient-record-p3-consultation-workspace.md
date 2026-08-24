# Patient Record P3 - Consultation Workspace

Data: 2026-08-23

## 1. Baseline

P3 continua a reestruturação do prontuario do paciente após P1 Overview e P2 Clinical Timeline.

Estado de entrada:

- `PATIENT_RECORD_AUDIT_COMPLETE = sim`
- `PATIENT_OVERVIEW_READY = sim`
- `PATIENT_TIMELINE_READY = sim`

Arquivos relidos:

- `reports/patient-record-current-state.md`
- `reports/patient-record-target-ux.md`
- `reports/patient-record-data-contract.md`
- `reports/patient-record-p1-overview.md`
- `reports/patient-record-p2-timeline.md`

## 2. Current Consultation Audit

Auditoria registrada em `reports/patient-record-p3-consultation-current-state.md`.

Achados principais:

- ja existia uma rota unica `/dashboard/clients/[id]/consulta`;
- ja existia `components/consultation/ConsultationWorkspace.tsx`;
- `consultation_sessions` ja tinha ownership por `client_id` e status reais `in_progress`, `completed`, `cancelled`;
- o workspace antigo funcionava como dashboard por abas, com `MealPlanEditor` embutido;
- PATCH/finalize/brief/cancel partiam de `sessionId` isolado;
- notas usavam autosave, mas P3 exigia salvar explicito e guard de navegacao.

PATIENT_P3_CURRENT_MODE_AUDITED: sim

## 3. Consolidation Strategy

O Modo Consulta existente foi consolidado no mesmo componente e mesma rota. Nao foram criados `ConsultationV2`, rota paralela ou segundo modo de atendimento.

PATIENT_P3_SINGLE_WORKSPACE: PASS

## 4. Routing

Rota preservada:

- `/dashboard/clients/[id]/consulta`

Deep link suportado:

- `/dashboard/clients/[id]/consulta?sessionId=<consultationId>`

O endpoint `GET /api/admin/clients/[id]/consultation` aceita `sessionId` opcional e retorna o workspace somente se a sessao pertencer ao paciente da URL.

## 5. Workspace ViewModel

Criado `PatientConsultationWorkspaceViewModel` em `lib/repositories/patient-consultation-workspace.ts`.

Contrato inclui:

- paciente;
- consulta atual;
- consulta anterior;
- antropometria atual/anterior;
- delta de peso;
- plano ativo;
- rascunho de plano;
- restricoes importantes;
- pre-consulta vinculada por `source_submission_id`;
- protocolos ativos;
- contexto de agenda.

PATIENT_P3_WORKSPACE_VIEWMODEL: PASS

## 6. Patient Context

A coluna de contexto mostra somente informacoes uteis para conduzir atendimento:

- objetivo principal;
- peso atual e delta;
- ultima consulta;
- plano ativo/draft;
- restricoes importantes;
- pre-consulta respondida ou pendente;
- protocolos ativos;
- acao de agendar retorno.

PATIENT_P3_PATIENT_CONTEXT: PASS

## 7. Consultation Form

O formulário principal virou o centro do workspace, com seções editáveis:

- Evolução desde a última consulta
- Adesão
- Sintomas e queixas
- Conduta
- Metas
- Observações livres

Sem migration: as seções ficam em `consultation_sessions.summary_json.workspaceDraft`. O campo `notes` continua recebendo as observações livres para compatibilidade com a infraestrutura existente.

PATIENT_P3_CONSULTATION_EDITING: PASS

## 8. Save State

Autosave do componente antigo foi substituido por salvar explicito:

- Alterações não salvas
- Salvando
- Salvo
- Não foi possível salvar

Também foi adicionado guard de navegação por `beforeunload` e confirmação nos atalhos internos.

PATIENT_P3_SAVE_RELOAD: PASS
PATIENT_P3_UNSAVED_PROTECTION: PASS

## 9. Finalization

Fluxo:

Salvar se houver alteração
→ abrir revisão básica
→ confirmar finalização
→ persistir `status = completed` e `ended_at`

O botão fica desabilitado durante request pelo dialogo. Consulta concluida/cancelada volta em read-only e nao permite finalizar novamente.

PATIENT_P3_FINALIZATION: PASS

## 10. Pre-Consultation Integration

Quando `clients.source_submission_id` aponta para `form_submissions`, o workspace mostra:

- data da pre-consulta;
- objetivo;
- tipo de atendimento/motivacao quando presente;
- link para abrir respostas.

Sem vínculo confiável, mostra "Pré-consulta não respondida".

PATIENT_P3_PRECONSULTATION_INTEGRATION: PASS

## 11. Anthropometry Integration

O workspace mostra peso atual/delta via repository e oferece ação para abrir a antropometria existente. Não houve redesign da antropometria.

PATIENT_P3_ANTHROPOMETRY_INTEGRATION: PASS

## 12. Meal Plan Integration

O workspace mostra plano ativo e rascunho, com ação para abrir o módulo real. O `MealPlanEditor` deixou de ser renderizado dentro da consulta.

PATIENT_P3_MEAL_PLAN_INTEGRATION: PASS

## 13. Timeline/Overview Synchronization

Ao finalizar consulta, `consultation_sessions` passa para `completed`. P1 Overview e P2 Timeline atualizam porque ambos derivam de `consultation_sessions`, sem evento manual adicional na UI.

PATIENT_P3_OVERVIEW_SYNC: PASS
PATIENT_P3_TIMELINE_SYNC: PASS

## 14. Ownership/Security

Reforços:

- workspace carrega por `patientId` + `consultationId`;
- GET com `sessionId` de outro paciente retorna 404;
- PATCH exige `clientId` e compara com `session.client_id`;
- complete/cancel/brief exigem `clientId` e comparam ownership;
- paciente arquivado nao inicia nova consulta.

PATIENT_P3_SECURITY: PASS

## 15. Responsive

Desktop usa duas colunas: contexto compacto + formulário principal. Mobile fica em coluna unica; tablet mantém contexto/formulario legíveis.

PATIENT_P3_RESPONSIVE: PASS

## 16. Accessibility

Implementado:

- breadcrumb com `aria-label`;
- `aside` de contexto nomeado;
- labels reais nos textareas;
- estados de salvamento com `aria-live`;
- dialog de finalização com texto visível;
- botões desabilitados em estados read-only/saving.

PATIENT_P3_ACCESSIBILITY: PASS

## 17. Performance

O ViewModel usa `d1Batch` e carrega somente contexto necessario:

- nao carrega timeline inteira;
- nao carrega historico completo de planos;
- nao renderiza editor de plano;
- nao carrega documentos/exames completos fora do necessário.

## 18. Tests

Unit:

- `npx vitest run tests/patient-record-consultation-workspace.test.ts tests/patient-record-summary.test.ts tests/patient-record-timeline.test.ts`
- Resultado: 18 passed.

Rotas:

- `npx vitest run tests/consultation-session-routes.test.ts`
- Resultado: 12 passed.

Full unit suite:

- `npm test`
- Resultado: 207 files, 1804 tests passed.

Full gates:

- `npm run ci:artifact-check`: PASS
- `npm run migrate:d1:check`: PASS
- `npm run schema:runtime-check`: PASS
- `npm run lint`: PASS
- `npx tsc --noEmit`: PASS
- `npm test`: PASS
- `npm run build`: PASS

E2E:

- `E2E_PORT=3027 npx playwright test e2e/patient-record-p1-overview.spec.ts`: 14 passed.
- `E2E_PORT=3028 npx playwright test e2e/patient-record-p2-timeline.spec.ts`: 18 passed.
- `E2E_PORT=3029 npx playwright test e2e/patient-record-p3-consultation-workspace.spec.ts`: 22 passed.

PATIENT_P3_P1_REGRESSION: PASS
PATIENT_P3_P2_REGRESSION: PASS

## 19. Screenshots

Geradas em `reports/screenshots/patient-record/`:

- `P3-01-workspace-desktop-complete-*.png`
- `P3-02-consultation-editing-*.png`
- `P3-03-patient-context-*.png`
- `P3-04-pre-consultation-summary-*.png`
- `P3-05-no-anthropometry-*.png`
- `P3-06-no-meal-plan-*.png`
- `P3-07-completed-consultation-read-only-*.png`
- `P3-08-mobile-390-*.png`
- `P3-09-tablet-*.png`
- `P3-10-error-unsaved-state-*.png`

PATIENT_P3_VISUAL_REVIEW_READY: sim

## 20. Visual Review

Resultado:

- workspace agora parece uma tela de consulta, nao um dashboard por abas;
- contexto lateral ficou compacto;
- formulário clínico domina a area principal;
- plano/anamnese/antropometria/protocolos sao acessados sem duplicar módulos;
- mobile e tablet foram validados por E2E e screenshots.

## 21. Known Limitations

- Sem schema novo: campos estruturados da consulta ficam em `summary_json.workspaceDraft`.
- Suplementos nao possuem modulo persistido separado confiavel no contrato atual; permanecem cobertos por anamnese/plano/protocolos existentes.
- Pre-consulta so aparece como respondida quando ha `clients.source_submission_id`; nao ha inferencia por email/telefone para evitar associação errada.
- IA permanece opcional via copiloto; P3 nao implementa geração automatica.

## 22. P4 Readiness

P4 pode trabalhar a UX de anamnese usando o acesso consolidado do workspace e o contrato de contexto criado em P3, sem alterar a timeline P2 ou recriar o modo consulta.

PATIENT_P3_CURRENT_MODE_AUDITED: sim
PATIENT_P3_SINGLE_WORKSPACE: PASS
PATIENT_P3_WORKSPACE_VIEWMODEL: PASS
PATIENT_P3_PATIENT_CONTEXT: PASS
PATIENT_P3_CONSULTATION_EDITING: PASS
PATIENT_P3_SAVE_RELOAD: PASS
PATIENT_P3_UNSAVED_PROTECTION: PASS
PATIENT_P3_FINALIZATION: PASS
PATIENT_P3_PRECONSULTATION_INTEGRATION: PASS
PATIENT_P3_ANTHROPOMETRY_INTEGRATION: PASS
PATIENT_P3_MEAL_PLAN_INTEGRATION: PASS
PATIENT_P3_OVERVIEW_SYNC: PASS
PATIENT_P3_TIMELINE_SYNC: PASS
PATIENT_P3_SECURITY: PASS
PATIENT_P3_RESPONSIVE: PASS
PATIENT_P3_ACCESSIBILITY: PASS
PATIENT_P3_VISUAL_REVIEW_READY: sim
PATIENT_P3_P1_REGRESSION: PASS
PATIENT_P3_P2_REGRESSION: PASS
PATIENT_P3_FULL_GATES: PASS
CONSULTATION_WORKSPACE_READY: sim

Estado global:

PATIENT_RECORD_AUDIT_COMPLETE: sim
PATIENT_OVERVIEW_READY: sim
PATIENT_TIMELINE_READY: sim
CONSULTATION_WORKSPACE_READY: sim
ANAMNESIS_UX_READY: nao
ANTHROPOMETRY_INTEGRATION_READY: parcial
MEAL_PLAN_INTEGRATION_READY: parcial
PATIENT_RECORD_RESTRUCTURE_READY: nao
