import {
  canonicalFoodSearch,
  resolveQueryPreparation,
  type CanonicalDbExecutor,
  type CanonicalFoodSearchResult,
  type CanonicalPortionSummary,
} from "@/lib/nutrition/canonical-food-search";
import { getPortions } from "@/lib/repositories/canonical-foods";
import type { PreparationCode } from "@/lib/nutrition/food-preparation";
import type { CanonicalFoodSource } from "@/lib/nutrition-import/types";

/**
 * FASE 3 (item 12) — Canonical Resolver Bridge. Funcao NOVA, isolada,
 * NUNCA chamada por lib/nutrition/food-resolver.ts (o resolver ATIVO) ou
 * por qualquer rota de producao nesta rodada — so por
 * scripts/canonical-nutrition-import/shadow-compare.ts e pelos testes desta
 * fase (ver "NAO FAZER AINDA" no pedido).
 */

export type CanonicalResolutionStatus = "EXACT" | "RESOLVED" | "AMBIGUOUS" | "PREPARATION_REVIEW" | "NOT_FOUND";

export interface CanonicalResolutionContext {
  db?: CanonicalDbExecutor;
  sourcePreference?: CanonicalFoodSource[];
  preparation?: string | null;
  limit?: number;
}

export interface CanonicalFoodResolution {
  status: CanonicalResolutionStatus;
  query: string;
  selected?: CanonicalFoodSearchResult;
  candidates: CanonicalFoodSearchResult[];
  canonicalFoodId?: string;
  source?: CanonicalFoodSource;
  sourceFoodId?: string;
  preparation?: PreparationCode | null;
  portions?: CanonicalPortionSummary[];
  reason: string;
}

/** Diferenca minima de score pra considerar um vencedor "claro" (item 9: nunca escolher silenciosamente quando candidatos relevantes tem score muito proximo). */
const DECISIVE_SCORE_GAP = 8;

const EXACT_METHODS = new Set(["EXACT_NAME", "ALIAS_EXACT"]);

function toSelection(result: CanonicalFoodSearchResult): Pick<CanonicalFoodResolution, "canonicalFoodId" | "source" | "sourceFoodId" | "portions"> {
  return {
    canonicalFoodId: result.foodId,
    source: result.source,
    sourceFoodId: result.sourceFoodId,
    portions: result.portions,
  };
}

/** FASE 4.5 (item 7) — so busca portions do vencedor final decisivo, nunca dos candidatos de um AMBIGUOUS/PREPARATION_REVIEW. */
async function withPortions(result: CanonicalFoodSearchResult, db?: CanonicalDbExecutor): Promise<CanonicalFoodSearchResult> {
  const portions = await getPortions(result.foodId, db);
  return { ...result, portions };
}

/**
 * Resolve uma query contra o catalogo CANONICO (TBCA+TACO+POF reais).
 * Nunca funde fontes, nunca escolhe silenciosamente entre candidatos
 * proximos (item 15: sem cross-source merge; item 9: estados de resolucao).
 */
export async function resolveCanonicalFood(query: string, context: CanonicalResolutionContext = {}): Promise<CanonicalFoodResolution> {
  const queryPreparation = resolveQueryPreparation({ query, preparation: context.preparation });
  const results = await canonicalFoodSearch({
    query,
    preparation: context.preparation,
    limit: Math.max(8, context.limit ?? 8),
    sourcePreference: context.sourcePreference,
    db: context.db,
  });
  // FASE 4.5 (item 7) — canonicalFoodSearch nao busca portions por padrao
  // (ver lib/nutrition/canonical-food-search.ts). resolveCanonicalFood so
  // precisa de portions do vencedor final (status EXACT/RESOLVED), nunca
  // dos ate 5 candidatos de um estado AMBIGUOUS/PREPARATION_REVIEW — entao
  // buscamos so 1 portion, so quando de fato ha um vencedor decisivo,
  // preservando a reducao de round-trips em vez de reverter pra buscar
  // portions de todos os N resultados de novo.

  if (results.length === 0) {
    return { status: "NOT_FOUND", query, candidates: [], preparation: queryPreparation, reason: `"${query}" não encontrado no catálogo canônico (TBCA+TACO+POF).` };
  }

  const [top, second] = results;
  const gap = second ? top.score - second.score : Infinity;
  const decisive = gap >= DECISIVE_SCORE_GAP;

  // Preparo pedido, mas NENHUM candidato realmente satisfaz esse preparo
  // (todos com scoreBreakdown.preparationScore <= 0) — o alimento base
  // existe, so nao nessa preparacao especifica. Nunca escolhe a preparacao
  // "mais parecida" sozinho (ex.: "tilapia assada" quando so ha "grelhada"/
  // "crua" na TBCA).
  if (queryPreparation && results.every((r) => r.scoreBreakdown.preparationScore <= 0)) {
    return {
      status: "PREPARATION_REVIEW",
      query,
      candidates: results.slice(0, 5),
      preparation: queryPreparation,
      reason: `"${query}" não tem uma correspondência exata para a preparação pedida — candidatos com outra preparação foram encontrados, nenhum escolhido automaticamente.`,
    };
  }

  if (decisive && EXACT_METHODS.has(top.matchMethod)) {
    const selected = await withPortions(top, context.db);
    return {
      status: "EXACT",
      query,
      selected,
      candidates: [],
      preparation: queryPreparation,
      reason: "",
      ...toSelection(selected),
    };
  }

  if (decisive) {
    const selected = await withPortions(top, context.db);
    return {
      status: "RESOLVED",
      query,
      selected,
      candidates: [],
      preparation: queryPreparation,
      reason: "",
      ...toSelection(selected),
    };
  }

  return {
    status: "AMBIGUOUS",
    query,
    candidates: results.slice(0, 5),
    preparation: queryPreparation,
    reason: `"${query}" tem mais de uma correspondência plausível no catálogo canônico — nenhuma foi escolhida automaticamente (diferença de score menor que ${DECISIVE_SCORE_GAP}).`,
  };
}
