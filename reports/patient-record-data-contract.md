# Patient Record UX Restructure - Data Contract

Data: 2026-08-23

Objetivo: definir contratos de dados para a reestruturação sem criar schema novo antes de necessidade comprovada.

## Fontes canonicas atuais

| Dominio | Fonte canonica | Observacao |
|---|---|---|
| Identidade do paciente | `clients` / `lib/repositories/clients.ts` | nome, contato, nascimento, status, notas administrativas |
| Resumo inicial | `lib/clinical/client-snapshot.ts` | agregado leve via `d1Batch`; bom ponto de partida |
| Anamnese | `nutrition_records` / `lib/repositories/nutrition-records.ts` | campos cifrados, 1 registro por cliente |
| Historico da anamnese | `nutrition_record_versions` | snapshots cifrados, versionamento canonico |
| Restricoes estruturadas | `patient_clinical_markers` | usado por plano alimentar/substituicoes e deve alimentar alertas |
| Antropometria/evolucao | `client_evolutions` | payload cifrado; mistura medidas e notas longitudinais |
| Consulta | `consultation_sessions` | sessoes, notas, brief, summary, status |
| Timeline explicita | `client_timeline_events` | eventos inseridos por endpoints |
| Plano alimentar | `meal_plans`, `meal_plan_versions`, `meal-plan-view-model` | contrato R1-R7 deve ser preservado |
| Protocolos/tarefas | `client_protocols`, `protocols`, `client_tasks` | acompanhamento e pendencias |
| Agenda | `appointments` | proxima/ultima consulta podem vir daqui e de sessoes |
| Financeiro | `payments` | dado administrativo secundario |
| Portal | `client_portal_access`, portal APIs | acesso do paciente e plano ativo publicado |
| Documentos | paginas de print/pre-consulta; sem tabela dedicada | nao ha modulo persistido de documentos |
| Exames | `nutrition_records.exams` | texto livre, sem entidade propria |

## ViewModel alvo - PatientRecordSummaryViewModel

```ts
export interface PatientRecordSummaryViewModel {
  patient: {
    id: string;
    name: string;
    ageYears: number | null;
    status: "ativo" | "inativo" | "arquivado" | string;
    primaryGoal: string | null;
  };
  header: {
    objectiveLabel: string | null;
    lastConsultationDate: string | null;
    nextAppointmentDate: string | null;
    quickActions: PatientRecordQuickAction[];
  };
  latestAnthropometry: {
    measuredAt: string | null;
    weightKg: number | null;
    bmi: number | null;
    waistCm: number | null;
    bodyFatPercentage: number | null;
    weightDeltaKgFromPrevious: number | null;
  } | null;
  bodyTrend: Array<{
    measuredAt: string;
    weightKg: number | null;
    waistCm: number | null;
    bodyFatPercentage: number | null;
    leanMassKg: number | null;
  }>;
  activeMealPlan: {
    id: string;
    title: string;
    status: "active";
    version: number;
    lastPublishedAt: string | null;
  } | null;
  draftMealPlan: {
    id: string;
    title: string;
    version: number;
    updatedAt: string | null;
  } | null;
  activeProtocols: Array<{
    id: string;
    title: string | null;
    status: string;
    startedAt: string;
  }>;
  keyRestrictions: Array<{
    id: string;
    type: "ALLERGY" | "INTOLERANCE" | "DIETARY_RESTRICTION" | "FOOD_AVOIDANCE" | "CLINICAL_FLAG" | string;
    label: string;
    severity: string | null;
    source: string;
  }>;
  lastConsultation: {
    id: string;
    date: string;
    type: string | null;
    status: string;
    summary: string | null;
    href: string;
  } | null;
  nextAppointment: {
    id: string;
    title: string;
    startsAt: string;
    status: string;
    href: string;
  } | null;
  recentTimeline: PatientRecordTimelineEvent[];
  pendingActions: PatientRecordPendingAction[];
  portal: {
    accessExists: boolean;
    isActive: boolean;
    lastUsedAt: string | null;
  };
}
```

## ViewModel alvo - Timeline

```ts
export type PatientRecordTimelineEventType =
  | "CONSULTATION_STARTED"
  | "CONSULTATION_COMPLETED"
  | "ANTHROPOMETRY_RECORDED"
  | "MEAL_PLAN_PUBLISHED"
  | "MEAL_PLAN_UPDATED"
  | "NUTRITION_RECORD_UPDATED"
  | "PROTOCOL_STARTED"
  | "PROTOCOL_COMPLETED"
  | "APPOINTMENT_CREATED"
  | "DOCUMENT_AVAILABLE";

export interface PatientRecordTimelineEvent {
  id: string;
  type: PatientRecordTimelineEventType;
  date: string;
  title: string;
  summary: string | null;
  href: string | null;
  source: {
    table: string;
    id: string;
  };
}
```

Regras:

- Ordenacao: `date DESC`, desempate por `created_at DESC` quando existir.
- Limite no overview: 6 a 10 eventos.
- Tela completa: paginada.
- Nunca expor `metadata_json` cru na UI.
- Eventos de audit log tecnico ficam fora deste contrato.

## ViewModel alvo - ConsultationWorkspaceContext

