import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getMealPlanById, type MealPlanMealPayload } from "@/lib/repositories/meal-plans";
import { optimizeDraftToTargetV2 } from "@/lib/nutrition/draft-optimizer-v2";
import { MEAL_KEYS, type DraftMeal, type MealKey } from "@/lib/nutrition/draft-types";
import { writeAuditLog } from "@/lib/security/audit";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const draftTargetFields = {
  targetEnergyKcal: z.number().positive().max(20000).nullable(),
  targetProteinG: z.number().positive().max(2000).nullable(),
  targetCarbohydrateG: z.number().positive().max(2000).nullable(),
  targetFatG: z.number().positive().max(2000).nullable(),
};
const OptimizeSavedPlanSchema = z.object(draftTargetFields).strict();

/**
 * "✨ Ajustar quantidades" no plano SALVO (seção 4 do pedido de fechamento
 * de gaps: "integrar os locks persistidos ao Optimizer V2 sempre que ele
 * operar sobre plano salvo"). Reaproveita o MESMO Optimizer V2 do wizard
 * (lib/nutrition/draft-optimizer-v2.ts) — nunca uma segunda lógica de
 * ajuste. Nunca persiste: devolve as quantidades ajustadas para a
 * nutricionista revisar e decidir se salva pelo fluxo normal (versionado).
 *
 * `lockedItemKeys`/`lockedMealKeys` são derivados AUTOMATICAMENTE dos
 * campos persistidos `quantity_locked`/`substitutions_locked=false` (só
 * quantity_locked importa aqui — o optimizer nunca mexe em substituições) —
 * a nutricionista não precisa selecionar manualmente a cada chamada.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id, planId } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const plan = await getMealPlanById(planId);
  if (!plan || plan.client_id !== id) return NextResponse.json({ message: "Plano alimentar não encontrado." }, { status: 404 });

  const limit = await consumeRateLimit(req, {
    scope: "meal-plan-optimize-saved",
    limit: 60,
    windowMs: 60 * 60 * 1000,
    blockMs: 15 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ message: "Muitas solicitações. Tente novamente mais tarde.", retryAfter: limit.retryAfter }, { status: 429 });
  }

  const parsed = OptimizeSavedPlanSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  // Chaves sintéticas posicionais (o plano salvo não tem "mealKey" — só
  // usado internamente pelo optimizer pra identificar/bloquear refeições,
  // nunca exibido). Planos com mais de 6 refeições reciclam chaves — caso
  // raro, documentado, sem impacto na correção do cálculo em si.
  const mealKeyFor = (index: number): MealKey => MEAL_KEYS[index % MEAL_KEYS.length];

  const draftMeals: DraftMeal[] = plan.meals.map((meal: MealPlanMealPayload, mealIndex) => ({
    mealKey: mealKeyFor(mealIndex),
    name: meal.name,
    suggested_time: meal.suggested_time ?? null,
    source_recipe_id: meal.source_recipe_id ?? null,
    needsReview: [],
    items: meal.items
      .filter((item) => item.food.trim())
      .map((item) => ({
        food: item.food,
        displayName: item.food,
        quantity: item.quantity ?? "0",
        unit: item.unit ?? "g",
        // FASE 6.5 (item 8) — o Optimizer ainda nao sabe recalcular
        // TBCA/IBGE_POF (o Nutrition Engine trata esses itens como "nao
        // reconhecido" — ver nutrients.ts#resolveItemReference); em vez de
        // widenar o tipo compartilhado com o gerador de IA (que nunca deve
        // produzir esses valores ainda, item 25), trata como sem fonte
        // estruturada aqui — mesmo fallback grácil de qualquer item sem match.
        food_source: item.food_source === "TBCA" || item.food_source === "IBGE_POF" ? null : (item.food_source ?? null),
        food_ref_id: item.food_source === "TBCA" || item.food_source === "IBGE_POF" ? null : (item.food_ref_id ?? null),
        ai_suggested: true as const,
      })),
  }));

  const lockedItemKeys: string[] = [];
  plan.meals.forEach((meal, mealIndex) => {
    let itemIndex = 0;
    for (const item of meal.items) {
      if (!item.food.trim()) continue;
      if (item.quantity_locked) lockedItemKeys.push(`${mealIndex}:${itemIndex}`);
      itemIndex += 1;
    }
  });

  const target = {
    energyKcal: parsed.data.targetEnergyKcal,
    proteinG: parsed.data.targetProteinG,
    carbohydrateG: parsed.data.targetCarbohydrateG,
    fatG: parsed.data.targetFatG,
  };

  const result = await optimizeDraftToTargetV2(draftMeals, target, { lockedItemKeys });

  await writeAuditLog({
    action: "meal_plan_optimized_saved",
    adminId: admin.sub,
    entityType: "client",
    entityId: id,
    ipHash: limit.ipHash,
    metadata: {
      mealPlanId: planId,
      targetsActive: result.activeTargets,
      scoreBefore: result.scoreBefore,
      scoreAfter: result.scoreAfter,
      iterations: result.iterations,
      adjustmentCount: result.adjustments.length,
      stopReason: result.stopReason,
      lockedItemCount: lockedItemKeys.length,
    },
  });

  // Devolve as refeições no mesmo formato do plano salvo (não DraftMeal) —
  // a UI do editor persistido trabalha com MealPlanMealPayload, nunca com o
  // shape do wizard.
  const optimizedMeals = plan.meals.map((meal, mealIndex) => ({
    ...meal,
    items: meal.items.map((item, itemIndex) => {
      const draftItem = result.meals[mealIndex]?.items[itemIndex];
      if (!draftItem) return item;
      return { ...item, quantity: draftItem.quantity };
    }),
  }));

  return NextResponse.json({
    meals: optimizedMeals,
    nutritionBefore: result.nutritionBefore,
    nutritionAfter: result.nutritionAfter,
    scoreBefore: result.scoreBefore,
    scoreAfter: result.scoreAfter,
    iterations: result.iterations,
    stopReason: result.stopReason,
    adjustments: result.adjustments,
    activeTargets: result.activeTargets,
  });
}
