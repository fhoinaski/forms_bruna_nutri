import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { buildMealPlanDraftContext } from "@/lib/ai/agents/nutrition/meal-plan-draft-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Prévia do contexto clínico que o assistente de IA vai usar (etapa 1 do
 * wizard, seção 30 do pedido) — determinístico, sem chamar o provedor de
 * IA. A nutricionista confere se os dados considerados estão corretos
 * antes de prosseguir.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const context = await buildMealPlanDraftContext(id);
  if (!context) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  return NextResponse.json(context);
}
