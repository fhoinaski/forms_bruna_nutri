import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { listPatientRequests, type PatientRequestStatus } from "@/lib/repositories/patient-requests";
import { getClientById } from "@/lib/repositories/clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES: PatientRequestStatus[] = ["pending_review", "reviewed", "resolved", "dismissed"];

/**
 * Inbox de solicitações do paciente (secao 12/26 do pedido) — leitura
 * simples com filtro opcional por cliente/status, resolvendo o nome do
 * cliente para exibicao (a tabela patient_requests não guarda nome).
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const statusParam = req.nextUrl.searchParams.get("status");
  const status = statusParam && VALID_STATUSES.includes(statusParam as PatientRequestStatus) ? (statusParam as PatientRequestStatus) : undefined;
  const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;

  const rows = await listPatientRequests({ clientId, status, limit: 100 });

  const names = new Map<string, string | null>();
  const items = [];
  for (const row of rows) {
    if (!names.has(row.client_id)) {
      const client = await getClientById(row.client_id);
      names.set(row.client_id, client?.name ?? null);
    }
    items.push({
      id: row.id,
      clientId: row.client_id,
      clientName: names.get(row.client_id) ?? null,
      requestType: row.request_type,
      patientText: row.patient_text,
      aiSummary: row.ai_summary,
      mealPlanId: row.meal_plan_id,
      mealId: row.meal_id,
      itemId: row.item_id,
      appointmentId: row.appointment_id,
      clientTaskId: row.client_task_id,
      status: row.status,
      adminNotes: row.admin_notes,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
    });
  }

  return NextResponse.json({ items });
}
