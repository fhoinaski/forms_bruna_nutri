import { d1Query } from "@/lib/d1/client";
import { STUCK_EXECUTING_THRESHOLD_MS } from "@/lib/repositories/ai-action-proposals";

export const DASHBOARD_ACTION_TYPES = [
  "APPOINTMENT_SOON",
  "APPOINTMENT_NOW",
  "PATIENT_REQUEST_PENDING",
  "AI_PROPOSAL_PENDING",
  "AI_PROPOSAL_REVIEW",
  "PAYMENT_OVERDUE",
  "WORKFLOW_DUE",
  "SAFE_SUBSTITUTION_OCCURRED",
  "SUBSTITUTION_REQUIRES_REVIEW",
] as const;

export const DASHBOARD_ACTION_PRIORITIES = ["URGENT", "HIGH", "NORMAL", "INFO"] as const;
export const DASHBOARD_ACTION_SECTIONS = ["NOW", "ATTENTION", "BUSINESS", "RECENT"] as const;

export type DashboardActionType = typeof DASHBOARD_ACTION_TYPES[number];
export type DashboardActionPriority = typeof DASHBOARD_ACTION_PRIORITIES[number];
export type DashboardActionSection = typeof DASHBOARD_ACTION_SECTIONS[number];

export interface DashboardActionItem {
  id: string;
  type: DashboardActionType;
  priority: DashboardActionPriority;
  section: DashboardActionSection;
  title: string;
  subject: string | null;
  description: string;
  source: string;
  sourceId: string;
  href: string;
  actionLabel: string;
  dueAt: string | null;
  occurredAt: string | null;
  createdAt: string | null;
  briefing?: {
    appointmentId: string;
    status: "none" | "pending" | "generating" | "ready" | "stale" | "failed";
    generatedAt: string | null;
    errorCode: string | null;
  };
}

interface AppointmentActionRow {
  id: string;
  client_id: string | null;
  client_name: string | null;
  title: string;
  appointment_type: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  brief_status?: "pending" | "generating" | "ready" | "stale" | "failed" | null;
  brief_generated_at?: string | null;
  brief_error_code?: string | null;
}

interface PatientRequestActionRow {
  id: string;
  client_id: string;
  client_name: string | null;
  request_type: string;
  ai_summary: string | null;
  status?: string;
  created_at: string;
}

interface AiProposalActionRow {
  id: string;
  kind: string;
  status: string;
  risk: string;
  client_id: string | null;
  client_name: string | null;
  submission_id: string | null;
  created_at: string;
  executing_at: string | null;
}

interface PaymentActionRow {
  id: string;
  client_id: string | null;
  client_name: string | null;
  description: string;
  amount_cents: number;
  due_date: string | null;
  status: string;
  created_at: string;
}

interface WorkflowActionRow {
  id: string;
  appointment_id: string;
  step_type: string;
  due_at: string;
  appointment_title: string;
  starts_at: string;
  client_id: string | null;
  client_name: string | null;
}

interface SubstitutionActionRow {
  id: string;
  client_id: string;
  client_name: string | null;
  target_food_name: string | null;
  policy_decision: "auto_safe" | "requires_review";
  autonomy_level: string;
  created_at: string;
}

export interface DashboardActionRows {
  appointments: AppointmentActionRow[];
  patientRequests: PatientRequestActionRow[];
  aiProposals: AiProposalActionRow[];
  payments: PaymentActionRow[];
  workflows: WorkflowActionRow[];
  substitutions: SubstitutionActionRow[];
}

const PRIORITY_RANK: Record<DashboardActionPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  INFO: 3,
};

function minutesUntil(value: string, now: Date): number {
  return Math.round((new Date(value).getTime() - now.getTime()) / 60_000);
}

function money(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function requestTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    food_substitution: "substituicao alimentar",
    meal_plan_difficulty: "dificuldade com plano",
    symptom_or_complaint: "sintoma ou queixa",
    appointment_request: "pedido sobre consulta",
    task_difficulty: "dificuldade com tarefa",
    general_question: "duvida geral",
    other: "outro assunto",
  };
  return labels[value] ?? "solicitacao";
}

