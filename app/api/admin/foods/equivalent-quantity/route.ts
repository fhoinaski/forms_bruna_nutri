import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getFoodByReference, getFoodPortions } from "@/lib/nutrition/food-catalog";
import {
  computeEquivalentQuantity,
  rankEquivalentCandidates,
  matchHouseholdPortion,
  EQUIVALENT_QUANTITY_CRITERIA,
  type EquivalentQuantityCriterion,
  type EquivalentQuantityResult,
  type HouseholdPortionMatch,
} from "@/lib/nutrition/equivalent-quantity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ReferenceSchema = z.object({
  source: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA"]),
  refId: z.string().min(1).max(120),
}).strict();

const RequestSchema = z.object({
  referenceFood: ReferenceSchema,
  referenceGrams: z.number().finite().positive(),
  criterion: z.enum(EQUIVALENT_QUANTITY_CRITERIA as [EquivalentQuantityCriterion, ...EquivalentQuantityCriterion[]]),
  candidates: z.array(ReferenceSchema).min(1).max(30),
}).strict();

interface ComputedItem {
  ref: z.infer<typeof ReferenceSchema>;
  name: string | null;
  sourceLabel: string | null;
  sameCategory: boolean;
  result: EquivalentQuantityResult | null;
  householdPortion: HouseholdPortionMatch | null;
}

/**
 * Calcula em UMA chamada a quantidade equivalente (Motor de Substituição R3)
 * de vários candidatos contra uma única referência, pro critério escolhido
 * (energia/proteína/carboidrato/gordura) — nunca N+1: a drawer manda todos
 * os candidatos de uma vez (ver ExchangeGroupPanel), nunca um request por
 * candidato. Um candidato que não resolver no catálogo real volta com
 * `result: null` — nunca inventa um MacroReferenceFood fictício só pra
 * caber no contrato.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Requisição inválida." }, { status: 400 });
  const { referenceFood: referenceRef, referenceGrams, criterion, candidates } = parsed.data;

  const referenceDetails = await getFoodByReference({ source: referenceRef.source, sourceId: referenceRef.refId });
  if (!referenceDetails) return NextResponse.json({ message: "Alimento de referência não encontrado." }, { status: 404 });

  const uniqueCandidateRefs = Array.from(
    new Map(candidates.map((candidate) => [`${candidate.source}:${candidate.refId}`, candidate])).values()
  );

  const resolved = await Promise.all(
    uniqueCandidateRefs.map(async (candidateRef) => ({
      candidateRef,
      details: await getFoodByReference({ source: candidateRef.source, sourceId: candidateRef.refId }),
    }))
  );

  const computed: ComputedItem[] = await Promise.all(resolved.map(async ({ candidateRef, details }) => {
    if (!details) {
      return { ref: candidateRef, name: null, sourceLabel: null, sameCategory: false, result: null, householdPortion: null };
    }
    const result = computeEquivalentQuantity({
      referenceFood: referenceDetails.macroReference,
      referenceGrams,
      candidateFood: details.macroReference,
      criterion,
    });
    // Medida caseira só quando o cálculo convergiu (CALCULATED) — nunca
    // aproxima uma quantidade que nem foi possível calcular (seção 18/20).
    const householdPortion = result.status === "CALCULATED" && result.practicalCandidateQuantityGrams !== null
      ? matchHouseholdPortion(
          result.practicalCandidateQuantityGrams,
          (await getFoodPortions({ source: candidateRef.source, sourceId: candidateRef.refId })).map((portion) => ({
            id: portion.id,
            label: portion.label,
            gramWeight: portion.gramWeight ?? 0,
            confidence: portion.confidence,
          }))
        )
      : null;
    return {
      ref: candidateRef,
      name: details.name,
      sourceLabel: details.sourceLabel,
      sameCategory: Boolean(referenceDetails.macroReference.grupo) && details.macroReference.grupo === referenceDetails.macroReference.grupo,
      result,
      householdPortion,
    };
  }));

  const rankable = resolved
    .filter((entry): entry is typeof entry & { details: NonNullable<typeof entry.details> } => Boolean(entry.details))
    .map((entry) => {
      const item = computed.find((c) => c.ref.source === entry.candidateRef.source && c.ref.refId === entry.candidateRef.refId);
      return { candidateFood: entry.details.macroReference, result: item!.result as EquivalentQuantityResult };
    });
  const ranked = rankEquivalentCandidates(referenceDetails.macroReference, rankable);
  const rankIndex = new Map(ranked.map((entry, index) => [`${entry.candidateFood.fonte}:${entry.candidateFood.numero}`, index]));

  const items = computed
    .map((entry) => {
      const candidateNumero = resolved.find((r) => r.candidateRef.source === entry.ref.source && r.candidateRef.refId === entry.ref.refId)?.details?.macroReference;
      const rank = candidateNumero ? rankIndex.get(`${candidateNumero.fonte}:${candidateNumero.numero}`) ?? null : null;
      return { ...entry, rank };
    })
    .sort((a, b) => {
      if (a.rank === null && b.rank === null) return 0;
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      return a.rank - b.rank;
    });

  return NextResponse.json({
    criterion,
    referenceGrams,
    reference: { ref: referenceRef, name: referenceDetails.name, sourceLabel: referenceDetails.sourceLabel },
    items,
  });
}
