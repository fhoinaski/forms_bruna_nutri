import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientMetrics, getClientsCreatedBetween } from "@/lib/repositories/clients";
import { getProtocolMetrics } from "@/lib/repositories/protocols";
import {
  getOverdueTasksCount,
  getUpcomingClientTasks,
  getTasksDueOn,
} from "@/lib/repositories/client-tasks";
import { getActiveProtocolsCount } from "@/lib/repositories/client-protocols";
import {
  getAppointments,
  getTodayAppointmentsCount,
  getUpcomingAppointments,
} from "@/lib/repositories/appointments";
import { getPaymentMetrics } from "@/lib/repositories/payments";
import { getBlogMetrics } from "@/lib/repositories/blog-posts";
import { getLeadOpportunityMetrics } from "@/lib/repositories/lead-opportunities";
import { getSubmissionsCreatedBetween } from "@/lib/repositories/submissions";
import { getSaoPauloDayBoundaries } from "@/lib/utils/timezone";
import { d1Query } from "@/lib/d1/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { dateKey, start, end } = getSaoPauloDayBoundaries();

  const [
    clientMetrics,
    protocolMetrics,
    overdueCount,
    activeProtocolsCount,
    pendingDrafts,
    todayAppointments,
    upcomingAppointments,
    paymentMetrics,
    upcomingTasks,
    blogMetrics,
    opportunityMetrics,
    appointmentsToday,
    newClientsToday,
    newSubmissionsToday,
    tasksDueToday,
  ] =
    await Promise.all([
      getClientMetrics(),
      getProtocolMetrics(),
      getOverdueTasksCount(),
      getActiveProtocolsCount(),
      d1Query<{ c: number }>(
        `SELECT COUNT(*) as c FROM ai_protocol_drafts WHERE status IN ('draft', 'reviewed')`,
        []
      ),
      getTodayAppointmentsCount(),
      getUpcomingAppointments(5),
      getPaymentMetrics(),
      getUpcomingClientTasks(5),
      getBlogMetrics(),
      getLeadOpportunityMetrics(),
      getAppointments({ from: start, to: end }),
      getClientsCreatedBetween(start, end),
      getSubmissionsCreatedBetween(start, end),
      getTasksDueOn(dateKey),
    ]);

  return NextResponse.json({
    clientesAtivos: clientMetrics.ativos,
    protocolosAtivos: protocolMetrics.ativos,
    tarefasVencidas: overdueCount,
    protocolosAplicadosAtivos: activeProtocolsCount,
    rascunhosPendentes: pendingDrafts[0]?.c ?? 0,
    consultasHoje: todayAppointments,
    proximasConsultas: upcomingAppointments,
    financeiro: paymentMetrics,
    proximasTarefas: upcomingTasks,
    blog: blogMetrics,
    oportunidades: opportunityMetrics,
    hoje: {
      dateKey,
      agendamentos: appointmentsToday,
      novosClientes: newClientsToday,
      novasSubmissoes: newSubmissionsToday,
      tarefas: tasksDueToday,
    },
  });
}
