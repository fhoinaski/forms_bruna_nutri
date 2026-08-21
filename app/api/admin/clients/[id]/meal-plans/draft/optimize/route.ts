import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { draftMealSchema, draftTargetSchema } from "@/lib/validators/draft-schemas";
import { MEAL_KEYS } from "@/lib/nutrition/draft-types";
import { optimizeDraftToTargetV2, type OptimizerTargetKey } from "@/lib/nutrition/draft-optimizer-v2";
import { calculateDraftNutrition } from "@/lib/nutrition/draft-nutrition";
import { critiqueDraft } from "@/lib/nutrition/draft-critic";
import { writeAuditLog } from "@/lib/security/audit";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPTIMIZER_TARGET_KEYS = ["energy", "protein", "carbohydrate", "fat", "fiber"] as const;

const OptimizeDraftSchema = z.object({
  currentMeals: z.array(draftMealSchema).min(1).max(10),
  // Fibra é opcional e exclusiva do optimizer V2 (seção 34: só entra se
  // explicitamente informada — o schema de meta compartilhado com
  // gerar/refinar/regenerar não tem esse campo de propósito).
  targetFiberG: z.number().positive().max(200).nullable().optional(),
  // "Ajustar apenas proteína/energia" (seção 25) — nunca inventa um eixo
  // sem meta real, mesmo se pedido aqui (o optimizer filtra de novo internamente).
  activeTargets: z.array(z.enum(OPTIMIZER_TARGET_KEYS)).max(5).optional(),
  // Itens/refeições que a nutricionista marcou pra não mexer (seções 30/31).
  lockedItemKeys: z.array(z.string().max(20)).max(200).optional(),
  lockedMealKeys: z.array(z.enum(MEAL_KEYS)).max(6).optional(),
  // Distribuição energética opcional por refeição (seções 7-8) — nunca obrigatória.
  mealDistribution: z.array(z.object({ mealKey: z.enum(MEAL_KEYS), percentage: z.number().min(0).max(100) })).max(6).optional(),
}).merge(draftTargetSchema).strict();

/**
 * "✨ Aproximar das metas nutricionais" (evolução da seção 23 do pedido
 * original) — NUNCA chama o LLM. Optimizer V2: busca local determinística
 * multi-objetivo (energia+proteína+carboidrato+gordura+fibra opcional),
 * nunca troca alimento, nunca inventa item novo, resultado final sempre
 * revalidado pela engine real antes de responder
 * (lib/nutrition/draft-optimizer-v2.ts). Nunca persiste — devolve o
 * rascunho ajustado pra revisão, igual a qualquer outra etapa do wizard.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const limit = await consumeRateLimit(req, {
    scope: "meal-plan-draft-optimize",
    limit: 60,
    windowMs: 60 * 60 * 1000,
    blockMs: 15 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ message: "Muitas solicitações. Tente novamente mais tarde.", retryAfter: limit.retryAfter }, { status: 429 });
  }

  const parsed = OptimizeDraftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const startedAt = Date.now();
  const target = {
    energyKcal: parsed.data.targetEnergyKcal,
    proteinG: parsed.data.targetProteinG,
    carbohydrateG: parsed.data.targetCarbohydrateG,
    fatG: parsed.data.targetFatG,
    fiberG: parsed.data.targetFiberG ?? null,
  };
  const optimized = await optimizeDraftToTargetV2(parsed.data.currentMeals, target, {
    activeTargets: parsed.data.activeTargets as OptimizerTargetKey[] | undefined,
    lockedItemKeys: parsed.data.lockedItemKeys,
    lockedMealKeys: parsed.data.lockedMealKeys,
    mealDistribution: parsed.data.mealDistribution,
  });
  const [nutrition, critic] = await Promise.all([
    calculateDraftNutrition(optimized.meals, target),
    Promise.resolve(critiqueDraft(optimized.meals)),
  ]);

  // Observabilidade (seção 58) — nunca dado clínico bruto, só contagens/flags.
  await writeAuditLog({
    action: "ai_meal_plan_draft_optimized",
    adminId: admin.sub,
    entityType: "client",
    entityId: id,
    ipHash: limit.ipHash,
    metadata: {
      optimizerVersion: "v2",
      targetsActive: optimized.activeTargets,
      scoreBefore: optimized.scoreBefore,
      scoreAfter: optimized.scoreAfter,
      iterations: optimized.iterations,
      adjustmentCount: optimized.adjustments.length,
      stopReason: optimized.stopReason,
      durationMs: Date.now() - startedAt,
    },
  });

  return NextResponse.json({
    meals: optimized.meals,
    warnings: [],
    nutrition,
    critic,
    optimizer: {
      version: "v2",
      nutritionBefore: optimized.nutritionBefore,
      nutritionAfter: optimized.nutritionAfter,
      scoreBefore: optimized.scoreBefore,
      scoreAfter: optimized.scoreAfter,
      iterations: optimized.iterations,
      stopReason: optimized.stopReason,
      adjustments: optimized.adjustments,
      activeTargets: optimized.activeTargets,
    },
  });
}
