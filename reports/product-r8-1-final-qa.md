# R8.1 — QA final

## Resultado de fechamento

- `PRODUCT_R8_1_AUDIT: PASS`
- `PRODUCT_R8_1_INFORMATION_ARCHITECTURE: PASS`
- `PRODUCT_R8_1_PATIENT_HEADER: PASS`
- `PRODUCT_R8_1_CONTEXT_NAVIGATION: PASS`
- `PRODUCT_R8_1_SUMMARY: PASS`
- `PRODUCT_R8_1_NEXT_STEP: PASS`
- `PRODUCT_R8_1_CONSULTATIONS: PASS`
- `PRODUCT_R8_1_ANAMNESIS: PASS`
- `PRODUCT_R8_1_ANTHROPOMETRY: PASS`
- `PRODUCT_R8_1_MEAL_PLAN_COMPATIBILITY: PASS`
- `PRODUCT_R8_1_EVOLUTION: PASS`
- `PRODUCT_R8_1_RECOMMENDATIONS: DEFERRED (sem domínio próprio)`
- `PRODUCT_R8_1_FILES: DEFERRED (sem storage/document domain)`
- `PRODUCT_R8_1_PORTAL_ENTRY: PASS`
- `PRODUCT_R8_1_COPILOT_ENTRY: PASS (fluxo existente preservado)`
- `PRODUCT_R8_1_GLOBAL_NAV_COMPATIBILITY: PASS`
- `PRODUCT_R8_1_ACCESSIBILITY: PASS`
- `PRODUCT_R8_1_AUTH: PASS (revisão de código)`
- `PRODUCT_R8_1_IDOR: PASS (revisão de código)`
- `PRODUCT_R8_1_N_PLUS_ONE: PASS`
- `PRODUCT_R8_1_FULL_VITEST: 41/41 (escopo Patient Workspace)`
- `PRODUCT_R8_1_BROAD_E2E_SINGLE: FAIL (regressões herdadas em Plano/Consulta e Antropometria)`
- `PRODUCT_R8_1_BROAD_E2E_PARALLEL: BLOCKED (lineage R6.5/Copilot não isolada)`
- `PRODUCT_R8_1_TYPESCRIPT: PASS`
- `PRODUCT_R8_1_LINT: PASS`
- `PRODUCT_R8_1_BUILD: PASS`
- `PRODUCT_R8_1_BUILD_ID: CqloF0owHZlURPIsVk6r7`
- `PRODUCT_R8_1_ARTIFACT: PASS`
- `PRODUCT_R8_1_RUNTIME_SCHEMA: PASS`
- `PRODUCT_R8_1_NEW_MIGRATIONS: 0`
- `PRODUCT_R8_1_PRODUCTION_WRITES: 0`

## Tabela de bloqueios

| Gate | R8.1 | Dependência | Bloqueia? | Evidência |
|---|---|---|---|---|
| Lineage release-safe | PASS no diff R8.1 | BLOCKED | Sim | migration não rastreada `20260826_0069_meal_plan_flexible_structure.sql` e stream Meal Plan/Copilot pendente |
| QA autenticado focado | PASS parcial | FAIL | Sim | shell, portal e resumo autenticados passaram; Plano/Consulta e cenários de Antropometria caíram na tela de instabilidade |
| QA visual completo / dois projetos | Não executado | BLOCKED | Sim | snapshots existentes pertencem a stream misto; é necessário worktree isolado |
| Build, lint, tipos, artifact, schema | PASS | PASS | Não | build ID acima, artifact-check e runtime schema check verdes |
| CI em SHA exato | BLOCKED | BLOCKED | Sim | R8.1 ainda não possui commit isolado |

### Falhas classificadas

- **Não é correção R8.1 autorizada:** `patient-record-p6-integrations` abre o
  Plano pela Consulta na URL correta, mas recebe a tela “Não foi possível
  carregar esta área”. O mesmo conjunto apresentou falhas em cenários de
  Antropometria. Isso cruza componentes e persistência do stream Meal
  Plan/Clinical Copilot pendente; não é seguro atribuí-lo ao shell R8.1 nem
  corrigir nesta árvore mista.
- **Correção R8.1 aplicada e verificada:** a ação de resumo de paciente
  arquivado passou a respeitar o estado arquivado, consistente com o header.

`PRODUCT_R8_1_LINEAGE_SAFE: BLOCKED`  
`PRODUCT_R8_1_LINEAGE_PENDING_MIGRATION: 20260826_0069_meal_plan_flexible_structure.sql / C — não aprovada`  
`PRODUCT_R8_1_CI_EXACT_REVISION: BLOCKED`  
`PRODUCT_R8_1_CI_PLAYWRIGHT: BLOCKED`  
`PRODUCT_R8_1_COMPLETE: nao`  
`PRODUCT_R8_2_SAFE_TO_START: nao`

## R8.1D update

Consulta → Plano e Antropometria passaram quando reproduzidos isoladamente.
Não foi encontrada regressão determinística atribuível ao shell R8.1. O
fechamento continua bloqueado exclusivamente pela lineage: a migration 0069 é
necessária ao runtime flexível atual e ainda não está aprovada na base `main`.
