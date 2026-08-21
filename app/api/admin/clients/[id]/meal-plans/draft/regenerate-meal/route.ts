import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { regenerateMealInDraft, MEAL_KEYS } from "@/lib/ai/agents/nutrition/meal-plan-draft-agent";
import { AiConfigError, AiProviderError, AiValidationError } from "@/lib/ai/core/ai-errors";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";
import { draftMealSchema, draftTargetSchema } from "@/lib/validators/draft-schemas";
import { calculateDraftNutrition } from "@/lib/nutrition/draft-nutrition";
import { critiqueDraft } from "@/lib/nutrition/draft-critic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/).nullable();

const RegenerateMealSchema = z.object({
  mealKey: z.enum(MEAL_KEYS),
  objectiveLabel: z.string().min(1).max(160),
  requestedMeals: z.array(z.object({ key: z.enum(MEAL_KEYS), suggestedTime: timeSchema })).min(1).max(6),
  prioritizeFoods: z.string().max(400).nullable(),
  avoidFoods: z.string().max(400).nullable(),
  useRecipes: z.boolean(),
  currentMeals: z.array(draftMealSchema).min(1).max(10),
}).merge(draftTargetSchema).strict();

/**
 * Regenera SÓ uma refeição do draft (seção 20 do pedido) — sem regenerar o
 * plano inteiro. Passa as outras refeições como contexto pro LLM evitar
 * repetição (lib/ai/agents/nutrition/meal-plan-draft-agent.ts#regenerateMealInDraft).
 * Mesmas garantias da geração normal: nunca persiste, nunca calcula
 * kcal/macro sozinha.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const limit = await consumeRateLimit(req, {
    scope: "ai-meal-plan-draft-regenerate-meal",
    limit: 30,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ message: "Muitas solicitações. Tente novamente mais tarde.", retryAfter: limit.retryAfter }, { status: 429 });
  }

  const parsed = RegenerateMealSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    const draft = await regenerateMealInDraft({
      clientId: id,
      adminId: admin.sub,
      mealKey: parsed.data.mealKey,
      objectiveLabel: parsed.data.objectiveLabel,
      targetEnergyKcal: parsed.data.targetEnergyKcal,
      targetProteinG: parsed.data.targetProteinG,
      targetCarbohydrateG: parsed.data.targetCarbohydrateG,
      targetFatG: parsed.data.targetFatG,
      requestedMeals: parsed.data.requestedMeals,
      prioritizeFoods: parsed.data.prioritizeFoods,
      avoidFoods: parsed.data.avoidFoods,
      useRecipes: parsed.data.useRecipes,
      currentMeals: parsed.data.currentMeals,
    });
    const target = { energyKcal: parsed.data.targetEnergyKcal, proteinG: parsed.data.targetProteinG, carbohydrateG: parsed.data.targetCarbohydrateG, fatG: parsed.data.targetFatG };
    const [nutrition, critic] = await Promise.all([
      calculateDraftNutrition(draft.meals, target),
      Promise.resolve(critiqueDraft(draft.meals)),
    ]);
    await writeAuditLog({
      action: "ai_meal_plan_draft_meal_regenerated",
      adminId: admin.sub,
      entityType: "client",
      entityId: id,
      ipHash: limit.ipHash,
      metadata: { mealKey: parsed.data.mealKey, mealsAfter: draft.meals.length, warnings: draft.warnings.length },
    });
    return NextResponse.json({ ...draft, nutrition, critic });
  } catch (cause) {
    if (cause instanceof AiConfigError) {
      return NextResponse.json({ message: "Configure um provedor de IA em Configurações antes de usar este recurso." }, { status: 409 });
    }
    if (cause instanceof AiProviderError) {
      return NextResponse.json({ message: cause.message }, { status: 502 });
    }
    if (cause instanceof AiValidationError) {
      return NextResponse.json({ message: cause.message }, { status: 422 });
    }
    const message = cause instanceof Error ? cause.message : "Não foi possível regenerar a refeição.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
