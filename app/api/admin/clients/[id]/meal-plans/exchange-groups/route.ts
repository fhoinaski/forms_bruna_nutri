import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { listPatientClinicalMarkers } from "@/lib/repositories/patient-clinical-markers";
import { checkFoodAgainstPatientRestrictions } from "@/lib/clinical/food-safety";
import { getFoodByReference } from "@/lib/nutrition/food-catalog";
import { generateAndSaveExchangeGroup, listExchangeGroupsForPlan, NoEligibleExchangeAlternativesError, type ExchangeGroupRow, type ExchangeAlternativeRow } from "@/lib/repositories/exchange-groups";
import { generateExchangeGroupsForMealPlanItems, getClientMealPlans, resolveMealPlanItemIdentity } from "@/lib/repositories/meal-plans";
import type { ExchangeGroupCandidate } from "@/lib/nutrition/food-exchange-engine";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function recordExchangePilotTelemetry(input: {
  adminId: string;
  mealPlanId: string;
  mealPlanItemId?: string | null;
  primaryRef: { source: string; sourceId: string; canonicalId?: string | null };
  mealContext?: string | null;
  result: Awaited<ReturnType<typeof generateAndSaveExchangeGroup>>;
  regenerated?: boolean;
}) {
  await writeAuditLog({
    action: input.regenerated ? "ALTERNATIVES_REGENERATED" : "SUGGESTION_SHOWN",
    adminId: input.adminId,
    entityType: "exchange_group",
    entityId: input.result.group.id,
    metadata: {
      exchangeGroupId: input.result.group.id,
      mealPlanId: input.mealPlanId,
      mealPlanItemId: input.mealPlanItemId ?? null,
      strategyRequested: input.result.strategyRequested,
      strategyUsed: input.result.strategyUsed,
      fallback: input.result.strategyUsed === "ENGINE_ONLY" && input.result.strategyRequested !== "ENGINE_ONLY",
      fallbackReason: input.result.fallbackReason,
      fallbackCategory: categorizeFallback(input.result.fallbackReason),
      mealContext: input.mealContext ?? null,
      foodGroup: input.result.classification.foodGroup,
      culinaryRole: input.result.classification.culinaryRole,
      primaryFoodReference: `${input.primaryRef.source}:${input.primaryRef.sourceId}`,
      candidateCount: input.result.alternatives.length,
      curatedCandidateCount: input.result.alternatives.filter((alt) => alt.candidate_origin !== "AUTOMATIC_ENGINE").length,
      automaticCandidateCount: input.result.alternatives.filter((alt) => alt.candidate_origin === "AUTOMATIC_ENGINE").length,
      candidateRefs: input.result.alternatives.map((alt) => `${alt.food_source}:${alt.food_ref_id}`),
      engineShadowCandidateRefs: input.result.shadowComparison?.engineRefs ?? [],
      pilotCandidateRefs: input.result.shadowComparison?.globalRankRefs ?? [],
      durationMs: input.result.durationMs,
      shadowComparison: input.result.shadowComparison ?? null,
    },
  }).catch(() => undefined);
}

function categorizeFallback(reason: Awaited<ReturnType<typeof generateAndSaveExchangeGroup>>["fallbackReason"]) {
  if (!reason) return null;
  if (reason === "NO_CURATED_LIST") return "NO_CURATED_LIST";
  if (reason === "GLOBAL_RANK_EMPTY" || reason === "CURATED_FIRST_EMPTY") return "NO_GOOD_CURATED_CANDIDATES";
  if (reason === "GLOBAL_RANK_ERROR" || reason === "CURATED_FIRST_ERROR") return "RUNTIME_ERROR";
  if (reason === "PILOT_ADMIN_NOT_ALLOWED") return "UNSUPPORTED_CONTEXT";
  if (reason === "MODE_OFF" || reason === "MODE_SHADOW") return "OTHER";
  return "OTHER";
}

async function hasExistingExchangeGroup(input: {
  mealPlanId: string;
  primaryRef: { source: string; sourceId: string };
  primaryGrams: number;
}) {
  const groups = await listExchangeGroupsForPlan(input.mealPlanId).catch(() => []);
  return groups.some(({ group }) =>
    group.primary_food_source === input.primaryRef.source
    && group.primary_food_ref_id === input.primaryRef.sourceId
    && Math.abs(group.primary_quantity_grams - input.primaryGrams) < 0.1
  );
}

