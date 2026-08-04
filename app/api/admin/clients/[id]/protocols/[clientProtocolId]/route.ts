import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import {
  getClientProtocolById,
  updateClientProtocol,
} from "@/lib/repositories/client-protocols";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { cancelPendingTasksForProtocol } from "@/lib/repositories/client-tasks";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["ativo", "pausado", "concluido", "cancelado"]).optional(),
  reviewDate: z.string().date().optional().nullable(),
  professionalNotes: z.string().max(5000).optional().nullable(),
}).strict().refine((value) => Object.keys(value).length > 0, "Informe ao menos uma alteração.");

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; clientProtocolId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id: clientId, clientProtocolId } = await params;
  const current = await getClientProtocolById(clientProtocolId);
  if (!current || current.client_id !== clientId) {
    return NextResponse.json({ message: "Protocolo da cliente não encontrado." }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  await updateClientProtocol({ id: clientProtocolId, ...parsed.data });
  if (parsed.data.status === "cancelado") {
    await cancelPendingTasksForProtocol(clientProtocolId);
  }

  if (parsed.data.status && parsed.data.status !== current.status) {
    const labels = { ativo: "retomado", pausado: "pausado", concluido: "concluído", cancelado: "cancelado" };
    await addTimelineEvent({
      client_id: clientId,
      type: parsed.data.status === "concluido" ? "protocol_completed" : "protocol_status_changed",
      title: `Protocolo ${labels[parsed.data.status]}`,
      description: current.protocol_title ?? "Protocolo clínico",
      metadata: { clientProtocolId, previousStatus: current.status, status: parsed.data.status },
    });
  }

  await writeAuditLog({
    action: "client_protocol_updated",
    adminId: admin.sub,
    entityType: "client_protocol",
    entityId: clientProtocolId,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { clientId, changedFields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ success: true });
}
