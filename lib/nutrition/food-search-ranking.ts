import { extractPreparation } from "@/lib/nutrition/food-preparation";
import { normalizeFoodText } from "@/lib/nutrition/food-terminology";
import type { FoodSearchResultViewModel, FoodSearchSourceCode } from "@/lib/nutrition/food-search-view-model";

export type FoodSearchRankingFeature =
  | "EXACT_NORMALIZED_NAME"
  | "PREFIX_MATCH"
  | "ALL_QUERY_TOKENS"
  | "CONTAINS_MATCH"
  | "PREPARATION_MATCH"
  | "PREPARATION_MISMATCH"
  | "HAS_COMMON_PORTION"
  | "CONCISE_BASE_FOOD";

export type RankedFoodSearchResult = FoodSearchResultViewModel & {
  rankingScore: number;
  rankingFeatures: FoodSearchRankingFeature[];
};

const SOURCE_TIEBREAK: Record<FoodSearchSourceCode, number> = {
  TBCA: 0,
  IBGE_POF: 1,
  TACO: 2,
  USDA: 3,
  CUSTOM: 4,
  MANUFACTURER: 5,
  COMPLEMENTARY: 6,
};

const PREPARATION_STEMS: Record<string, string> = {
  RAW: "cru",
  COOKED: "cozid",
  GRILLED: "grelhad",
  ROASTED: "assad",
  FRIED: "frit",
  SCRAMBLED: "mexid",
  STEAMED: "vapor",
  PUREED: "pure",
};

function tokens(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean);
}

function normalize(value: string): string {
  return normalizeFoodText(value).replace(/[.,;:()/\\_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function candidatePreparationText(item: FoodSearchResultViewModel): string {
  return normalize(`${item.preparation ?? ""} ${item.displayName}`);
}

/**
 * Deterministic, source-agnostic relevance scoring for the F4 view model.
 * Source is deliberately excluded from the score and used only after textual
 * relevance ties, so a partial Brazilian result cannot hide an exact USDA one.
 */
export function rankFoodSearchResults(query: string, candidates: FoodSearchResultViewModel[]): RankedFoodSearchResult[] {
  const normalizedQuery = normalize(query);
  const queryTokens = tokens(query);
  const requestedPreparation = extractPreparation(query).preparation;
  return candidates.map((item) => {
    const normalizedName = normalize(item.displayName);
    const itemTokens = tokens(item.displayName);
    const features: FoodSearchRankingFeature[] = [];
    let score = 0;
    if (normalizedName === normalizedQuery) {
      score += 100;
      features.push("EXACT_NORMALIZED_NAME");
    } else if (normalizedName.startsWith(normalizedQuery)) {
      score += 70;
      features.push("PREFIX_MATCH");
    } else if (queryTokens.length && queryTokens.every((token) => itemTokens.some((itemToken) => itemToken.includes(token) || token.includes(itemToken)))) {
      score += 45;
      features.push("ALL_QUERY_TOKENS");
    } else if (normalizedName.includes(normalizedQuery)) {
      score += 25;
      features.push("CONTAINS_MATCH");
    }
    // Para buscas curtas e amplas (ex.: "pão", "arroz", "leite"), uma
    // opção-base é mais útil para começar o cardápio do que uma preparação
    // muito específica. A preferência é só de ordenação: nada é ocultado.
    if (queryTokens.length === 1 && (normalizedName === normalizedQuery || normalizedName.startsWith(`${normalizedQuery} `))) {
      const extraWords = Math.max(0, itemTokens.length - queryTokens.length);
      const conciseBonus = Math.max(0, 18 - extraWords * 3);
      if (conciseBonus > 0) {
        score += conciseBonus;
        features.push("CONCISE_BASE_FOOD");
      }
    }
    if (requestedPreparation) {
      const target = PREPARATION_STEMS[requestedPreparation] ?? "";
      const preparation = candidatePreparationText(item);
      const hasKnownPreparation = Object.values(PREPARATION_STEMS).some((stem) => preparation.includes(stem));
      if (target && preparation.includes(target)) {
        score += 30;
        features.push("PREPARATION_MATCH");
      } else if (hasKnownPreparation) {
        score -= 25;
        features.push("PREPARATION_MISMATCH");
      }
    }
    if (item.availablePortions.some((portion) => !portion.isFallback && portion.gramWeight !== null)) {
      score += 2;
      features.push("HAS_COMMON_PORTION");
    }
    return { ...item, rankingScore: score, rankingFeatures: features };
  }).sort((a, b) => b.rankingScore - a.rankingScore
    || SOURCE_TIEBREAK[a.sourceCode] - SOURCE_TIEBREAK[b.sourceCode]
    || normalize(a.displayName).localeCompare(normalize(b.displayName), "pt-BR")
    || (a.canonicalFoodId ?? a.sourceFoodId).localeCompare(b.canonicalFoodId ?? b.sourceFoodId));
}
