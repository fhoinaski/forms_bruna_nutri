import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import {
  getActiveConsultationSession,
  saveConsultationAiBrief,
  startConsultationSession,
  ConsultationSessionAlreadyActiveError,
} from "@/lib/repositories/consultation-sessions";
import { getConsultationWorkspace } from "@/lib/repositories/patient-consultation-workspace";
import { getAppointmentBriefState } from "@/lib/clinical/appointment-briefing";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Le o workspace de consulta do paciente, por sessionId explicito ou sessao ativa. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  const workspace = await getConsultationWorkspace(id, sessionId);
  if (!workspace) return NextResponse.json({ message: "Paciente não encontrado." }, { status: 404 });
  if (sessionId && !workspace.consultation) {
    return NextResponse.json({ message: "Sessão de consulta não encontrada para este paciente." }, { status: 404 });
  }
  return NextResponse.json({ workspace, session: workspace.consultation });
}

/**
 * Inicia o Modo Consulta para este cliente — se ja houver uma sessao
 * 'in_progress' (garantia no banco via indice UNIQUE parcial, migration
 * 20260811_0033), retorna essa mesma sessao em vez de erro: a nutricionista
 * pode ter recarregado a pagina no meio do atendimento (idempotente na
 * pratica, sem duplicar sessao).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Paciente não encontrado." }, { status: 404 });
  if (client.status === "arquivado") {
    return NextResponse.json({ message: "Reative o paciente antes de iniciar uma consulta." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const appointmentId = typeof body?.appointmentId === "string" ? body.appointmentId : null;

  let session;
  let created = true;
  try {
    session = await startConsultationSession({ clientId: id, adminId: admin.sub, appointmentId });
  } catch (error) {
    if (error instanceof ConsultationSessionAlreadyActiveError) {
      const existing = await getActiveConsultationSession(id);
      if (existing) {
        session = existing;
        created = false;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  if (appointmentId) {
    const appointmentBrief = await getAppointmentBriefState(appointmentId);
    if (appointmentBrief.status === "ready" && appointmentBrief.brief) {
      await saveConsultationAiBrief(session.id, {
        systemData: appointmentBrief.brief.systemData,
        aiBrief: appointmentBrief.brief.aiBrief,
        proactiveBrief: appointmentBrief.brief,
        generatedAt: appointmentBrief.generatedAt,
        source: "appointment_ai_brief",
        appointmentId,
      });
    }
  }

  if (created) {
    await addTimelineEvent({
      client_id: id,
      type: "consultation_started",
      title: "Consulta iniciada",
      description: "Atendimento iniciado no Modo Consulta.",
      metadata: { consultationSessionId: session.id },
    });
    await writeAuditLog({
      action: "consultation_started",
      adminId: admin.sub,
      entityType: "consultation_session",
      entityId: session.id,
      ipHash: getRequestFingerprint(req).ipHash,
      metadata: { clientId: id },
    });
  }

  const workspace = await getConsultationWorkspace(id, session.id);
  return NextResponse.json({ session, workspace }, { status: created ? 201 : 200 });
}
