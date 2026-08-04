import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { updateAppointmentWorkflowItem } from "@/lib/repositories/appointment-workflows";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.enum(["pendente", "enviado", "dispensado"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });

  const { id } = await params;
  const item = await updateAppointmentWorkflowItem(id, {
    status: parsed.data.status,
    adminId: admin.sub,
  });
  if (!item) return NextResponse.json({ message: "Acao nao encontrada." }, { status: 404 });
  await writeAuditLog({
    action: "appointment_workflow_updated",
    adminId: admin.sub,
    entityType: "appointment_workflow_item",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { status: parsed.data.status, appointmentId: item?.appointment_id },
  });
  return NextResponse.json({ ok: true, item });
}
