import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { generateMealPlanDraft, MEAL_KEYS } from "@/lib/ai/agents/nutrition/meal-plan-draft-agent";
import { AiConfigError, AiProviderError, AiValidationError } from "@/lib/ai/core/ai-errors";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";
import { calculateDraftNutrition } from "@/lib/nutrition/draft-nutrition";
import { critiqueDraft } from "@/lib/nutrition/draft-critic";
import { draftMealSchema } from "@/lib/validators/draft-schemas";
import { recordStageTiming, takeStageTimings } from "@/lib/ai/gateway/e2e-stage-timings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/).nullable();

const GenerateDraftSchema = z.object({
  objectiveLabel: z.string().min(1).max(160),
  targetEnergyKcal: z.number().positive().max(20000).nullable(),
  targetProteinG: z.number().positive().max(2000).nullable(),
  targetCarbohydrateG: z.number().positive().max(2000).nullable(),
  targetFatG: z.number().positive().max(2000).nullable(),
  requestedMeals: z.array(z.object({ key: z.enum(MEAL_KEYS), suggestedTime: timeSchema })).min(1).max(6),
  prioritizeFoods: z.string().max(400).nullable(),
  avoidFoods: z.string().max(400).nullable(),
  useRecipes: z.boolean(),
  /** Botão manual "Gerar refeição por refeição" no wizard (seção 20 do pedido de robustez) — pula direto pro fallback menor em vez de tentar o plano completo de novo. */
  forceMealByMeal: z.boolean().optional(),
  /**
   * R5 (seção 24) — "Usar plano anterior como base": refeições NÃO
   * selecionadas do plano de origem, passadas só como contexto de
   * variedade pro Copilot (mesmo parâmetro que `regenerateMealInDraft` já
   * usa internamente) — nunca usado pra decidir o que persistir.
   */
  otherMealsContext: z.array(draftMealSchema).max(6).optional(),
  /** R5.1 (seção 4) — opt-in explícito: sem isto, o Copilot continua gerando só SIMPLE (comportamento anterior, sem regressão). */
  allowFlexibleStructure: z.boolean().optional(),
}).strict();

/**
 * Gera um PRÉ-PLANO (nunca persiste, nunca ativa — quem chama decide se
 * carrega o resultado no editor). Nada é gravado no banco por esta rota:
 * o resultado só vira um MealPlan real quando a nutricionista clicar
 * "Salvar rascunho" no editor de sempre (PUT /meal-plans/[planId]).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const limit = await consumeRateLimit(req, {
    scope: "ai-meal-plan-draft",
    limit: 20,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ message: "Muitas solicitações. Tente novamente mais tarde.", retryAfter: limit.retryAfter }, { status: 429 });
  }

  const parsed = GenerateDraftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const generationStartedAt = Date.now();
  try {
    const draft = await generateMealPlanDraft({ clientId: id, adminId: admin.sub, ...parsed.data });
    // Calcula o draft ANTES de responder (seção 9 do pedido: "o draft deve
    // ser calculável ANTES de aplicar", nunca só depois de ir pro editor)
    // — mesma engine central, nunca uma fórmula própria; e roda o critic
    // determinístico (nunca altera o draft, só aponta o que revisar).
    const target = { energyKcal: parsed.data.targetEnergyKcal, proteinG: parsed.data.targetProteinG, carbohydrateG: parsed.data.targetCarbohydrateG, fatG: parsed.data.targetFatG };
    const nutritionStartedAt = Date.now();
    const [nutrition, critic] = await Promise.all([
      calculateDraftNutrition(draft.meals, target),
      Promise.resolve(critiqueDraft(draft.meals)),
    ]);
    recordStageTiming(id, { nutritionMs: Date.now() - nutritionStartedAt });
    // Test-only (Clinical Copilot R1.2.6, seção 42-56): stage timings
    // separadas de geração/resolução/nutrição, só quando E2E_TEST_MODE=1 —
    // takeStageTimings() é sempre undefined em produção, então o campo abaixo
    // nunca aparece na resposta real.
    const stageTimingsMs = takeStageTimings(id);
    // Observabilidade (seção 35 do pedido de robustez) — nunca contexto
    // clínico bruto, só contagens e flags: permite medir taxa de sucesso e
    // uso de fallback ao longo do tempo sem tocar em dado do paciente.
    await writeAuditLog({
      action: "ai_meal_plan_draft_generated",
      adminId: admin.sub,
      entityType: "client",
      entityId: id,
      ipHash: limit.ipHash,
      metadata: {
        mealCountRequested: parsed.data.requestedMeals.length,
        mealCountGenerated: draft.meals.length,
        warnings: draft.warnings.length,
        useRecipes: parsed.data.useRecipes,
        criticFindings: critic.length,
        fallbackUsed: draft.fallbackUsed ?? "none",
        durationMs: Date.now() - generationStartedAt,
      },
    });
    return NextResponse.json(stageTimingsMs ? { ...draft, nutrition, critic, stageTimingsMs } : { ...draft, nutrition, critic });
  } catch (cause) {
    if (cause instanceof AiConfigError) {
      return NextResponse.json({ message: "Configure um provedor de IA em Configurações antes de usar este recurso." }, { status: 409 });
    }
    if (cause instanceof AiProviderError) {
      // Surfacar a mensagem real do provedor (ex.: "demorou demais para
      // responder", erro de rate limit/API) — nunca so um texto generico
      // que esconde a causa raiz tanto do usuario quanto de quem for
      // diagnosticar depois. AiProviderError.message ja e curta e
      // controlada pelo proprio gateway (nunca stack trace, nunca dado
      // clinico), mesma convencao ja usada por /api/admin/ai/suggest-meal.
      // O wizard (AiMealPlanWizard.tsx) ja prefixa "Não foi possível gerar
      // o pré-plano: " sozinho — aqui devolve so o detalhe, sem duplicar.
      return NextResponse.json({ message: cause.message }, { status: 502 });
    }
    if (cause instanceof AiValidationError) {
      // Esse ponto só é alcançado depois que generateMealPlanDraft JÁ
      // tentou recuperação parcial e fallback refeição-por-refeição
      // internamente (seção 42, critério 8) — é o último recurso mesmo.
      await writeAuditLog({
        action: "ai_meal_plan_draft_failed",
        adminId: admin.sub,
        entityType: "client",
        entityId: id,
        ipHash: limit.ipHash,
        outcome: "failure",
        metadata: {
          failureCategory: cause.failureCategory,
          structuredFailureReason: cause.reason,
          truncated: cause.truncated,
          issues: cause.issues ? JSON.stringify(cause.issues).slice(0, 2000) : null,
          durationMs: Date.now() - generationStartedAt,
        },
      });
      // Mensagem simples pro usuário (seção 20) — o código granular só vai
      // no campo `reason`, que o wizard só mostra fora de produção.
      return NextResponse.json(
        {
          message: "Não conseguimos estruturar o pré-plano nesta tentativa. Nenhuma alteração foi salva.",
          reason: cause.reason,
        },
        { status: 422 }
      );
    }
    const message = cause instanceof Error ? cause.message : "Não foi possível gerar o pré-plano.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
