import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { refineMealPlanDraft } from "@/lib/ai/agents/nutrition/meal-plan-draft-agent";
import { AiConfigError, AiProviderError, AiValidationError } from "@/lib/ai/core/ai-errors";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";
import { draftMealSchema, draftTargetSchema } from "@/lib/validators/draft-schemas";
import { calculateDraftNutrition } from "@/lib/nutrition/draft-nutrition";
import { critiqueDraft } from "@/lib/nutrition/draft-critic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RefineDraftSchema = z.object({
  instruction: z.string().min(1).max(400),
  currentMeals: z.array(draftMealSchema).min(1).max(10),
}).merge(draftTargetSchema).strict();

/**
 * Refina o RASCUNHO em memória por linguagem natural (seção 21 do pedido)
 * — nunca toca o plano real. O cliente reenvia o rascunho atual a cada
 * chamada porque nada foi persistido ainda; o limite de iterações fica a
 * cargo da UI (contador simples, evita loop infinito sem precisar de
 * estado novo no backend).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const limit = await consumeRateLimit(req, {
    scope: "ai-meal-plan-draft-refine",
    limit: 40,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ message: "Muitas solicitações. Tente novamente mais tarde.", retryAfter: limit.retryAfter }, { status: 429 });
  }

  const parsed = RefineDraftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    const draft = await refineMealPlanDraft({
      clientId: id,
      adminId: admin.sub,
      currentMeals: parsed.data.currentMeals,
      instruction: parsed.data.instruction,
    });
    const target = { energyKcal: parsed.data.targetEnergyKcal, proteinG: parsed.data.targetProteinG, carbohydrateG: parsed.data.targetCarbohydrateG, fatG: parsed.data.targetFatG };
    const [nutrition, critic] = await Promise.all([
      calculateDraftNutrition(draft.meals, target),
      Promise.resolve(critiqueDraft(draft.meals)),
    ]);
    await writeAuditLog({
      action: "ai_meal_plan_draft_refined",
      adminId: admin.sub,
      entityType: "client",
      entityId: id,
      ipHash: limit.ipHash,
      metadata: { mealsAfter: draft.meals.length, warnings: draft.warnings.length, criticFindings: critic.length },
    });
    return NextResponse.json({ ...draft, nutrition, critic });
  } catch (cause) {
    if (cause instanceof AiConfigError) {
      return NextResponse.json({ message: "Configure um provedor de IA em Configurações antes de usar este recurso." }, { status: 409 });
    }
    if (cause instanceof AiProviderError) {
      // Mensagem real do provedor (nunca stack trace/dado clinico — o
      // gateway ja controla isso) em vez de um texto generico que esconde
      // a causa raiz.
      return NextResponse.json({ message: cause.message }, { status: 502 });
    }
    if (cause instanceof AiValidationError) {
      return NextResponse.json({ message: cause.message }, { status: 422 });
    }
    const message = cause instanceof Error ? cause.message : "Não foi possível aplicar o ajuste.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
