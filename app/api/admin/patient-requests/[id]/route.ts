import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getPatientRequestById, updatePatientRequestStatus } from "@/lib/repositories/patient-requests";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Atualiza o status de uma solicitação do paciente (secao 26 do pedido:
 * Marcar como revisado / Resolver / Descartar). Isto é uma acao
 * administrativa simples de inbox — NUNCA passa pela infraestrutura de IA
 * (não é uma alteração clínica, é bookkeeping de status). "Resolver" aqui
 * nunca significa alterar plano/prontuário sozinho — se a nutricionista
 * decidir aplicar a mudança pedida, isso é uma ação clínica SEPARADA
 * (ex.: meal_plan_change), com sua própria confirmação.
 */
const patchSchema = z.object({
  status: z.enum(["pending_review", "reviewed", "resolved", "dismissed"]),
  adminNotes: z.string().max(2000).nullable().optional(),
}).strict();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const existing = await getPatientRequestById(id);
  if (!existing) return NextResponse.json({ message: "Solicitação não encontrada." }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const updated = await updatePatientRequestStatus(id, { status: parsed.data.status, adminNotes: parsed.data.adminNotes });

  // Log sem texto clinico integral — so identificadores e o status novo
  // (secao 23 do pedido).
  await writeAuditLog({
    action: "patient_request_status_updated",
    adminId: admin.sub,
    entityType: "patient_request",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { requestId: id, clientId: existing.client_id, requestType: existing.request_type, status: parsed.data.status },
  });

  return NextResponse.json({
    id: updated?.id,
    status: updated?.status,
    adminNotes: updated?.admin_notes,
    reviewedAt: updated?.reviewed_at,
  });
}
