# Patient Record P4 - Anamnesis UX Restructure

Data: 2026-08-23

## 1. Baseline

Estado de entrada:

- `PATIENT_RECORD_AUDIT_COMPLETE = sim`
- `PATIENT_OVERVIEW_READY = sim`
- `PATIENT_TIMELINE_READY = sim`
- `CONSULTATION_WORKSPACE_READY = sim`
- `ANAMNESIS_UX_READY = nao`

P4 executou somente a reestruturacao UX da Anamnese. Nao iniciou P5, P6 ou P7.

## 2. Current Model Audit

Auditoria registrada em `reports/patient-record-p4-anamnesis-current-state.md`.

Achados principais:

- `nutrition_records` e a fonte canonica da anamnese atual;
- `nutrition_record_versions` ja fornece historico imutavel;
- `patient_clinical_markers` ja fornece restricoes estruturadas para regras e alertas;
- pre-consulta entra por `clients.source_submission_id` e mapeamento lazy em `getNutritionRecord`;
- nao existe tabela dinamica de question definitions para a anamnese administrativa.

PATIENT_P4_CURRENT_ANAMNESIS_AUDITED: sim

## 3. Data Contract

Criado `lib/clinical/patient-anamnesis.ts` como contrato de secoes da anamnese sobre campos reais existentes.

O contrato define:

- secoes clinicas;
- campos visiveis por secao;
- labels naturais;
- tipos de input;
- condicoes;
- formatacao de leitura;
- sanitizacao de patch por secao.

Nao houve migration.

## 4. Section Model

Secoes implementadas:

- Objetivo e contexto
- Perfil clinico
- Historico de saude
- Sono, intestino e rotina
- Rotina alimentar
- Medidas informadas na anamnese
- Exames, avaliacao e conduta

O modelo nao inventa perguntas fora do schema atual.

PATIENT_P4_SECTION_MODEL: PASS

## 5. Read UX

A aba Anamnese agora abre em modo leitura:

- cards compactos por secao;
- resumo de informacoes-chave no topo;
- campos vazios exibem `Nao informado` ou secao `Nao preenchido`;
- nenhum textarea de anamnese aparece antes de clicar em editar/preencher;
- o painel de restricoes estruturadas tambem inicia em leitura.

PATIENT_P4_READ_MODE: PASS

## 6. Edit UX

Cada card oferece `Editar secao` ou `Preencher`.

Ao editar:

- apenas a secao escolhida vira formulario;
- labels reais sao usados;
- `fieldset`/`legend` protegem semantica;
- `Cancelar` descarta o draft local;
- `Salvar secao` envia somente campos da secao e `expectedVersion`.

PATIENT_P4_SECTION_EDITING: PASS
PATIENT_P4_SAVE_RELOAD: PASS
PATIENT_P4_CANCEL_SAFETY: PASS

## 7. Conditional Questions

Condicoes preservadas:

- paciente com `biological_sex = Masculino` nao oferece fases de gestacao/pos-parto/lactacao;
- `gestational_weeks` aparece apenas para `life_stage = Gestacao`, salvo se ja houver valor historico;
- campos bariatricos aparecem para `target_group = BARIATRICO`, salvo se ja houver valor historico;
- dados persistidos continuam visiveis mesmo quando a condicao atual nao os reabriria.

PATIENT_P4_CONDITIONAL_QUESTIONS: PASS

## 8. Pre-Consultation Integration

Quando o cliente nasce de `form_submissions`, a primeira leitura da anamnese continua aproveitando as respostas mapeadas pelo repository existente.

P4 nao duplicou resposta nem reescreveu o intake engine.

PATIENT_P4_PRECONSULTATION_INTEGRATION: PASS

## 9. Historical Semantics

Historico existente preservado:

- lista de versoes via `nutrition_record_versions`;
- snapshots read-only;
- labels clinicos no modal de historico em vez de keys tecnicas;
- salvamento por secao continua gerando versao canonica.

P4 nao adiciona evento de timeline para cada campo alem do evento ja existente da rota.

PATIENT_P4_HISTORY_SEMANTICS: PASS

## 10. Structured Restrictions

Restricoes estruturadas continuam em `patient_clinical_markers`.

Mudancas:

- painel abre em leitura;
- formulario de marcador so aparece ao clicar em `Adicionar marcador`;
- criacao/resolucao chama callback para recarregar o resumo do prontuario;
- Overview continua recebendo restricoes estruturadas.

PATIENT_P4_RESTRICTION_PROPAGATION: PASS

## 11. Consultation Integration

O workspace P3 continua apontando para `/dashboard/clients/[id]?tab=anamnese`.

P4 preserva:

- `patientId`;
- record versionado;
- consulta concluida sem sobrescrever historico da anamnese.

Limite: a rota da aba Anamnese ainda nao passa `consultationSessionId` para o PATCH; o repository suporta esse campo, mas a UI fora do workspace opera como atualizacao manual do prontuario.

