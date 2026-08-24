# Patient Record P4 - Anamnesis Current State Audit

Data: 2026-08-23

## Escopo

Auditoria previa da anamnese antes da reestruturacao UX P4. Nao foi criado schema novo.

## Fontes relidas

- `reports/patient-record-current-state.md`
- `reports/patient-record-target-ux.md`
- `reports/patient-record-data-contract.md`
- `reports/patient-record-p1-overview.md`
- `reports/patient-record-p2-timeline.md`
- `reports/patient-record-p3-consultation-workspace.md`

## Schema atual

Fonte canonica:

- `nutrition_records`: estado atual da anamnese, um registro por `client_id`.
- `nutrition_record_versions`: snapshots historicos imutaveis e cifrados, com `version`, `source`, `changed_by_admin_id`, `consultation_session_id` e `reason`.
- `patient_clinical_markers`: restricoes/flags estruturadas usadas por alertas e regras deterministicas.
- `form_submissions`: pre-consulta publica; a associacao segura acontece por `clients.source_submission_id`.

Campos principais da anamnese:

- objetivo/contexto: `chief_complaint`, `goals`, `target_notes`;
- perfil clinico: `biological_sex`, `life_stage`, `target_group`, `gestational_weeks`, `breastfeeding_context`, `family_context`;
- saude: `clinical_history`, `diagnoses`, `medications`, `supplements`, `allergies`, `restrictions`, `risk_flags`;
- rotina atual: `sleep_routine`, `intestinal_health`, `hydration`, `physical_activity`, `stress_context`;
- rotina alimentar: `eating_routine`, `food_preferences`, `food_aversions`;
- medidas informadas: `current_weight_kg`, `height_cm`, `target_weight_kg`, `pre_pregnancy_weight_kg`, `waist_cm`, `pre_surgery_weight_kg`, `bariatric_surgery_date`, `anthropometry_notes`, `pediatric_growth_notes`;
- conduta: `exams`, `assessment`, `care_plan`, `private_notes`.

## Perguntas configuraveis

Nao ha tabela dedicada de question definitions/questionnaire sections para a anamnese administrativa. O contrato atual e um conjunto fixo de colunas em `nutrition_records` com labels em `lib/clinical/nutrition-record-fields.ts` e regras de perfil dentro do componente antigo.

Decisao P4: criar modelo de secoes em codigo, usando apenas campos reais existentes.

## Respostas e intake

`getNutritionRecord(clientId)` cria lazy record quando nao existe. Se `clients.source_submission_id` existir, `buildInitialRecord` mapeia respostas de `form_submissions.answers` para campos da anamnese.

Origem de pre-consulta e preservada por:

- `clients.source_submission_id`;
- `nutrition_record_versions.source = system` no snapshot inicial;
- texto do proprio campo vindo da pre-consulta.

Nao existe politica atual de confirmacao campo-a-campo de AI extraction na anamnese administrativa. P4 nao alterou o intake engine.

## Versionamento

`updateNutritionRecord` e a escrita canonica:

- aplica optimistic concurrency por `expectedVersion`;
- salva snapshot em `nutrition_record_versions`;
- nao cria versao em no-op;
- aceita `consultationSessionId` no contrato de repository, mas a rota administrativa atual de anamnese nao recebe esse contexto do frontend.

## Consulta associada

O schema ja suporta `consultation_session_id` no historico, mas a UI da aba Anamnese nao opera dentro de uma consulta especifica. O P3 Consultation Workspace apenas encaminha para `?tab=anamnese`. P4 preservou esse comportamento.

## Edicao atual antes da P4

Antes da mudanca, `NutritionRecordEditor` ficava dentro de `ClientWorkspace.tsx` e renderizava:

- todos os selects de perfil;
- todos os campos de medidas;
- painel de restricoes estruturadas com formulario aberto;
- todos os textareas clinicos;
- botao unico "Salvar prontuario".

Problema: abrir a anamnese parecia um formulario extenso, nao um prontuario estruturado em leitura.

## APIs

- `GET /api/admin/clients/[id]/nutrition-record`: valida sessao, valida paciente e retorna/cria record.
- `PATCH /api/admin/clients/[id]/nutrition-record`: schema strict, valida paciente, usa `expectedVersion`, escreve versao e timeline event.
- `GET /nutrition-record/versions`: lista metadados de historico.
- `GET /nutrition-record/versions/[version]`: carrega snapshot somente leitura.
- `GET/POST/PATCH /structured-restrictions`: valida paciente e marcador por `clientId`.

## Duplicacoes

- Labels da anamnese estavam divididos entre `nutrition-record-fields.ts` e constantes locais no `ClientWorkspace.tsx`.
- Historico exibia keys tecnicas do snapshot.
- Restricoes estruturadas eram leitura e escrita no mesmo bloco, com formulario sempre visivel.

## Dados estruturados vs texto livre

Texto livre permanece em `nutrition_records`.

Dados deterministicas de alergias/intolerancias/restricoes ficam em `patient_clinical_markers` e nao podem ser substituidos por texto solto.

## Decisao

Executar P4 como UX + contrato de secao:

- read mode por padrao;
- edicao por secao;
- salvar apenas campos da secao;
- manter `nutrition_records`, `nutrition_record_versions` e `patient_clinical_markers`;
- sem migration.

PATIENT_P4_CURRENT_ANAMNESIS_AUDITED: sim