function proposalKindLabel(value: string): string {
  const labels: Record<string, string> = {
    new_appointment: "agendamento",
    new_task: "tarefa",
    new_recipe: "receita",
    new_protocol: "protocolo",
    new_blog_post: "conteudo",
    patient_appointment_request: "agendamento pedido pela paciente",
    patient_change_request: "pedido de alteracao da paciente",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function sortDashboardActionItems(items: DashboardActionItem[]): DashboardActionItem[] {
  return [...items].sort((a, b) => {
    const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priority !== 0) return priority;
    const aTime = new Date(a.dueAt ?? a.occurredAt ?? a.createdAt ?? 0).getTime();
    const bTime = new Date(b.dueAt ?? b.occurredAt ?? b.createdAt ?? 0).getTime();
    if (aTime !== bTime) return aTime - bTime;
    return a.id.localeCompare(b.id);
  });
}

function dedupeWorkflowRows(rows: WorkflowActionRow[]): WorkflowActionRow[] {
  const byLogicalStep = new Map<string, WorkflowActionRow>();
  for (const row of rows) {
    const key = `${row.appointment_id}:${row.step_type}`;
    const current = byLogicalStep.get(key);
    if (!current) {
      byLogicalStep.set(key, row);
      continue;
    }

    const rowDue = new Date(row.due_at).getTime();
    const currentDue = new Date(current.due_at).getTime();
    if (rowDue < currentDue || (rowDue === currentDue && row.id.localeCompare(current.id) < 0)) {
      byLogicalStep.set(key, row);
    }
  }
  return Array.from(byLogicalStep.values());
}

export function buildDashboardActionItems(rows: DashboardActionRows, now = new Date()): DashboardActionItem[] {
  const items: DashboardActionItem[] = [];

  for (const appointment of rows.appointments) {
    const startsIn = minutesUntil(appointment.starts_at, now);
    const endTime = appointment.ends_at ? new Date(appointment.ends_at).getTime() : new Date(appointment.starts_at).getTime() + 60 * 60_000;
    const isNow = new Date(appointment.starts_at).getTime() <= now.getTime() && endTime >= now.getTime();
    const isSoon = startsIn >= 0 && startsIn <= 30;
    if (!isNow && !isSoon) continue;
    const briefStatus = appointment.brief_status ?? "none";
    const briefDescription =
      briefStatus === "ready"
        ? "Briefing preparado."
        : briefStatus === "generating" || briefStatus === "pending"
          ? "Preparando briefing..."
          : briefStatus === "failed"
            ? "Não foi possível preparar briefing."
            : briefStatus === "stale"
              ? "Briefing desatualizado."
              : "Briefing ainda não preparado.";
    const actionLabel =
      briefStatus === "ready"
        ? "Abrir briefing"
        : briefStatus === "stale"
          ? "Atualizar briefing"
          : appointment.client_id ? "Abrir paciente" : "Abrir agenda";
    items.push({
      id: `${isNow ? "appointment-now" : "appointment-soon"}:${appointment.id}`,
      type: isNow ? "APPOINTMENT_NOW" : "APPOINTMENT_SOON",
      priority: isNow ? "URGENT" : "HIGH",
      section: "NOW",
      title: isNow ? "Consulta em andamento" : `Consulta em ${startsIn} min`,
      subject: appointment.client_name ?? "Paciente sem vinculo",
      description: `${appointment.title} (${appointment.appointment_type}). ${briefDescription}`,
      source: "appointments",
      sourceId: appointment.id,
      href: appointment.client_id ? `/dashboard/clients/${appointment.client_id}` : "/dashboard/agenda",
      actionLabel,
      dueAt: appointment.starts_at,
      occurredAt: null,
      createdAt: null,
      briefing: {
        appointmentId: appointment.id,
        status: briefStatus,
        generatedAt: appointment.brief_generated_at ?? null,
        errorCode: appointment.brief_error_code ?? null,
      },
    });
  }

  for (const request of rows.patientRequests) {
    if (request.status && request.status !== "pending_review") continue;
    items.push({
      id: `patient-request:${request.id}`,
      type: "PATIENT_REQUEST_PENDING",
      priority: request.request_type === "symptom_or_complaint" ? "URGENT" : "HIGH",
      section: "ATTENTION",
      title: `Solicitacao: ${requestTypeLabel(request.request_type)}`,
      subject: request.client_name ?? "Paciente",
      description: request.ai_summary || "Aguardando revisao da nutricionista.",
      source: "patient_requests",
      sourceId: request.id,
      href: `/dashboard/solicitacoes?request=${encodeURIComponent(request.id)}`,
      actionLabel: "Ver solicitacao",
      dueAt: request.created_at,
      occurredAt: null,
      createdAt: request.created_at,
    });
  }

  for (const proposal of rows.aiProposals) {
    if (!["pending", "requires_review", "executing"].includes(proposal.status)) continue;
    const needsReview = proposal.status === "requires_review" || proposal.status === "executing";
    items.push({
      id: `ai-proposal:${proposal.id}`,
      type: needsReview ? "AI_PROPOSAL_REVIEW" : "AI_PROPOSAL_PENDING",
      priority: needsReview ? "HIGH" : "NORMAL",
      section: "ATTENTION",
      title: needsReview ? "Acao da IA precisa verificacao" : "Proposta da IA aguardando aprovacao",
      subject: proposal.client_name ?? "Sem paciente vinculado",
      description: `${proposalKindLabel(proposal.kind)} - risco ${proposal.risk}.`,
      source: "ai_action_proposals",
      sourceId: proposal.id,
      href: proposal.client_id ? `/dashboard/clients/${proposal.client_id}` : proposal.submission_id ? `/dashboard/submissions/${proposal.submission_id}` : "/dashboard/ai-recovery",
      actionLabel: needsReview ? "Verificar" : "Abrir contexto",
      dueAt: proposal.created_at,
      occurredAt: null,
      createdAt: proposal.created_at,
    });
  }

  for (const payment of rows.payments) {
    if (!["pendente", "vencido"].includes(payment.status)) continue;
    items.push({
      id: `payment-overdue:${payment.id}`,
      type: "PAYMENT_OVERDUE",
      priority: "HIGH",
      section: "BUSINESS",
      title: "Pagamento vencido",
      subject: payment.client_name ?? "Sem paciente vinculado",
      description: `${payment.description} - ${money(payment.amount_cents)}.`,
      source: "payments",
      sourceId: payment.id,
      href: "/dashboard/financeiro",
      actionLabel: "Ver financeiro",
      dueAt: payment.due_date,
      occurredAt: null,
      createdAt: payment.created_at,
    });
  }

  for (const workflow of dedupeWorkflowRows(rows.workflows)) {
    items.push({
      id: `workflow-due:${workflow.id}`,
      type: "WORKFLOW_DUE",
      priority: "NORMAL",
      section: "ATTENTION",
      title: "Mensagem de atendimento pendente",
      subject: workflow.client_name ?? "Paciente",
      description: `${workflow.step_type.replaceAll("_", " ")} - ${workflow.appointment_title}.`,
      source: "appointment_workflow_items",
      sourceId: workflow.id,
      href: "/dashboard/agenda",
      actionLabel: "Abrir agenda",
      dueAt: workflow.due_at,
      occurredAt: null,
      createdAt: null,
    });
  }

  for (const event of rows.substitutions) {
    const review = event.policy_decision === "requires_review";
    items.push({
      id: `substitution:${event.id}`,
      type: review ? "SUBSTITUTION_REQUIRES_REVIEW" : "SAFE_SUBSTITUTION_OCCURRED",
      priority: review ? "HIGH" : "INFO",
      section: review ? "ATTENTION" : "RECENT",
      title: review ? "Substituicao alimentar aguardando revisao" : "Substituicao segura respondida",
      subject: event.client_name ?? "Paciente",
      description: event.target_food_name ? `Destino: ${event.target_food_name}.` : `Decisao: ${event.autonomy_level}.`,
      source: "patient_food_substitution_events",
      sourceId: event.id,
      href: event.client_id ? `/dashboard/clients/${event.client_id}` : "/dashboard/solicitacoes",
      actionLabel: review ? "Abrir paciente" : "Ver paciente",
      dueAt: null,
      occurredAt: event.created_at,
      createdAt: event.created_at,
    });
  }

  return sortDashboardActionItems(items).slice(0, 30);
}

export async function getDashboardActionItems(now = new Date()): Promise<DashboardActionItem[]> {
  const nowIso = now.toISOString();
  const appointmentFrom = new Date(now.getTime() - 60 * 60_000).toISOString();
  const soonTo = new Date(now.getTime() + 30 * 60_000).toISOString();
  const recentFrom = new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();
  const stuckCutoff = new Date(now.getTime() - STUCK_EXECUTING_THRESHOLD_MS).toISOString();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayKey = today.toISOString().slice(0, 10);

  const [appointments, patientRequests, aiProposals, payments, workflows, substitutions] = await Promise.all([
    d1Query<AppointmentActionRow>(
      `SELECT a.id, a.client_id, c.name as client_name, a.title, a.appointment_type, a.starts_at, a.ends_at, a.status,
              b.status as brief_status, b.generated_at as brief_generated_at, b.error_code as brief_error_code
       FROM appointments a
       LEFT JOIN clients c ON c.id = a.client_id
       LEFT JOIN appointment_ai_briefs b ON b.appointment_id = a.id
       WHERE a.status != 'cancelado'
         AND a.starts_at >= ?1
         AND a.starts_at <= ?2
       ORDER BY a.starts_at ASC
       LIMIT 10`,
      [appointmentFrom, soonTo]
    ),
    d1Query<PatientRequestActionRow>(
      `SELECT r.id, r.client_id, c.name as client_name, r.request_type, r.ai_summary, r.status, r.created_at
       FROM patient_requests r
       LEFT JOIN clients c ON c.id = r.client_id
       WHERE r.status = 'pending_review'
       ORDER BY r.created_at DESC
       LIMIT 10`
    ),
    d1Query<AiProposalActionRow>(
      `SELECT p.id, p.kind, p.status, p.risk, p.client_id, c.name as client_name, p.submission_id, p.created_at, p.executing_at
       FROM ai_action_proposals p
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE p.status = 'pending'
          OR p.status = 'requires_review'
          OR (p.status = 'executing' AND p.executing_at IS NOT NULL AND p.executing_at < ?1)
       ORDER BY p.created_at DESC
       LIMIT 10`,
      [stuckCutoff]
    ),
    d1Query<PaymentActionRow>(
      `SELECT p.id, p.client_id, c.name as client_name, p.description, p.amount_cents, p.due_date, p.status, p.created_at
       FROM payments p
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE p.status IN ('pendente', 'vencido')
         AND p.due_date IS NOT NULL
         AND p.due_date < ?1
       ORDER BY p.due_date ASC
       LIMIT 10`,
      [todayKey]
    ),
    d1Query<WorkflowActionRow>(
      `SELECT MIN(w.id) as id, w.appointment_id, w.step_type, MIN(w.due_at) as due_at, a.title as appointment_title, a.starts_at,
              c.id as client_id, c.name as client_name
       FROM appointment_workflow_items w
       INNER JOIN appointments a ON a.id = w.appointment_id
       LEFT JOIN clients c ON c.id = a.client_id
       WHERE w.status = 'pendente'
         AND w.due_at <= ?1
       GROUP BY w.appointment_id, w.step_type
       ORDER BY MIN(w.due_at) ASC, MIN(w.id) ASC
       LIMIT 10`,
      [nowIso]
    ),
    d1Query<SubstitutionActionRow>(
      `SELECT e.id, e.client_id, c.name as client_name, e.target_food_name, e.policy_decision, e.autonomy_level, e.created_at
       FROM patient_food_substitution_events e
       LEFT JOIN clients c ON c.id = e.client_id
       WHERE e.created_at >= ?1
       ORDER BY e.created_at DESC
       LIMIT 10`,
      [recentFrom]
    ),
  ]);

  return buildDashboardActionItems({ appointments, patientRequests, aiProposals, payments, workflows, substitutions }, now);
}
