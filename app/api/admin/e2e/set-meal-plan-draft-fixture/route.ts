import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { setE2EStructuredFixture } from "@/lib/ai/gateway/e2e-fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const draftItemSchema = z.object({
  query: z.string().min(1).max(200),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(40),
}).strict();

const draftMealSchema = z.object({
  mealKey: z.enum(["cafe_da_manha", "lanche_manha", "almoco", "lanche_tarde", "jantar", "ceia"]),
  recipeId: z.string().max(80).nullable().optional(),
  items: z.array(draftItemSchema).max(6).default([]),
  rationale: z.string().max(160).nullable().optional(),
}).strict();

const SetFixtureSchema = z.object({
  clientId: z.string().min(1),
  meals: z.array(draftMealSchema).min(1).max(6),
}).strict();

/**
 * Registra a fixture determinística que
 * lib/ai/agents/nutrition/meal-plan-draft-agent.ts#generateMealPlanDraft vai
 * consumir na PRÓXIMA chamada pra este clientId — nunca existe fora de
 * E2E_TEST_MODE=1 (404, mesmo padrão de seed-usda-food e
 * set-substitution-suggestion-fixture). O schema aqui é o MESMO schema Zod
 * real do draft (draftMealLlmSchema/mealPlanDraftLlmSchema, duplicado
 * localmente só porque não são exportados do agente — qualquer
 * inconsistência entre os dois faz a fixture ser rejeitada pelo gateway,
 * que revalida contra o schema real antes de devolver). Só os NOMES/
 * quantidades propostas pela IA são fixture — resolução de alimento,
 * cálculo nutricional, engine de substituição e tudo mais depois disso
 * continuam 100% reais.
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

  setE2EStructuredFixture("meal-plan-draft", parsed.data.clientId, { meals: parsed.data.meals });
  return NextResponse.json({ ok: true });
}