```ts
export interface ConsultationWorkspaceContext {
  patient: {
    id: string;
    name: string;
    ageYears: number | null;
    status: string;
  };
  session: {
    id: string;
    status: "in_progress" | "completed" | "cancelled";
    startedAt: string;
    endedAt: string | null;
    hasUnsavedChanges: boolean;
  };
  context: {
    objective: string | null;
    currentWeightKg: number | null;
    lastConsultationDate: string | null;
    activeMealPlanTitle: string | null;
    restrictions: PatientRecordSummaryViewModel["keyRestrictions"];
    pendingActions: PatientRecordPendingAction[];
  };
  currentConsultation: {
    notes: string | null;
    summary: unknown | null;
    aiBrief: unknown | null;
  };
}
```

## Pending actions

```ts
export type PatientRecordPendingActionKind =
  | "DRAFT_MEAL_PLAN"
  | "UNFINISHED_CONSULTATION"
  | "UNSCHEDULED_FOLLOW_UP"
  | "PENDING_TASK"
  | "OVERDUE_PAYMENT"
  | "FOOD_CONFIRMATION";

export interface PatientRecordPendingAction {
  id: string;
  kind: PatientRecordPendingActionKind;
  title: string;
  severity: "info" | "warning" | "blocking";
  href: string | null;
  source: {
    table: string;
    id: string;
  };
}
```

Regras:

- So criar pendencia baseada em estado real.
- Draft de plano aparece como pendencia, nao como plano entregue.
- Pagamento vencido e administrativo; nao deve ocupar prioridade clinica.
- Alimento aguardando confirmacao so entra se vier do contrato do plano alimentar.

## Separacao semantica de dados

Dados de perfil clinico permanente:

- `nutrition_records`: alergias, intolerancias/restricoes, diagnosticos, medicamentos, suplementos, preferencias, aversoes, objetivos, contexto familiar.
- `patient_clinical_markers`: versao estruturada/normalizada de restricoes e flags.

Dados longitudinais:

- `client_evolutions`: peso, altura, IMC, circunferencias, dobras, gordura corporal, massa magra, sintomas, adesao, conduta e notas.
- Futuro possivel: se a ambiguidade ficar custosa, separar `anthropometry_assessments` e `clinical_progress_notes`. Nao recomendado antes de P5.

Dados da consulta:

- `consultation_sessions`: notes, ai_brief_json, summary_json, status, started_at, ended_at.
- Se uma avaliacao for registrada durante consulta, hoje nao ha `consultation_session_id` em `client_evolutions`; associacao direta exigiria migration futura.

## APIs alvo

Novos adapters recomendados, sem schema novo inicialmente:

- `GET /api/admin/clients/[id]/record-summary`
  - retorna `PatientRecordSummaryViewModel`
  - deve revalidar auth e existencia do cliente
  - deve usar queries agregadas/limitadas

- `GET /api/admin/clients/[id]/record-timeline?limit=10&cursor=...`
  - retorna `PatientRecordTimelineEvent[]`
  - deve combinar fontes reais e `client_timeline_events`
  - deve limitar payload

- `GET /api/admin/clients/[id]/consultations`
  - lista sessoes de consulta historicas
  - nao deve retornar notas completas no overview

Rotas existentes continuam:

- `/api/admin/clients/[id]`
- `/api/admin/clients/[id]/nutrition-record`
- `/api/admin/clients/[id]/evolutions`
- `/api/admin/clients/[id]/meal-plans`
- `/api/admin/clients/[id]/protocols`
- `/api/admin/clients/[id]/tasks`
- `/api/admin/clients/[id]/timeline`
- `/api/admin/clients/[id]/consultation`
- `/api/admin/consultation-sessions/[id]`

## Seguranca/ownership

Estado atual:

- Endpoints admin validam sessao com `getAdminFromRequest`.
- Muitos endpoints validam `getClientById(id)` antes de operar.
- Modelo parece single-admin/single-tenant; `clients` nao tem `owner_admin_id`.

Contrato alvo:

- Todo endpoint `clients/[id]/*` deve validar existencia do paciente antes de retornar dados.
- Todo endpoint por entidade filha deve validar que a entidade pertence ao `clientId` quando o route param contiver ambos.
- Se o produto virar multi-admin/tenant, adicionar ownership real em `clients` e queries por `admin_id`/tenant antes de declarar `PATIENT_RECORD_SECURITY: PASS`.

## Performance

Resumo:

- Uma chamada agregada.
- Limitar timeline, protocolos, tarefas e trend.
- Nao carregar plano alimentar completo, historico completo, documentos completos, financeiro completo nem todas as consultas.

Lazy:

- Anamnese completa: ao abrir tab.
- Antropometria completa/graficos: ao abrir tab.
- Plano alimentar completo: ao abrir tab ou clicar "Abrir plano".
- Financeiro/documentos/portal: "Mais".

Cache:

- Usar `cache: "no-store"` para dados clinicos sensiveis e evitar stale entre pacientes.
- Nao compartilhar estado global `currentPatient` entre modulos.

## Sem migrations nesta fase

Nao ha necessidade estrutural comprovada de migration para P1/P2. Possiveis migrations futuras somente se:

- for necessario associar `client_evolutions` a `consultation_session_id`;
- documentos/exames virarem entidade real;
- ownership multi-admin precisar ser modelado;
- timeline precisar de eventos derivados persistidos em vez de adapter runtime.
