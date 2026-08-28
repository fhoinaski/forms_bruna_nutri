import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getE2EFixtureTraces, readE2EStructuredFixture, setE2EStructuredFixture } from "@/lib/ai/gateway/e2e-fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const draftItemSchema = z.object({
  query: z.string().min(1).max(200),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(40),
  preparation: z.string().min(1).max(100).nullable().optional(),
  optional: z.boolean().optional(),
}).strict();

const baseMeal = {
  mealKey: z.enum(["cafe_da_manha", "lanche_manha", "almoco", "lanche_tarde", "jantar", "ceia"]),
  recipeId: z.string().max(80).nullable().optional(),
  rationale: z.string().max(160).nullable().optional(),
};
// Espelha o contrato estruturado do agente, mas mantém a fixture SIMPLE
// legada para os cenários e2e anteriores; o agente normaliza-a para SIMPLE.
const draftMealSchema = z.union([
  z.object({ ...baseMeal, structureType: z.literal("SIMPLE"), items: z.array(draftItemSchema).min(1).max(6) }).strict(),
  z.object({ ...baseMeal, structureType: z.literal("OPTIONS"), options: z.array(z.object({ label: z.string().min(1), description: z.string().nullable().optional(), items: z.array(draftItemSchema).min(1).max(6) }).strict()).min(2).max(4) }).strict(),
  z.object({ ...baseMeal, structureType: z.literal("COMBINATION"), fixedItems: z.array(draftItemSchema).max(6).default([]), choiceGroups: z.array(z.object({ label: z.string().min(1), description: z.string().nullable().optional(), minSelections: z.number().int().min(0), maxSelections: z.number().int().min(1), items: z.array(draftItemSchema).min(1).max(6) }).strict()).min(1).max(4) }).strict(),
  z.object({ ...baseMeal, items: z.array(draftItemSchema).max(6).default([]) }).strict(),
]);

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

  // Fixtures antigas representavam somente a forma SIMPLE. Armazená-las já
  // discriminadas deixa o provider determinístico idêntico ao output atual
  // do LLM, sem afrouxar a validação do agente real.
  const meals = parsed.data.meals.map((meal) => "structureType" in meal ? meal : { ...meal, structureType: "SIMPLE" as const });
  const registration = setE2EStructuredFixture("meal-plan-draft", parsed.data.clientId, { meals });
  const readback = readE2EStructuredFixture("meal-plan-draft", parsed.data.clientId);
  return NextResponse.json({ ok: true, registration, readback });
}

/** Guarded diagnostic readback for Playwright only; never available in production. */
export async function GET(req: NextRequest) {
  if (process.env.E2E_TEST_MODE !== "1") return NextResponse.json({ message: "Não encontrado." }, { status: 404 });
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ message: "clientId obrigatório." }, { status: 400 });
  return NextResponse.json({ traces: getE2EFixtureTraces(clientId) });
}
