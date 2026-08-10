import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getAppointmentById } from "@/lib/repositories/appointments";
import { getClientById } from "@/lib/repositories/clients";
import { generatePreConsultationBriefing } from "@/lib/ai/agents/clinical/pre-consultation-briefing";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Briefing pre-consulta sob demanda (nunca automatico/popup) — a nutricionista
 * pede explicitamente ("Preparar briefing") antes de uma consulta. So leitura:
 * nao grava nada, nao exige confirmacao.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const limit = await consumeRateLimit(req, {
    scope: "ai-briefing",
    limit: 60,
    windowMs: 60 * 60 * 1000,
    blockMs: 5 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Muitos pedidos de briefing em pouco tempo. Aguarde e tente novamente." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const { appointmentId } = await params;
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) {
    return NextResponse.json({ message: "Consulta não encontrada." }, { status: 404 });
  }
  if (!appointment.client_id) {
    return NextResponse.json({ message: "Esta consulta não está vinculada a um paciente." }, { status: 409 });
  }

  const client = await getClientById(appointment.client_id);
  if (!client) {
    return NextResponse.json({ message: "Paciente não encontrado." }, { status: 404 });
  }

  const briefing = await generatePreConsultationBriefing(client, appointment.id, admin.sub);
  return NextResponse.json(briefing);
}
