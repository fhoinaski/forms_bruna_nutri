# Patient Record P3 - Consultation Current State Audit

Data: 2026-08-23

## Scope

Auditoria especifica do Modo Consulta existente antes da implementacao P3. Referencias relidas:

- `reports/patient-record-current-state.md`
- `reports/patient-record-target-ux.md`
- `reports/patient-record-data-contract.md`
- `reports/patient-record-p1-overview.md`
- `reports/patient-record-p2-timeline.md`

## Current Routes

| Area | Path | Current Role | Finding |
|---|---|---|---|
| Consultation page | `app/dashboard/clients/[id]/consulta/page.tsx` | Thin client wrapper for `ConsultationWorkspace` | Rota unica ja existe e deve ser consolidada. |
| Start/get active session | `app/api/admin/clients/[id]/consultation/route.ts` | GET active session, POST start/reopen | POST reabre sessao ativa por paciente, mas GET ainda retorna apenas sessao e nao workspace clinico. |
| Session read/update | `app/api/admin/consultation-sessions/[id]/route.ts` | GET by session id, PATCH notes | Falta ownership paciente/consulta na URL ou query; PATCH valida status mas nao paciente. |
| Brief | `app/api/admin/consultation-sessions/[id]/brief/route.ts` | Generate deterministic + AI brief | Valida status, mas parte de `sessionId` isolado. |
| Complete | `app/api/admin/consultation-sessions/[id]/complete/route.ts` | Complete session | Finaliza por `sessionId`; registra timeline explicita legada, mas P2 usa agregador canonico. |
| Cancel | `app/api/admin/consultation-sessions/[id]/cancel/route.ts` | Cancel session | Mesmo gap de ownership explicito. |

## Current Components

| Component | Current Role | Finding |
|---|---|---|
| `components/consultation/ConsultationWorkspace.tsx` | Orquestra header, tabs, copiloto e modulos | Ja e o workspace unico, mas opera como dashboard por abas e carrega contexto por varias APIs client-side. |
| `ConsultationHeader` | Header do paciente + alertas | Bom reaproveitamento, mas mostra apenas consulta em andamento; nao cobre consulta concluida/read-only. |
| `ConsultationNotes` | Textarea livre com autosave debounce | Autosave existe, mas P3 pede salvar explicito e protecao contra perda. |
| `ConsultationBrief` | Brief deterministic + IA opcional | Util, mas nao pode substituir contexto deterministico fixo. |
| `ConsultationRecordSummary` | Resumo de campos da anamnese | Deve virar resumo/acesso, sem redesign da anamnese. |
| `ConsultationAnthropometry` | Embute formulario de antropometria | Reutiliza fluxo atual; P3 deve apenas expor acao/resumo e atualizar contexto depois. |
| `ConsultationMealPlan` | Embute `MealPlanEditor` | Fora do alvo P3: workspace deve abrir plano, nao renderizar editor inteiro. |
| `ConsultationProtocol` | Le protocolo ativo | Pode virar resumo/acesso compacto. |
| `ConsultationCopilot` | IA opcional e propostas | Infra existente; P3 nao deve criar nova geracao automatica. |

## Data Model

Tabela real: `consultation_sessions`.

Campos:

- `id`
- `client_id`
- `appointment_id`
- `admin_id`
- `status`: `in_progress`, `completed`, `cancelled`
- `started_at`
- `ended_at`
- `notes`
- `ai_brief_json`
- `summary_json`
- `created_at`
- `updated_at`

Indice parcial garante uma unica consulta `in_progress` por paciente: `consultation_sessions_one_active_idx`.

## Functional Gaps

- Falta ViewModel unico de workspace com `patientId` + `consultationId` e ownership server-side.
- Consulta aberta sem `sessionId` no link profundo; a tela resolve a sessao no client.
- GET/PATCH/finalize por `sessionId` isolado nao forcam a checagem de paciente na chamada.
- Autosave pode salvar, mas nao da controle explicito suficiente nem guard de navegacao.
- Consulta concluida nao tem modo read-only consolidado na tela.
- `MealPlanEditor` e renderizado dentro da consulta, criando duplicacao pesada.
- Contexto "desde a ultima consulta" existe parcialmente no brief, mas nao como contexto deterministico fixo do workspace.
- Pre-consulta nao aparece de forma confiavel no workspace.
- Finalizacao atual e direta por dialogo com checklist; nao mostra revisao basica da consulta antes de concluir.

## Keep

- Rota visual unica `/dashboard/clients/[id]/consulta`.
- Tabela `consultation_sessions`.
- Reabertura idempotente de consulta ativa por paciente.
- Status reais `in_progress`, `completed`, `cancelled`.
- Copiloto como assistente opcional.
- P2 timeline canonica por `consultation_sessions` finalizadas.

## Change

- Criar `getConsultationWorkspace(patientId, consultationId)` como contrato central.
- Carregar workspace por paciente + sessao, com `?sessionId=` quando houver deep link.
- Reforcar PATCH/finalize com `clientId`.
- Trocar autosave por salvar explicito e estado de alteracoes.
- Transformar modulos relacionados em resumo + links/acoes, sem embutir editor de plano.
- Adicionar read-only para consultas concluidas/canceladas.
