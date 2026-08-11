import { NextRequest, NextResponse } from "next/server";
import { getClientPortalSessionFromRequest } from "@/lib/auth/client-portal-session";
import { cancelAiActionProposal, getAiActionProposal } from "@/lib/repositories/ai-action-proposals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_KINDS = ["patient_appointment_request", "patient_change_request"] as const;
type AllowedKind = (typeof ALLOWED_KINDS)[number];

/**
 * Cancela uma solicitacao pendente do PATIENT_ASSISTANT. Mesma logica do
 * cancel administrativo, so trocando a fonte de autenticacao e restringindo
 * as kinds permitidas (mesma defesa em profundidade do confirm route).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getClientPortalSessionFromRequest(req);
  if (!session) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;

  const existing = await getAiActionProposal(id, session.sub);
  if (!existing || !ALLOWED_KINDS.includes(existing.kind as AllowedKind)) {
    return NextResponse.json({ message: "Solicitação não encontrada." }, { status: 404 });
  }

  const cancelled = await cancelAiActionProposal(id, session.sub);
  if (cancelled) {
    return NextResponse.json({ status: "cancelled" });
  }

  if (existing.status === "completed") {
    return NextResponse.json({ message: "Essa solicitação já foi confirmada e não pode ser cancelada." }, { status: 409 });
  }
  return NextResponse.json({ message: "Essa solicitação não pode ser cancelada neste estado." }, { status: 409 });
}
