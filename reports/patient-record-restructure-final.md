# Patient Record UX Restructure - Phase 0 Handoff

Data: 2026-08-23

Esta entrega conclui a fase solicitada de auditoria e desenho-alvo. Nenhum redesign foi implementado ainda, por regra explicita do pedido: primeiro mapear arquitetura, dados, duplicacoes, UX alvo e fases P1-P7.

## Entregues

- `reports/patient-record-current-state.md`
- `reports/patient-record-target-ux.md`
- `reports/patient-record-data-contract.md`
- `reports/patient-record-restructure-final.md`

## Decisoes principais

1. Reaproveitar `lib/clinical/client-snapshot.ts` como base do futuro resumo, expandindo para um `PatientRecordSummaryViewModel`.
2. Consolidar o `components/consultation/ConsultationWorkspace.tsx` existente como workspace principal de consulta.
3. Nao redesenhar o Meal Plan nesta frente; apenas integrar ativo/draft/publicacao no resumo.
4. Manter `nutrition_records` e `nutrition_record_versions` como contrato canonico da anamnese.
5. Transformar timeline em adapter clinico, sem misturar audit log tecnico.
6. Nao criar schema novo em P1/P2; migrations ficam condicionadas a necessidades estruturais reais.

## Principais achados

- O prontuario atual funciona, mas `ClientWorkspace.tsx` virou um agregador grande demais e concentra responsabilidades de UI, dados e logica clinica.
- O sistema ja tem bons blocos para a reestruturação: snapshot leve, workspace de consulta, anamnese versionada, evolucoes cifradas, meal plan estabilizado, timeline explicita e IA por proposta.
- A UX atual nao da prioridade suficiente ao estado atual do paciente. O usuario precisa navegar por tabs/subviews para entender plano ativo, antropometria recente, ultima/proxima consulta e pendencias.
- Financeiro, agenda, portal, relatorios e tarefas aparecem dentro de areas clinicas e devem ser reposicionados para reduzir ruído.
- Documentos e exames ainda nao sao entidades estruturadas. Exames sao texto livre; documentos reais sao paginas de print/pre-consulta.

## Proxima execucao recomendada

P1 - Patient shell + summary

- Criar `PatientRecordSummaryViewModel`.
- Criar endpoint/repository de resumo agregado.
- Refatorar a primeira tela do paciente para header compacto, cards de estado atual, alertas e quick actions.
- Manter tabs e rotas existentes para compatibilidade.
- Nao tocar no `MealPlanEditor`.

Gates de P1:

- `npm run lint`
- `npx tsc --noEmit`
- testes focados de repository/API do summary
- E2E golden overview inicial

## Flags finais desta fase

PATIENT_RECORD_AUDIT_COMPLETE: sim

PATIENT_OVERVIEW_READY: nao

PATIENT_TIMELINE_READY: nao

CONSULTATION_WORKSPACE_READY: parcial

ANAMNESIS_UX_READY: nao

ANTHROPOMETRY_INTEGRATION_READY: parcial

MEAL_PLAN_INTEGRATION_READY: parcial

PATIENT_RECORD_SECURITY: parcial

PATIENT_RECORD_RESPONSIVE: nao validado nesta fase

PATIENT_RECORD_ACCESSIBILITY: nao validado nesta fase

PATIENT_RECORD_VISUAL_REVIEW_READY: nao

PATIENT_RECORD_FULL_GATES: nao rodado

PATIENT_RECORD_RESTRUCTURE_READY: nao

## Observacao sobre git/worktree

Antes desta fase ja havia screenshots de Meal Plan modificados/nao rastreados no worktree. Eles nao fazem parte desta auditoria e devem continuar separados de qualquer commit de Patient Record, salvo decisao explicita.
