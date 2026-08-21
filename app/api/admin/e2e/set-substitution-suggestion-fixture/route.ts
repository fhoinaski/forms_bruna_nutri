import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { setE2EStructuredFixture } from "@/lib/ai/gateway/e2e-fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SetFixtureSchema = z.object({
  clientId: z.string().min(1),
  candidates: z.array(z.string().min(1).max(120)).min(1).max(5),
}).strict();

/**
 * Registra a fixture determinística que
 * lib/ai/agents/nutrition/substitution-suggestion-agent.ts vai consumir na
 * PRÓXIMA chamada pra este clientId — nunca existe fora de E2E_TEST_MODE=1
 * (404, mesmo padrão de /api/admin/e2e/seed-usda-food). A fixture só
 * substitui a resposta CRUA do modelo (nomes de alimento); tudo depois
 * disso (resolveFoodCandidates, substitution engine, persistência) continua
 * rodando 100% real — é exatamente a fronteira pedida na FASE 11 do
 * fechamento de gaps V3.
 */
export async function POST(req: NextRequest) {
  if (process.env.E2E_TEST_MODE !== "1") {
    return NextResponse.json({ message: "Não encontrado." }, { status: 404 });
  }

  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const parsed = SetFixtureSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  setE2EStructuredFixture("meal-plan-substitution-suggestion", parsed.data.clientId, { candidates: parsed.data.candidates });
  return NextResponse.json({ ok: true });
}
