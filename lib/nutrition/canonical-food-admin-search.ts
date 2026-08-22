import { createHash } from "node:crypto";
import { getFoodByReference, toLegacyFoodSearchResponseItem, type LegacyFoodSearchResponseItem } from "@/lib/nutrition/food-catalog";
import { toDisplayFoodName } from "@/lib/nutrition/food-terminology";
import { resolveCanonicalFood } from "@/lib/nutrition/canonical-food-resolver";
import { computeV2Features, canUseCanonical } from "@/lib/nutrition/canonical-food-shadow";
import { canAutoResolveCanonicalV2 } from "@/lib/nutrition/canonical-confidence-v2";
import { getPortions } from "@/lib/repositories/canonical-foods";
import { getCanonicalFoodResolverModeForScope } from "@/lib/nutrition/canonical-food-resolver-flag";
import type { CanonicalDbExecutor, CanonicalPortionSummary } from "@/lib/nutrition/canonical-food-search";
import type { MatchClass, PreparationEvidence } from "@/lib/nutrition/canonical-confidence-features";
import type { CanonicalFoodSource } from "@/lib/nutrition-import/types";
import { logger } from "@/lib/observability/logger";

/**
 * FASE 6 (item 3) — PILOTO 1: busca administrativa. Envolve
 * app/api/admin/foods/search/route.ts (searchFoods, intocado) com o
 * resolver canônico no escopo `admin_food_search` — NUNCA muda cálculo:
 * quando a V2 autoriza, so REORDENA/marca qual candidato já presente (ou
 * buscável via getFoodByReference) é o mais confiável; o item selecionado
 * continua sendo um `FoodReference` TACO válido, salvo pelo MESMO fluxo de
 * sempre (PUT do plano inteiro, food_source/food_ref_id inalterados).
 *
 * Escopo restrito a fontes canônicas TACO (item 4/5): TBCA/IBGE_POF não
 * têm equivalente em `food_source` (enum fixo: TACO/CUSTOM/MANUFACTURER/
 * USDA) — promovê-las exigiria mudança de schema incompatível, fora do
 * "não fazer ainda". Candidatos não-TACO aparecem só na anotação
 * `canonicalPilot` (informativo), nunca reordenam a lista.
 */

export interface CanonicalPilotAnnotation {
  policyVersion: "V2";
  matchClass: MatchClass;
  confidenceDecision: { autoAccept: boolean; reason: string };
  preparationEvidence: PreparationEvidence;
  sourceAgreement: { count: number; strength: number };
  canonicalFoodId: string;
  source: CanonicalFoodSource;
  sourceFoodId: string;
  displayName: string;
  /** true só quando prefer_canonical + V2 autorizou + fonte TACO + o item foi de fato movido pro topo da lista. */
  preselected: boolean;
  /** FASE 6 (item 10) — medidas caseiras reais do alimento canônico, só quando preselected (nunca busca porções de candidato não usado). */
  portions?: CanonicalPortionSummary[];
}

export interface AdminSearchPilotResult {
  items: LegacyFoodSearchResponseItem[];
  canonicalPilot: CanonicalPilotAnnotation | null;
}

function hashQuery(query: string): string {
  return createHash("sha256").update(query.trim().toLowerCase()).digest("hex").slice(0, 16);
}

function moveToFront<T>(items: T[], index: number): T[] {
  if (index <= 0) return items;
  const copy = [...items];
  const [item] = copy.splice(index, 1);
  copy.unshift(item);
  return copy;
}

export interface AdminSearchPilotContext {
  /** So pra testes — injeta o executor SQLite local no lugar do d1Query real. Nunca usado em producao. */
  db?: CanonicalDbExecutor;
}

/**
 * FASE 6 (item 15) — `baselineItems` aceita um Promise (nao so o array ja
 * resolvido): a rota chama searchFoods() e este pilot em paralelo
 * (Promise.all implicito aqui dentro), nunca em serie — a primeira versao
 * deste pilot awaitava searchFoods ANTES de comecar a resolucao canonica,
 * dobrando a latencia real (~700ms medido vs ~350ms de cada lado
 * separado). O resultado do canonico so PRECISA do baseline no fim, pra
 * reordenar — nunca pra decidir o veredito da V2.
 */
