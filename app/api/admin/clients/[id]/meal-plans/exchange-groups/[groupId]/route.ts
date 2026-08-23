import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import {
  getExchangeGroupById,
  approveAlternatives,
  rejectAlternative,
  editAlternativeQuantity,
  addManualAlternative,
  deleteExchangeGroup,
} from "@/lib/repositories/exchange-groups";
import { getClientMealPlans } from "@/lib/repositories/meal-plans";
import { getFoodByReference, type FoodCatalogSource } from "@/lib/nutrition/food-catalog";
import { calculateItemNutrients } from "@/lib/nutrition/nutrients";
import { findFoodSubstitutes } from "@/lib/nutrition/substitution-engine";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FASE 7 (item 13/16) — ações sobre um grupo de troca já gerado.
 * `approveAlternatives` é o ÚNICO caminho que produz estado APPROVED —
 * esta rota é o único lugar do app que a chama (nunca o código de IA,
 * lib/ai/**, que só gera grupos com aiSuggested:true, sempre SUGGESTED).
 */
const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), alternativeIds: z.array(z.string()).min(1) }),
  z.object({
    action: z.literal("reject"),
    alternativeId: z.string(),
    reason: z.enum(["CULINARY_MISMATCH", "NUTRITION_MISMATCH", "PATIENT_PREFERENCE", "MEAL_CONTEXT", "TOO_SIMILAR", "NOT_PRACTICAL", "OTHER"]).optional(),
  }),
  z.object({ action: z.literal("edit_quantity"), alternativeId: z.string(), quantityGrams: z.number().positive().max(5000) }),
  z.object({
    action: z.literal("add_manual"),
    source: z.enum(["TACO", "COMPLEMENTARY", "CUSTOM", "MANUFACTURER", "USDA", "TBCA", "IBGE_POF"]),
    sourceId: z.string().min(1).max(160),
    canonicalId: z.string().max(160).nullable().optional(),
    quantityGrams: z.number().positive().max(5000).optional(),
  }),
]);

