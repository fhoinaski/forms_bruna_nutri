import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { d1Query } from "@/lib/d1/client";
import { getTodayAppointmentsCount } from "@/lib/repositories/appointments";
import { getOverdueTasksCount } from "@/lib/repositories/client-tasks";
import { getLeadOpportunityMetrics } from "@/lib/repositories/lead-opportunities";
import { getPaymentMetrics } from "@/lib/repositories/payments";
import { listPrivacyRequests } from "@/lib/repositories/privacy";
import { getDashboardMetrics } from "@/lib/repositories/submissions";
import { getPendingPatientRequestsCount } from "@/lib/repositories/patient-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotificationItem = {
  id: string;
  type: string;
  label: string;
  count: number;
  href: string;
};

function plural(count: number, singular: string, pluralText: string) {
  return count === 1 ? singular : pluralText;
}

function addItem(items: NotificationItem[], item: NotificationItem) {
  if (item.count > 0) {
    items.push(item);
  }
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  }

  const [
    overdueTasks,
    todayAppointments,
    pendingDraftRows,
    paymentMetrics,
    opportunityMetrics,
    privacyRequests,
    submissionMetrics,
    pendingPatientRequests,
  ] = await Promise.all([
    getOverdueTasksCount(),
    getTodayAppointmentsCount(),
    d1Query<{ c: number }>(
      `SELECT COUNT(*) as c FROM ai_protocol_drafts WHERE status IN ('draft', 'reviewed')`,
      []
    ),
    getPaymentMetrics(),
    getLeadOpportunityMetrics(),
    listPrivacyRequests(),
    getDashboardMetrics(),
    getPendingPatientRequestsCount(),
  ]);

  const pendingDrafts = pendingDraftRows[0]?.c ?? 0;
  const openPrivacyRequests = privacyRequests.filter(
    (item) => !["concluida", "recusada"].includes(item.status)
  ).length;
  const activeOpportunities = Math.max(
    opportunityMetrics.total - opportunityMetrics.convertidas,
    0
  );

  const items: NotificationItem[] = [];

  addItem(items, {
    id: "tasks-overdue",
    type: "task",
    label: `${overdueTasks} ${plural(overdueTasks, "tarefa vencida", "tarefas vencidas")}`,
    count: overdueTasks,
    href: "/dashboard/tarefas",
  });
  addItem(items, {
    id: "appointments-today",
    type: "appointment",
    label: `${todayAppointments} ${plural(todayAppointments, "consulta hoje", "consultas hoje")}`,
    count: todayAppointments,
    href: "/dashboard/agenda",
  });
  addItem(items, {
    id: "ai-drafts",
    type: "ai_draft",
    label: `${pendingDrafts} ${plural(pendingDrafts, "rascunho de IA aguardando revisão", "rascunhos de IA aguardando revisão")}`,
    count: pendingDrafts,
    href: "/dashboard/protocols",
  });
  addItem(items, {
    id: "payments-overdue",
    type: "payment",
    label: `${paymentMetrics.overdueCount} ${plural(paymentMetrics.overdueCount, "pagamento vencido", "pagamentos vencidos")}`,
    count: paymentMetrics.overdueCount,
    href: "/dashboard/financeiro",
  });
  addItem(items, {
    id: "opportunities",
    type: "opportunity",
    label: `${activeOpportunities} ${plural(activeOpportunities, "oportunidade em acompanhamento", "oportunidades em acompanhamento")}`,
    count: activeOpportunities,
    href: "/dashboard/oportunidades",
  });
  addItem(items, {
    id: "privacy-open",
    type: "privacy",
    label: `${openPrivacyRequests} ${plural(openPrivacyRequests, "solicitação de privacidade em aberto", "solicitações de privacidade em aberto")}`,
    count: openPrivacyRequests,
    href: "/dashboard/privacidade",
  });
  addItem(items, {
    id: "submissions-new",
    type: "submission",
    label: `${submissionMetrics.novos} ${plural(submissionMetrics.novos, "pré-consulta nova", "pré-consultas novas")}`,
    count: submissionMetrics.novos,
    href: "/dashboard/oportunidades",
  });
  addItem(items, {
    id: "patient-requests",
    type: "patient_request",
    label: `${pendingPatientRequests} ${plural(pendingPatientRequests, "solicitação de paciente aguardando revisão", "solicitações de pacientes aguardando revisão")}`,
    count: pendingPatientRequests,
    href: "/dashboard/solicitacoes",
  });

  const totalUnread = items.reduce((total, item) => total + item.count, 0);
  const signature = items.map((item) => `${item.id}:${item.count}`).join("|");

  return NextResponse.json({
    items,
    totalUnread,
    signature,
    generatedAt: new Date().toISOString(),
    badges: {
      tarefas: overdueTasks,
      oportunidades: activeOpportunities,
      privacidade: openPrivacyRequests,
      solicitacoes: pendingPatientRequests,
    },
  });
}
