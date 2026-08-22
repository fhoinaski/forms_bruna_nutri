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
import { getFoodByReference, type FoodCatalogSource } from "@/lib/nutrition/food-catalog";
import { calculateItemNutrients } from "@/lib/nutrition/nutrients";
import { consumeRateLimit } from "@/lib/security/rate-limit";

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
  z.object({ action: z.literal("reject"), alternativeId: z.string() }),
  z.object({ action: z.literal("edit_quantity"), alternativeId: z.string(), quantityGrams: z.number().positive().max(5000) }),
  z.object({
    action: z.literal("add_manual"),
    source: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA", "TBCA", "IBGE_POF"]),
    sourceId: z.string().min(1).max(160),
    canonicalId: z.string().max(160).nullable().optional(),
    quantityGrams: z.number().positive().max(5000),
  }),
]);

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

  const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const input = parsed.data;

  if (input.action === "approve") {
    // Nunca aprova um id que não pertence a este grupo (aplicado dentro de approveAlternatives via AND exchange_group_id).
    await approveAlternatives(groupId, input.alternativeIds);
  } else if (input.action === "reject") {
    await rejectAlternative(groupId, input.alternativeId);
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
  } else if (input.action === "add_manual") {
    const ref = { source: input.source, sourceId: input.sourceId, canonicalId: input.canonicalId ?? null };
    const details = await getFoodByReference(ref);
    if (!details) return NextResponse.json({ message: "Alimento não encontrado no catálogo." }, { status: 404 });
    const { values } = calculateItemNutrients(String(input.quantityGrams), "g", details.macroReference);
    await addManualAlternative(groupId, {
      ref,
      food: details.macroReference,
      quantityGrams: input.quantityGrams,
      nutrition: { energyKcal: values.energyKcal, proteinG: values.proteinG, carbohydrateG: values.carbohydrateG, fatG: values.fatG, fiberG: values.fiberG ?? null },
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

  await deleteExchangeGroup(groupId);
  return NextResponse.json({ ok: true });
}
