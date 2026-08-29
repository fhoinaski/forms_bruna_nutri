import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { setE2EStructuredFixture } from "@/lib/ai/gateway/e2e-fixtures";
import { prepareMealRawForParse, mealPlanDraftLlmSchema } from "@/lib/ai/agents/nutrition/meal-plan-draft-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// R5.1 — aceita qualquer objeto de refeição bruto (SIMPLE/OPTIONS/COMBINATION)
// e reaproveita a MESMA normalização + o MESMO schema real do agente
// (`prepareMealRawForParse`/`mealPlanDraftLlmSchema`, exportados de
// meal-plan-draft-agent.ts) — nunca uma segunda cópia do schema que possa
// divergir. "structure" ausente continua sendo tratado como "SIMPLE"
// (mesma convenção do agente real), preservando 100% das fixtures E2E
// escritas antes desta fase.
const SetFixtureSchema = z.object({
  clientId: z.string().min(1),
  meals: z.array(z.record(z.string(), z.unknown())).min(1).max(6),
}).strict();

/**
 * Registra a fixture determinística que
 * lib/ai/agents/nutrition/meal-plan-draft-agent.ts#generateMealPlanDraft vai
 * consumir na PRÓXIMA chamada pra este clientId — nunca existe fora de
 * E2E_TEST_MODE=1 (404, mesmo padrão de seed-usda-food e
 * set-substitution-suggestion-fixture). Valida contra o schema Zod REAL do
 * draft (importado, nunca duplicado) — qualquer fixture que o agente real
 * rejeitaria também é rejeitada aqui, ANTES de ser aceita como "próxima
 * resposta da IA". Só os NOMES/quantidades/estrutura propostos pela IA são
 * fixture — resolução de alimento, cálculo nutricional, engine de
 * substituição e tudo mais depois disso continuam 100% reais.
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

  const normalizedMeals = parsed.data.meals.map(prepareMealRawForParse);
  const validated = mealPlanDraftLlmSchema.safeParse({ meals: normalizedMeals });
  if (!validated.success) {
    return NextResponse.json({ message: validated.error.issues[0]?.message ?? "Fixture não bate com o schema real do agente." }, { status: 400 });
  }

  setE2EStructuredFixture("meal-plan-draft", parsed.data.clientId, validated.data);
  return NextResponse.json({ ok: true });
}