/**
 * FASE 7 (itens 11/17) — gera (POST) e lista (GET) grupos de troca pra um
 * plano. A geração SEMPRE roda o motor determinístico
 * (generateExchangeGroupAlternatives) — nunca a IA calculando nada (item
 * 12); quando chamada a partir do Substitution Agent, o body só carrega
 * `aiSuggested: true` como metadado de origem, nunca um número calculado
 * pela IA.
 */
const GenerateSchema = z.object({
  mealPlanId: z.string().min(1),
  primaryFoodSource: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA", "TBCA", "IBGE_POF"]),
  primaryFoodRefId: z.string().min(1).max(160),
  primaryCanonicalFoodId: z.string().max(160).nullable().optional(),
  mealPlanItemId: z.string().min(1).optional(),
  primaryQuantityGrams: z.number().positive().max(5000),
  allowCrossGroup: z.boolean().optional(),
  limit: z.number().int().min(1).max(10).optional(),
  aiSuggested: z.boolean().optional(),
  mealName: z.string().max(120).nullable().optional(),
}).strict();

const GenerateAllSchema = z.object({
  mealPlanId: z.string().min(1),
  generateAll: z.literal(true),
  limit: z.number().int().min(1).max(10).optional(),
}).strict();

const ResolveAndGenerateSchema = z.object({
  mealPlanId: z.string().min(1),
  mealPlanItemId: z.string().min(1),
  primaryFoodName: z.string().min(1).max(300),
  primaryQuantityGrams: z.number().positive().max(5000),
  allowCrossGroup: z.boolean().optional(),
  limit: z.number().int().min(1).max(10).optional(),
  aiSuggested: z.boolean().optional(),
  mealName: z.string().max(120).nullable().optional(),
}).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const limit = await consumeRateLimit(req, { scope: "exchange-group-generate", limit: 60, windowMs: 60 * 60 * 1000, blockMs: 15 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ message: "Muitas solicitações. Tente novamente mais tarde.", retryAfter: limit.retryAfter }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsedAll = GenerateAllSchema.safeParse(body);
  if (parsedAll.success) {
    const plans = await getClientMealPlans(id);
    const plan = plans.find((item) => item.id === parsedAll.data.mealPlanId);
    if (!plan) return NextResponse.json({ message: "Plano alimentar não encontrado." }, { status: 404 });
    const result = await generateExchangeGroupsForMealPlanItems({ clientId: id, plan, approveGenerated: false, limit: parsedAll.data.limit ?? 5, ownerAdminId: admin.sub });
    const groups = await listExchangeGroupsForPlan(plan.id);
    await writeAuditLog({
      action: "meal_plan_exchange_generation_batch",
      adminId: admin.sub,
      entityType: "meal_plan",
      entityId: plan.id,
      metadata: { generated: result.generated, approved: result.approved, skipped: result.skipped },
    }).catch(() => undefined);
    return NextResponse.json({ ...result, groups });
  }

  const parsedResolve = ResolveAndGenerateSchema.safeParse(body);
  if (parsedResolve.success) {
    const resolved = await resolveMealPlanItemIdentity({
      clientId: id,
      mealPlanId: parsedResolve.data.mealPlanId,
      itemId: parsedResolve.data.mealPlanItemId,
      food: parsedResolve.data.primaryFoodName,
      adminId: admin.sub,
    });
    if (resolved.status !== "RESOLVED") {
      return NextResponse.json({
        code: "NEEDS_FOOD_CONFIRMATION",
        status: resolved.status,
        message: resolved.reason || "Confirme qual alimento do catálogo representa este item antes de gerar alternativas.",
        candidates: resolved.candidates,
      }, { status: 409 });
    }

    const primaryRef = { source: resolved.food_source, sourceId: resolved.food_ref_id, canonicalId: resolved.canonical_food_id };
    const primaryDetails = await getFoodByReference(primaryRef);
    if (!primaryDetails) {
      return NextResponse.json({ message: "Este alimento ainda não tem dados nutricionais suficientes pra gerar um grupo de troca (fonte sem cálculo automático nesta fase)." }, { status: 422 });
    }

    const markers = await listPatientClinicalMarkers(id);
    const isRestricted = (candidate: ExchangeGroupCandidate) =>
      checkFoodAgainstPatientRestrictions({ food: candidate.food, markers }).status === "conflict";

    let result: Awaited<ReturnType<typeof generateAndSaveExchangeGroup>>;
    const regenerated = await hasExistingExchangeGroup({
      mealPlanId: parsedResolve.data.mealPlanId,
      primaryRef,
      primaryGrams: parsedResolve.data.primaryQuantityGrams,
    });
    try {
      result = await generateAndSaveExchangeGroup({
        mealPlanId: parsedResolve.data.mealPlanId,
        primaryFood: primaryDetails.macroReference,
        primaryRef,
        primaryGrams: parsedResolve.data.primaryQuantityGrams,
        allowCrossGroup: parsedResolve.data.allowCrossGroup,
        isRestricted,
        limit: parsedResolve.data.limit,
        aiSuggested: parsedResolve.data.aiSuggested,
        mealName: parsedResolve.data.mealName,
        ownerAdminId: admin.sub,
      });
    } catch (error) {
      if (error instanceof NoEligibleExchangeAlternativesError) {
        return NextResponse.json({ code: "NO_ELIGIBLE_ALTERNATIVES", message: error.message }, { status: 422 });
      }
      throw error;
    }

    await recordExchangePilotTelemetry({
      adminId: admin.sub,
      mealPlanId: parsedResolve.data.mealPlanId,
      mealPlanItemId: parsedResolve.data.mealPlanItemId,
      primaryRef,
      mealContext: parsedResolve.data.mealName,
      result,
      regenerated,
    });
    return NextResponse.json({ ...result, resolvedItem: resolved });
  }

  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const input = parsed.data;
  const plans = await getClientMealPlans(id);
  const plan = plans.find((item) => item.id === input.mealPlanId);
  if (!plan) return NextResponse.json({ message: "Plano alimentar não encontrado." }, { status: 404 });

  const primaryRef = { source: input.primaryFoodSource, sourceId: input.primaryFoodRefId, canonicalId: input.primaryCanonicalFoodId ?? null };
  const primaryDetails = await getFoodByReference(primaryRef);
  if (!primaryDetails) {
    // FASE 6.5 (item 8) — fonte canônica (TBCA/IBGE_POF) ainda não tem
    // macroReference calculável via getFoodByReference (de propósito) —
    // sem um alimento principal com macro real, não há como congelar
    // targetNutrition nem gerar alternativas por comparação de nutrientes.
    return NextResponse.json({ message: "Este alimento ainda não tem dados nutricionais suficientes pra gerar um grupo de troca (fonte sem cálculo automático nesta fase)." }, { status: 422 });
  }

  const markers = await listPatientClinicalMarkers(id);
  const isRestricted = (candidate: ExchangeGroupCandidate) =>
    checkFoodAgainstPatientRestrictions({ food: candidate.food, markers }).status === "conflict";

  let result: Awaited<ReturnType<typeof generateAndSaveExchangeGroup>>;
  const regenerated = await hasExistingExchangeGroup({
    mealPlanId: input.mealPlanId,
    primaryRef,
    primaryGrams: input.primaryQuantityGrams,
  });
  try {
    result = await generateAndSaveExchangeGroup({
      mealPlanId: input.mealPlanId,
      primaryFood: primaryDetails.macroReference,
      primaryRef,
      primaryGrams: input.primaryQuantityGrams,
      allowCrossGroup: input.allowCrossGroup,
      isRestricted,
      limit: input.limit,
      aiSuggested: input.aiSuggested,
      mealName: input.mealName,
      ownerAdminId: admin.sub,
    });
  } catch (error) {
    if (error instanceof NoEligibleExchangeAlternativesError) {
      return NextResponse.json({ code: "NO_ELIGIBLE_ALTERNATIVES", message: error.message }, { status: 422 });
    }
    throw error;
  }

  await recordExchangePilotTelemetry({
    adminId: admin.sub,
    mealPlanId: input.mealPlanId,
    mealPlanItemId: input.mealPlanItemId ?? null,
    primaryRef,
    mealContext: input.mealName,
    result,
    regenerated,
  });
  return NextResponse.json(result);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const mealPlanId = req.nextUrl.searchParams.get("mealPlanId");
  if (!mealPlanId) return NextResponse.json({ message: "mealPlanId é obrigatório." }, { status: 400 });
  const plans = await getClientMealPlans(id);
  if (!plans.some((plan) => plan.id === mealPlanId)) {
    return NextResponse.json({ message: "Plano alimentar não encontrado." }, { status: 404 });
  }

  const groups: Array<{ group: ExchangeGroupRow; alternatives: ExchangeAlternativeRow[] }> = await listExchangeGroupsForPlan(mealPlanId);
  return NextResponse.json({ groups });
}