async function recordExchangeReviewAction(input: {
  adminId: string;
  groupId: string;
  event: "SUGGESTION_APPROVED" | "SUGGESTION_REJECTED" | "SUGGESTION_EDITED" | "SUGGESTION_REPLACED_MANUALLY";
  generationMode: string | null;
  candidateCount: number;
  reviewedSuggestionCount?: number;
  reviewedCandidateRefs?: string[];
  rejectionReason?: string | null;
  approvedCount?: number;
  rejectedCount?: number;
  editedCount?: number;
  manuallyAddedCount?: number;
}) {
  await writeAuditLog({
    action: input.event,
    adminId: input.adminId,
    entityType: "exchange_group",
    entityId: input.groupId,
    metadata: {
      exchangeGroupId: input.groupId,
      strategyUsed: input.generationMode ?? "ENGINE_ONLY",
      candidateCount: input.candidateCount,
      reviewedSuggestionCount: input.reviewedSuggestionCount ?? 1,
      reviewedCandidateRefs: input.reviewedCandidateRefs ?? [],
      rejectionReason: input.rejectionReason ?? null,
      approvedCount: input.approvedCount ?? 0,
      rejectedCount: input.rejectedCount ?? 0,
      editedCount: input.editedCount ?? 0,
      manuallyAddedCount: input.manuallyAddedCount ?? 0,
    },
  }).catch(() => undefined);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; groupId: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id, groupId } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const limit = await consumeRateLimit(req, { scope: "exchange-group-action", limit: 120, windowMs: 60 * 60 * 1000, blockMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ message: "Muitas solicitações. Tente novamente mais tarde.", retryAfter: limit.retryAfter }, { status: 429 });
  }

  const existing = await getExchangeGroupById(groupId);
  if (!existing) return NextResponse.json({ message: "Grupo de troca não encontrado." }, { status: 404 });
  const plans = await getClientMealPlans(id);
  if (!plans.some((plan) => plan.id === existing.group.meal_plan_id)) {
    return NextResponse.json({ message: "Grupo de troca não encontrado." }, { status: 404 });
  }

  const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const input = parsed.data;

  if (input.action === "approve") {
    const reviewed = existing.alternatives.filter((alternative) => input.alternativeIds.includes(alternative.id));
    // Nunca aprova um id que não pertence a este grupo (aplicado dentro de approveAlternatives via AND exchange_group_id).
    await approveAlternatives(groupId, input.alternativeIds);
    await recordExchangeReviewAction({
      adminId: admin.sub,
      groupId,
      event: "SUGGESTION_APPROVED",
      generationMode: existing.group.exchange_generation_mode,
      candidateCount: existing.alternatives.length,
      reviewedSuggestionCount: reviewed.length,
      reviewedCandidateRefs: reviewed.map((alternative) => `${alternative.food_source}:${alternative.food_ref_id}`),
      approvedCount: input.alternativeIds.length,
    });
  } else if (input.action === "reject") {
    const reviewed = existing.alternatives.find((alternative) => alternative.id === input.alternativeId);
    await rejectAlternative(groupId, input.alternativeId);
    await recordExchangeReviewAction({
      adminId: admin.sub,
      groupId,
      event: "SUGGESTION_REJECTED",
      generationMode: existing.group.exchange_generation_mode,
      candidateCount: existing.alternatives.length,
      reviewedCandidateRefs: reviewed ? [`${reviewed.food_source}:${reviewed.food_ref_id}`] : [],
      rejectionReason: input.reason ?? null,
      rejectedCount: 1,
    });
  } else if (input.action === "edit_quantity") {
    // item 16 — edição SEMPRE recalcula pela engine oficial, nunca só troca o número na tela.
    const alt = existing.alternatives.find((a) => a.id === input.alternativeId);
    if (!alt) return NextResponse.json({ message: "Alternativa não encontrada neste grupo." }, { status: 404 });
    const details = await getFoodByReference({ source: alt.food_source as FoodCatalogSource, sourceId: alt.food_ref_id });
    if (!details) return NextResponse.json({ message: "Não foi possível revalidar este alimento contra o catálogo atual." }, { status: 422 });
    const { values } = calculateItemNutrients(String(input.quantityGrams), "g", details.macroReference);
    await editAlternativeQuantity(groupId, input.alternativeId, input.quantityGrams, {
      energyKcal: values.energyKcal, proteinG: values.proteinG, carbohydrateG: values.carbohydrateG, fatG: values.fatG, fiberG: values.fiberG ?? null,
    });
    await recordExchangeReviewAction({
      adminId: admin.sub,
      groupId,
      event: "SUGGESTION_EDITED",
      generationMode: existing.group.exchange_generation_mode,
      candidateCount: existing.alternatives.length,
      reviewedCandidateRefs: [`${alt.food_source}:${alt.food_ref_id}`],
      editedCount: 1,
    });
  } else if (input.action === "add_manual") {
    const ref = { source: input.source, sourceId: input.sourceId, canonicalId: input.canonicalId ?? null };
    const details = await getFoodByReference(ref);
    if (!details) return NextResponse.json({ message: "Alimento não encontrado no catálogo." }, { status: 404 });
    const primaryDetails = await getFoodByReference({
      source: existing.group.primary_food_source as FoodCatalogSource,
      sourceId: existing.group.primary_food_ref_id,
      canonicalId: existing.group.primary_canonical_food_id,
    });
    const calculated = input.quantityGrams
      ? { quantityGrams: input.quantityGrams, nutrition: calculateItemNutrients(String(input.quantityGrams), "g", details.macroReference).values }
      : primaryDetails
        ? (findFoodSubstitutes({
            baseFood: primaryDetails.macroReference,
            baseGrams: existing.group.primary_quantity_grams,
            candidates: [details.macroReference],
            mode: "nutritional",
            limit: 1,
          })[0] ?? findFoodSubstitutes({
            baseFood: primaryDetails.macroReference,
            baseGrams: existing.group.primary_quantity_grams,
            candidates: [details.macroReference],
            mode: "energy",
            limit: 1,
          })[0])
        : null;
    if (!calculated) {
      return NextResponse.json({ message: "Não foi possível calcular uma quantidade equivalente adequada para este alimento." }, { status: 422 });
    }
    await addManualAlternative(groupId, {
      ref,
      food: details.macroReference,
      quantityGrams: calculated.quantityGrams,
      nutrition: {
        energyKcal: calculated.nutrition.energyKcal,
        proteinG: calculated.nutrition.proteinG,
        carbohydrateG: calculated.nutrition.carbohydrateG,
        fatG: calculated.nutrition.fatG,
        fiberG: calculated.nutrition.fiberG ?? null,
      },
    });
    await recordExchangeReviewAction({
      adminId: admin.sub,
      groupId,
      event: "SUGGESTION_REPLACED_MANUALLY",
      generationMode: existing.group.exchange_generation_mode,
      candidateCount: existing.alternatives.length,
      reviewedCandidateRefs: [`${input.source}:${input.sourceId}`],
      manuallyAddedCount: 1,
    });
  }

  const updated = await getExchangeGroupById(groupId);
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; groupId: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id, groupId } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const existing = await getExchangeGroupById(groupId);
  if (existing) {
    const plans = await getClientMealPlans(id);
    if (!plans.some((plan) => plan.id === existing.group.meal_plan_id)) {
      return NextResponse.json({ message: "Grupo de troca não encontrado." }, { status: 404 });
    }
  }
  await deleteExchangeGroup(groupId);
  await writeAuditLog({
    action: "SUGGESTION_REPLACED_MANUALLY",
    adminId: admin.sub,
    entityType: "exchange_group",
    entityId: groupId,
    metadata: {
      exchangeGroupId: groupId,
      strategyUsed: existing?.group.exchange_generation_mode ?? "ENGINE_ONLY",
      candidateCount: existing?.alternatives.length ?? 0,
      reviewedSuggestionCount: existing?.alternatives.length ?? 0,
      reviewedCandidateRefs: existing?.alternatives.map((alternative) => `${alternative.food_source}:${alternative.food_ref_id}`) ?? [],
      deletedAllSuggestions: true,
      approvedCount: 0,
      rejectedCount: 0,
      editedCount: 0,
      manuallyAddedCount: 0,
    },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
