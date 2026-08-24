import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getConsultationSessionById, saveConsultationAiBrief } from "@/lib/repositories/consultation-sessions";
import { buildConsultationSystemData, generateConsultationAiBrief } from "@/lib/ai/agents/clinical/consultation-briefing";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const briefSchema = z.object({
  clientId: z.string().min(1).max(100),
}).strict();

/**
 * "Preparar consulta com IA" (secao 5 do pedido) — monta o briefing
 * (dados deterministicos + interpretacao opcional de IA) e persiste na
 * propria sessao. Endpoint dedicado (em vez de forcar isso a passar pelo
 * chat de proposito geral) porque e o carregamento inicial da tela, nao
 * uma pergunta em linguagem natural — o copiloto (Area C) ainda pode
 * regerar/reconsultar isso via a tool getConsultationBrief a qualquer
 * momento durante a conversa.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const session = await getConsultationSessionById(id);
  if (!session) return NextResponse.json({ message: "Sessão de consulta não encontrada." }, { status: 404 });

  const parsed = briefSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  if (session.client_id !== parsed.data.clientId) {
    return NextResponse.json({ message: "Sessão de consulta não encontrada para este paciente." }, { status: 404 });
  }
  if (session.status !== "in_progress") {
    return NextResponse.json({ message: "Esta consulta já foi finalizada ou cancelada." }, { status: 409 });
  }

  const client = await getClientById(session.client_id);
  if (!client) return NextResponse.json({ message: "Paciente não encontrado." }, { status: 404 });

  const systemData = await buildConsultationSystemData(client);
  const aiBrief = await generateConsultationAiBrief(client, systemData, admin.sub);

  const brief = { systemData, aiBrief, generatedAt: new Date().toISOString() };
  await saveConsultationAiBrief(id, brief);

  await writeAuditLog({
    action: "consultation_ai_brief_generated",
    adminId: admin.sub,
    entityType: "consultation_session",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { clientId: session.client_id, hasAiInterpretation: aiBrief !== null },
  });

  return NextResponse.json({ brief });
}
