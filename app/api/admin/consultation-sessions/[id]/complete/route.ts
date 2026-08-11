import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getConsultationSessionById, completeConsultationSession } from "@/lib/repositories/consultation-sessions";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Checklist assistencial (secao 15 do pedido) — so metadados booleanos para
 * o audit log/timeline, nunca bloqueia a finalizacao. O resumo estruturado
 * em si (se gerado) ja foi salvo antes via a proposal consultation_summary
 * confirmada (completeConsultationSession preserva o que ja estiver la).
 */
const completeSchema = z.object({
  checklist: z.object({
    anthropometryUpdated: z.boolean().optional(),
    evolutionRecorded: z.boolean().optional(),
    planReviewed: z.boolean().optional(),
    protocolReviewed: z.boolean().optional(),
    tasksDefined: z.boolean().optional(),
    followUpScheduled: z.boolean().optional(),
  }).optional(),
}).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const existing = await getConsultationSessionById(id);
  if (!existing) return NextResponse.json({ message: "Sessão de consulta não encontrada." }, { status: 404 });

  const parsed = completeSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const completed = await completeConsultationSession(id);
  if (!completed) {
    return NextResponse.json({ message: "Esta consulta já foi finalizada ou cancelada." }, { status: 409 });
  }

  await addTimelineEvent({
    client_id: existing.client_id,
    type: "consultation_completed",
    title: "Consulta finalizada",
    description: "Atendimento concluído no Modo Consulta.",
    metadata: { consultationSessionId: id },
  });
  await writeAuditLog({
    action: "consultation_completed",
    adminId: admin.sub,
    entityType: "consultation_session",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    // So os booleanos do checklist — nunca o conteudo clinico da consulta.
    metadata: { clientId: existing.client_id, checklist: parsed.data.checklist ?? null },
  });

  return NextResponse.json({ success: true });
}
