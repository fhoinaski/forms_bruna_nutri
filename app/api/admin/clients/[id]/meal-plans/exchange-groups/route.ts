import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { listPatientClinicalMarkers } from "@/lib/repositories/patient-clinical-markers";
import { checkFoodAgainstPatientRestrictions } from "@/lib/clinical/food-safety";
import { getFoodByReference } from "@/lib/nutrition/food-catalog";
import { generateAndSaveExchangeGroup, listExchangeGroupsForPlan, type ExchangeGroupRow, type ExchangeAlternativeRow } from "@/lib/repositories/exchange-groups";
import type { ExchangeGroupCandidate } from "@/lib/nutrition/food-exchange-engine";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  primaryQuantityGrams: z.number().positive().max(5000),
  allowCrossGroup: z.boolean().optional(),
  limit: z.number().int().min(1).max(10).optional(),
  aiSuggested: z.boolean().optional(),
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

  const parsed = GenerateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const input = parsed.data;

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

  const result = await generateAndSaveExchangeGroup({
    mealPlanId: input.mealPlanId,
    primaryFood: primaryDetails.macroReference,
    primaryRef,
    primaryGrams: input.primaryQuantityGrams,
    allowCrossGroup: input.allowCrossGroup,
    isRestricted,
    limit: input.limit,
    aiSuggested: input.aiSuggested,
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

  const groups: Array<{ group: ExchangeGroupRow; alternatives: ExchangeAlternativeRow[] }> = await listExchangeGroupsForPlan(mealPlanId);
  return NextResponse.json({ groups });
}
