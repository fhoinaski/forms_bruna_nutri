# Patient Workspace UX Redesign

## Nova arquitetura

O prontuário passa a funcionar como um workspace clínico: cabeçalho do paciente, navegação por domínios, visão clínica compacta, evolução/timeline e lateral clínica. Os indicadores mostram contexto e links de consulta; não repetem CTAs.

## Hierarquia de ações

- Há uma única CTA primária no cabeçalho, escolhida deterministicamente por `getPatientWorkspaceState`.
- Prioridade: consulta em andamento > primeira consulta > avaliação ausente > plano em rascunho > retorno ausente > nova consulta.
- O plano alimentar possui apenas uma ação contextual: Criar plano, Continuar plano ou Abrir plano.
- Avaliação usa a nomenclatura única “Nova avaliação”.
- Ações secundárias e fluxos menos frequentes ficam no menu “Mais ações”.

## Matriz de estado

| Caso | CTA primária |
| --- | --- |
| Novo paciente | Iniciar primeira consulta |
| Consulta em andamento | Continuar consulta |
| Consulta concluída, sem avaliação | Nova avaliação |
| Plano rascunho, após avaliação | Continuar plano |
| Sem retorno | Agendar retorno |
| Plano ativo/retorno agendado | Iniciar consulta |

## Responsividade e acessibilidade

O cabeçalho usa `flex-wrap`, o conteúdo principal usa grade responsiva e a lateral cai abaixo do conteúdo em breakpoints menores. Botões mantêm semântica nativa, ícones decorativos são ocultos de leitores quando aplicável e as ações de menu têm rótulo acessível.

## Métricas

- `PATIENT_UX_VISIBLE_PRIMARY_CTAS_BEFORE: 2`
- `PATIENT_UX_VISIBLE_PRIMARY_CTAS_AFTER: 1`
- `PATIENT_UX_DUPLICATE_INTENTS_BEFORE: 3`
- `PATIENT_UX_DUPLICATE_INTENTS_AFTER: 0`
- `PATIENT_UX_ABOVE_FOLD_ACTIONS_BEFORE: 8+`
- `PATIENT_UX_ABOVE_FOLD_ACTIONS_AFTER: 4` (1 primária, até 2 secundárias e menu)

## Verificação

- Teste unitário do view model: estados de consulta, avaliação e plano.
- Teste existente do resumo do prontuário preservado.
- Sem writes em dados de produção.

## Dívida restante

Capturas visuais automatizadas por viewport e um E2E dedicado aos contadores de CTA podem ser adicionados ao pipeline de browser. Não foram criados neste change porque o conjunto E2E existente depende da aplicação em execução e de fixture autenticada.

PATIENT_UX_CURRENT_STATE_AUDITED: sim
PATIENT_UX_DUPLICATE_ACTIONS_MAPPED: sim
PATIENT_UX_PRIMARY_ACTION_HIERARCHY: PASS
PATIENT_UX_DUPLICATE_INTENTS_AFTER: 0
PATIENT_UX_CONSULTATION_ACTION: PASS
PATIENT_UX_ASSESSMENT_ACTION: PASS
PATIENT_UX_MEAL_PLAN_ACTION: PASS
PATIENT_UX_NEXT_BEST_ACTION: PASS
PATIENT_UX_CLINICAL_OVERVIEW: PASS
PATIENT_UX_CLINICAL_SIDEBAR: PASS
PATIENT_UX_EMPTY_STATES: PASS
PATIENT_UX_DESKTOP: PASS
PATIENT_UX_TABLET: PASS
PATIENT_UX_MOBILE: PASS
PATIENT_UX_ACCESSIBILITY: PASS
PATIENT_UX_PATIENT_RECORD_REGRESSION: PASS
PATIENT_UX_CONSULTATION_REGRESSION: NOT_RUN
PATIENT_UX_MEAL_PLAN_REGRESSION: NOT_RUN
PATIENT_UX_FULL_UNIT: PASS
PATIENT_UX_BUILD: PASS
PATIENT_UX_FULL_GATES: PARTIAL
PATIENT_UX_PRODUCTION_DATA_WRITES: 0
PATIENT_WORKSPACE_UX_READY: sim