export async function annotateAdminFoodSearchWithCanonicalPilot(
  query: string,
  baselineItemsOrPromise: LegacyFoodSearchResponseItem[] | Promise<LegacyFoodSearchResponseItem[]>,
  context: AdminSearchPilotContext = {}
): Promise<AdminSearchPilotResult> {
  const mode = getCanonicalFoodResolverModeForScope("admin_food_search");
  if (mode === "off") return { items: await baselineItemsOrPromise, canonicalPilot: null };

  // FASE 6 (item 4) — fallback obrigatorio: qualquer erro do canonico
  // (D1, timeout, bug de parsing) nunca quebra a busca real — devolve a
  // lista original intocada, so loga o erro. Roda em PARALELO com o
  // baseline (Promise.allSettled — nunca deixa um erro no canonico
  // derrubar o baseline, nem o contrario).
  const [baselineItems, canonicalSettled] = await Promise.all([
    Promise.resolve(baselineItemsOrPromise),
    resolveCanonicalFood(query, { limit: 8, db: context.db }).then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
  ]);
  if (!canonicalSettled.ok) {
    logger.warn("canonical_admin_search_pilot_error", { queryHash: hashQuery(query), message: canonicalSettled.error instanceof Error ? canonicalSettled.error.message : String(canonicalSettled.error) });
    return { items: baselineItems, canonicalPilot: null };
  }
  const canonical = canonicalSettled.value;

  const top = canonical.selected ?? canonical.candidates[0] ?? null;
  const features = computeV2Features(query, canonical);
  if (!top || !features) {
    // NOT_FOUND, ou nenhum candidato — fallback automatico (item 4).
    logger.info("canonical_admin_search_pilot", { queryHash: hashQuery(query), mode, canonicalStatus: canonical.status, preselected: false });
    return { items: baselineItems, canonicalPilot: null };
  }
  const verdict = canAutoResolveCanonicalV2(features);

  const annotation: CanonicalPilotAnnotation = {
    policyVersion: "V2",
    matchClass: features.matchClass,
    confidenceDecision: { autoAccept: verdict.autoAccept, reason: verdict.reason },
    preparationEvidence: features.preparationEvidence,
    sourceAgreement: { count: features.sourceAgreementCount, strength: features.sourceAgreementStrength },
    canonicalFoodId: top.foodId,
    source: top.source,
    sourceFoodId: top.sourceFoodId,
    displayName: toDisplayFoodName(top.name),
    preselected: false,
  };

  let items = baselineItems;
  // FASE 6 (item 4): qualquer bloqueio da V2 (AMBIGUOUS/PREPARATION_REVIEW/
  // VARIETY_REQUIRED/conflito de marca ou composto/preparo fraco/query
  // generica — todos já cobertos por verdict.autoAccept=false) e QUALQUER
  // fonte que não seja TACO caem automaticamente no fallback: a lista
  // original nunca é reordenada, só a anotação informativa é preenchida.
  if (mode === "prefer_canonical" && verdict.autoAccept && top.source === "TACO") {
    const idx = baselineItems.findIndex((it) => it.ref.source === "TACO" && it.ref.sourceId === top.sourceFoodId);
    if (idx >= 0) {
      items = moveToFront(baselineItems, idx);
      annotation.preselected = true;
    } else {
      // Candidato confiante mas fora do top-N do searchFoods atual (limite
      // de resultados diferente) — busca direto pela referência real, nunca
      // inventa um item; se a fonte TACO não tiver mais esse id, cai pro
      // fallback normal sem quebrar nada.
      const details = await getFoodByReference({ source: "TACO", sourceId: top.sourceFoodId });
      if (details) {
        items = [toLegacyFoodSearchResponseItem(details), ...baselineItems];
        annotation.preselected = true;
      }
    }
    if (annotation.preselected) {
      // item 10 — medidas caseiras reais, so do alimento de fato preselecionado.
      annotation.portions = await getPortions(top.foodId, context.db);
    }
  }

  logger.info("canonical_admin_search_pilot", {
    queryHash: hashQuery(query),
    mode,
    canonicalStatus: canonical.status,
    matchClass: annotation.matchClass,
    // so telemetria/comparacao (item 1) — nunca usado pra decidir preselected acima.
    v1WouldAutoAccept: canUseCanonical({ status: canonical.status, score: top.score, gapToSecond: features.gapToSecond, preparationConflict: features.preparationConflict }),
    v2AutoAccept: verdict.autoAccept,
    preselected: annotation.preselected,
  });

  return { items, canonicalPilot: annotation };
}
