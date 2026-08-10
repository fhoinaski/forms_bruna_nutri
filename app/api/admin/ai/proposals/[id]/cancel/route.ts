import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { cancelAiActionProposal, getAiActionProposal } from "@/lib/repositories/ai-action-proposals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cancela uma proposta pendente. So o admin dono da proposta pode cancelar
 * (mesma protecao de ownership do confirm), e so a partir de 'pending' — uma
 * proposta ja completed nao pode ser "desfeita" por aqui, e uma que ja esta
 * sendo confirmada (executing) tambem nao, para nao competir com o claim.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const cancelled = await cancelAiActionProposal(id, admin.sub);
  if (cancelled) {
    return NextResponse.json({ status: "cancelled" });
  }

  const existing = await getAiActionProposal(id, admin.sub);
  if (!existing) {
    return NextResponse.json({ message: "Proposta não encontrada." }, { status: 404 });
  }
  if (existing.status === "completed") {
    return NextResponse.json({ message: "Esta proposta já foi confirmada e não pode ser cancelada." }, { status: 409 });
  }
  return NextResponse.json({ message: "Esta proposta não pode ser cancelada neste estado." }, { status: 409 });
}
