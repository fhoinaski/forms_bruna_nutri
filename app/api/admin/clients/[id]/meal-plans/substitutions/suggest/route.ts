import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getFoodByReference, sourceFromMacroReference, toPersistedMealFoodSource, type FoodReference } from "@/lib/nutrition/food-catalog";
import { toDisplayFoodName, type FoodResolution } from "@/lib/nutrition/food-resolver";
import { resolveFoodCandidatesWithCanonicalShadow } from "@/lib/nutrition/canonical-food-shadow";
import { listPatientClinicalMarkers } from "@/lib/repositories/patient-clinical-markers";
import { findFoodSubstitutes, type EquivalenceMode } from "@/lib/nutrition/substitution-engine";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SuggestSubstitutionsSchema = z.object({
  baseFoodSource: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA"]),
  baseFoodRefId: z.string().min(1).max(120),
  baseQuantity: z.number().positive().max(5000),
  mode: z.enum(["energy", "nutritional"]),
  // Nomes de alimentos candidatos — digitados manualmente pela nutricionista
  // ("Adicionar manualmente" / "Buscar") ou vindos do endpoint suggest-ai
  // (nomes puros, NUNCA número calculado pela IA). Cada um passa pelo MESMO
  // resolver rigoroso do catálogo (nunca escolhe ambíguo sozinho — seção 14).
  candidateQueries: z.array(z.string().min(1).max(160)).min(1).max(15),
}).strict();

/**
 * Substitution Engine — sugestão DETERMINÍSTICA de alimentos equivalentes
 * (seções 3/13 do pedido): nunca chama IA aqui. Resolve cada candidato
 * proposto (manual ou vindo de suggest-ai) contra o catálogo real com o
 * MESMO resolver rigoroso já usado pelo assistente de pré-plano — nunca
 * escolhe um alimento ambíguo sozinho — e só então calcula quantidade
 * equivalente + score pela engine oficial. Nada é persistido aqui; a
 * nutricionista escolhe quais resultados viram substituição de verdade e
 * salva pelo fluxo normal de edição do plano (versionado, com
 * expectedVersion), exatamente como qualquer outra mudança no plano.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const limit = await consumeRateLimit(req, {
    scope: "meal-plan-substitution-suggest",
    limit: 60,
    windowMs: 60 * 60 * 1000,
    blockMs: 15 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ message: "Muitas solicitações. Tente novamente mais tarde.", retryAfter: limit.retryAfter }, { status: 429 });
  }

  const parsed = SuggestSubstitutionsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const input = parsed.data;

  const baseRef: FoodReference = { source: input.baseFoodSource, sourceId: input.baseFoodRefId };
  const baseDetails = await getFoodByReference(baseRef);
  if (!baseDetails) {
    return NextResponse.json({ message: "Alimento prescrito não encontrado no catálogo." }, { status: 404 });
  }

  const markers = await listPatientClinicalMarkers(id);
  const resolutions = await resolveFoodCandidatesWithCanonicalShadow(
    input.candidateQueries.map((query, index) => ({ query, key: String(index) })),
    markers,
    undefined,
    "substitutions"
  );

  const needsReview: { query: string; status: FoodResolution["status"]; reason: string; candidates: FoodResolution["candidates"] }[] = [];
  const resolvedCandidates: { ref: FoodReference; name: string }[] = [];
  for (const [, resolution] of resolutions) {
    if (resolution.status === "RESOLVED") {
      resolvedCandidates.push({ ref: resolution.ref!, name: resolution.name! });
    } else {
      // AMBIGUOUS/NOT_FOUND/CLINICAL_CONFLICT/CLINICAL_UNKNOWN nunca viram
      // substituição sozinhos — precisam de revisão humana (seções 14/20).
      needsReview.push({ query: resolution.query, status: resolution.status, reason: resolution.reason, candidates: resolution.candidates });
    }
  }

  const candidateDetails = await Promise.all(resolvedCandidates.map((c) => getFoodByReference(c.ref)));
  const candidateFoods = candidateDetails.filter((d): d is NonNullable<typeof d> => Boolean(d));

  const results = findFoodSubstitutes({
    baseFood: baseDetails.macroReference,
    baseGrams: input.baseQuantity,
    candidates: candidateFoods.map((d) => d.macroReference),
    mode: input.mode as EquivalenceMode,
  });

  await writeAuditLog({
    action: "meal_plan_substitution_suggested",
    adminId: admin.sub,
    entityType: "client",
    entityId: id,
    ipHash: limit.ipHash,
    metadata: {
      mode: input.mode,
      candidatesRequested: input.candidateQueries.length,
      candidatesResolved: resolvedCandidates.length,
      needsReview: needsReview.length,
      resultsReturned: results.length,
    },
  });

  return NextResponse.json({
    baseFood: { displayName: toDisplayFoodName(baseDetails.macroReference.descricao), ref: baseRef },
    results: results
      .map((result) => ({ result, persistedSource: toPersistedMealFoodSource(sourceFromMacroReference(result.food)) }))
      // Só fontes que a engine/persistência realmente suportam num item de
      // plano (TACO/CUSTOM/MANUFACTURER) — nunca inventa suporte a USDA
      // aqui, que não tem lookup por refId no lado de escrita (seção 8).
      .filter((entry): entry is { result: (typeof results)[number]; persistedSource: NonNullable<typeof entry.persistedSource> } => Boolean(entry.persistedSource))
      .map(({ result, persistedSource }) => ({
        foodSource: persistedSource,
        foodRefId: String(result.food.numero ?? ""),
        displayName: toDisplayFoodName(result.food.descricao),
        quantityGrams: result.quantityGrams,
        nutrition: result.nutrition,
        mode: result.mode,
        score: result.score,
        quality: result.quality,
        sameCategory: result.sameCategory,
      })),
    needsReview,
  });
}