## 12. Security

Mantido:

- GET/PATCH da anamnese valida sessao e existencia do paciente;
- schema de PATCH e `.strict()`, bloqueando mass assignment;
- marker update valida `clientId + restrictionId`;
- escrita de secao limita payload aos campos da secao no frontend;
- snapshots clinicos seguem cifrados.

PATIENT_P4_SECURITY: PASS

## 13. Responsive

Desktop:

- navegacao lateral/secundaria de secoes;
- conteudo principal em cards compactos.

Mobile:

- uma coluna;
- inputs full-width no editor de secao;
- cards e historico legiveis em 390 px.

PATIENT_P4_RESPONSIVE: PASS

## 14. Accessibility

Implementado:

- headings por secao;
- `nav aria-label` para secoes;
- labels reais;
- `fieldset` e `legend` no editor de secao;
- erros com `role=alert`;
- estados de salvamento em texto visivel;
- controles do painel de restricoes com labels.

PATIENT_P4_ACCESSIBILITY: PASS

## 15. Tests

Unit:

- `tests/patient-record-anamnesis.test.ts`
- Cobertura: section grouping, latest answers, formatting, empty, conditional fields, save patch sanitization, cancel semantics, structured restrictions.

E2E:

- `e2e/patient-record-p4-anamnesis.spec.ts`
- Resultado P4: 26 passed.

Full gates e regressions registrados apos execucao final.

## 16. Screenshots

Geradas em `reports/screenshots/patient-record/`:

- `P4-01-anamnesis-read-desktop-*.png`
- `P4-02-edit-one-section-*.png`
- `P4-03-health-section-*.png`
- `P4-04-sleep-section-*.png`
- `P4-05-restrictions-*.png`
- `P4-06-empty-anamnesis-*.png`
- `P4-07-pre-consultation-origin-*.png`
- `P4-08-mobile-read-*.png`
- `P4-09-mobile-edit-*.png`
- `P4-10-validation-error-*.png`

PATIENT_P4_VISUAL_REVIEW_READY: sim

## 17. Visual Review

Resultado:

- a anamnese agora parece prontuario estruturado, nao questionario online;
- informacoes importantes aparecem rapido;
- campos nao aparecem todos simultaneamente;
- texto longo fica contido;
- mobile validado em Playwright.

## 18. Known Limitations

- Sem question definitions persistidas: secoes vivem em codigo sobre colunas reais.
- Sem historico por campo ou diff clinico por secao; historico permanece por versao.
- Sem `consultationSessionId` no PATCH da aba Anamnese fora do workspace.
- Pre-consulta nao mostra badge visual separado por campo; a origem e preservada pelo vinculo do paciente e versao inicial.
- P4 nao reestruturou antropometria completa, plano alimentar ou intake inteligente.

## 19. P5 Readiness

P5 pode focar antropometria sem depender de mudanca de schema da anamnese. A secao "Medidas informadas na anamnese" esta explicitamente limitada a dados de contexto e nao substitui a futura UX de avaliacao antropometrica.

PATIENT_P4_P1_REGRESSION: PASS
PATIENT_P4_P2_REGRESSION: PASS
PATIENT_P4_P3_REGRESSION: PASS
PATIENT_P4_FULL_GATES: PASS

PATIENT_P4_CURRENT_ANAMNESIS_AUDITED: sim
PATIENT_P4_SECTION_MODEL: PASS
PATIENT_P4_READ_MODE: PASS
PATIENT_P4_SECTION_EDITING: PASS
PATIENT_P4_SAVE_RELOAD: PASS
PATIENT_P4_CANCEL_SAFETY: PASS
PATIENT_P4_CONDITIONAL_QUESTIONS: PASS
PATIENT_P4_PRECONSULTATION_INTEGRATION: PASS
PATIENT_P4_RESTRICTION_PROPAGATION: PASS
PATIENT_P4_HISTORY_SEMANTICS: PASS
PATIENT_P4_SECURITY: PASS
PATIENT_P4_RESPONSIVE: PASS
PATIENT_P4_ACCESSIBILITY: PASS
PATIENT_P4_VISUAL_REVIEW_READY: sim
PATIENT_P4_P1_REGRESSION: PASS
PATIENT_P4_P2_REGRESSION: PASS
PATIENT_P4_P3_REGRESSION: PASS
PATIENT_P4_FULL_GATES: PASS
ANAMNESIS_UX_READY: sim

Estado global esperado:

PATIENT_RECORD_AUDIT_COMPLETE: sim
PATIENT_OVERVIEW_READY: sim
PATIENT_TIMELINE_READY: sim
CONSULTATION_WORKSPACE_READY: sim
ANAMNESIS_UX_READY: sim
ANTHROPOMETRY_INTEGRATION_READY: parcial
MEAL_PLAN_INTEGRATION_READY: parcial
PATIENT_RECORD_RESTRUCTURE_READY: nao
