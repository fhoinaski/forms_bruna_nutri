import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { calculatePlanNutrients, roundedNutrients } from "@/lib/nutrition/nutrients";
import { resolveMealPlanChangeReferences, buildFoodReferenceLookup } from "@/lib/ai/agents/nutrition/meal-plan-change-agent";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const simulateItemSchema = z.object({
  food: z.string().min(1).max(300),
  quantity: z.string().max(80).nullable().optional(),
  unit: z.string().max(40).nullable().optional(),
  food_source: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA"]).nullable().optional(),
  food_ref_id: z.string().max(120).nullable().optional(),
}).passthrough();

const simulateMealSchema = z.object({
  name: z.string().min(1).max(200),
  items: z.array(simulateItemSchema).max(30),
}).passthrough();

const SimulateSchema = z.object({
  currentMeals: z.array(simulateMealSchema).min(1).max(10),
  baseFoodSource: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA"]),
  baseFoodRefId: z.string().min(1).max(120),
  optionFoodSource: z.enum(["TACO", "CUSTOM", "MANUFACTURER"]),
  optionFoodRefId: z.string().min(1).max(120),
  optionFoodName: z.string().min(1).max(200),
  optionQuantity: z.string().min(1).max(80),
  optionUnit: z.string().min(1).max(40),
}).strict();

/**
 * Simulação de troca (seção 3/17 do pedido de fechamento de gaps) — NUNCA
 * altera o plano. Recalcula o total do plano DUAS vezes pela MESMA engine
 * oficial (uma vez como está, outra com o item base trocado pela
 * alternativa) — nunca uma fórmula própria, nunca persiste nada.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const limit = await consumeRateLimit(req, {
    scope: "meal-plan-substitution-simulate",
    limit: 120,
    windowMs: 60 * 60 * 1000,
    blockMs: 15 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ message: "Muitas solicitações. Tente novamente mais tarde.", retryAfter: limit.retryAfter }, { status: 429 });
  }

  const parsed = SimulateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const input = parsed.data;

  const { references, measuresById } = await resolveMealPlanChangeReferences({ meals: input.currentMeals });
  const lookup = buildFoodReferenceLookup(references, measuresById);

  const before = calculatePlanNutrients({ meals: input.currentMeals }, lookup);

  let replaced = false;
  const simulatedMeals = input.currentMeals.map((meal) => ({
    ...meal,
    items: meal.items.map((item) => {
      if (replaced || item.food_source !== input.baseFoodSource || item.food_ref_id !== input.baseFoodRefId) return item;
      replaced = true;
      return {
        ...item,
        food: input.optionFoodName,
        quantity: input.optionQuantity,
        unit: input.optionUnit,
        food_source: input.optionFoodSource,
        food_ref_id: input.optionFoodRefId,
      };
    }),
  }));

  if (!replaced) {
    return NextResponse.json({ message: "Alimento prescrito não encontrado no plano informado." }, { status: 404 });
  }

  const after = calculatePlanNutrients({ meals: simulatedMeals }, lookup);

  return NextResponse.json({
    totalBefore: roundedNutrients(before.total.values),
    totalAfter: roundedNutrients(after.total.values),
  });
}
