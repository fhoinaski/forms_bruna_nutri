import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getConsultationSessionById, cancelConsultationSession } from "@/lib/repositories/consultation-sessions";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cancelSchema = z.object({
  clientId: z.string().min(1).max(100),
}).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const existing = await getConsultationSessionById(id);
  if (!existing) return NextResponse.json({ message: "Sessão de consulta não encontrada." }, { status: 404 });

  const parsed = cancelSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  if (existing.client_id !== parsed.data.clientId) {
    return NextResponse.json({ message: "Sessão de consulta não encontrada para este paciente." }, { status: 404 });
  }

  const cancelled = await cancelConsultationSession(id);
  if (!cancelled) {
    return NextResponse.json({ message: "Esta consulta já foi finalizada ou cancelada." }, { status: 409 });
  }

  await addTimelineEvent({
    client_id: existing.client_id,
    type: "consultation_cancelled",
    title: "Consulta cancelada",
    description: "Atendimento cancelado no Modo Consulta.",
    metadata: { consultationSessionId: id },
  });
  await writeAuditLog({
    action: "consultation_cancelled",
    adminId: admin.sub,
    entityType: "consultation_session",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { clientId: existing.client_id },
  });

  return NextResponse.json({ success: true });
}
