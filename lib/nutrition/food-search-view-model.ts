import { toDisplayFoodName } from "@/lib/nutrition/food-terminology";
import { canonicalFoodSearch, type CanonicalFoodSearchResult, type CanonicalPortionSummary } from "@/lib/nutrition/canonical-food-search";
import { getSearchPreviews, type CanonicalNutrientValue } from "@/lib/repositories/canonical-foods";
import type { LegacyFoodSearchResponseItem } from "@/lib/nutrition/food-catalog";
import { rankFoodSearchResults } from "@/lib/nutrition/food-search-ranking";

export type FoodSearchSourceCode = "TACO" | "TBCA" | "IBGE_POF" | "USDA" | "CUSTOM" | "MANUFACTURER" | "COMPLEMENTARY";

export type FoodSearchPortion = {
  id: string | null;
  label: string;
  gramWeight: number | null;
  isFallback: boolean;
};

export type FoodSearchNutrientsPreview = {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
};

export type FoodSearchResultViewModel = {
  canonicalFoodId: string | null;
  displayName: string;
  sourceName: string;
  sourceCode: FoodSearchSourceCode;
  sourceFoodId: string;
  preparation: string | null;
  group: string | null;
  defaultPortion: FoodSearchPortion;
  availablePortions: FoodSearchPortion[];
  nutrientsPreview: FoodSearchNutrientsPreview;
  matchInfo: { rank: number; method: string };
};

const SOURCE_NAMES: Record<FoodSearchSourceCode, string> = {
  TACO: "TACO",
  TBCA: "TBCA",
  IBGE_POF: "IBGE",
  USDA: "USDA",
  CUSTOM: "Meus alimentos",
  MANUFACTURER: "Marca",
  COMPLEMENTARY: "Complementar",
};

function fallbackPortion(): FoodSearchPortion {
  return { id: null, label: "100 g", gramWeight: 100, isFallback: true };
}

function toPortion(portion: CanonicalPortionSummary): FoodSearchPortion {
  return { id: portion.id, label: portion.label, gramWeight: portion.gramWeight ?? portion.parsedLabelGrams, isFallback: false };
}

function chooseDefaultPortion(portions: FoodSearchPortion[]): FoodSearchPortion {
  return portions.find((portion) => portion.gramWeight !== null && /unidade|colher|xicara|xícara|fatia|concha/i.test(portion.label))
    ?? portions.find((portion) => portion.gramWeight !== null)
    ?? fallbackPortion();
}

function canonicalSource(source: string): FoodSearchSourceCode {
  return source as Extract<FoodSearchSourceCode, "TACO" | "TBCA" | "IBGE_POF">;
}

function legacySource(item: LegacyFoodSearchResponseItem): FoodSearchSourceCode {
  const source = item.ref?.source;
  if (source === "TACO" || source === "TBCA" || source === "IBGE_POF" || source === "USDA" || source === "CUSTOM" || source === "MANUFACTURER" || source === "COMPLEMENTARY") return source;
  return item.fonte === "usda" ? "USDA" : item.fonte === "manufacturer" ? "MANUFACTURER" : item.fonte === "custom" ? "CUSTOM" : item.fonte === "complementar" ? "COMPLEMENTARY" : "TACO";
}

function legacyViewModel(item: LegacyFoodSearchResponseItem): FoodSearchResultViewModel {
  const sourceCode = legacySource(item);
  const sourceFoodId = item.ref?.sourceId ?? String(item.numero);
  const portion = fallbackPortion();
  return {
    canonicalFoodId: item.ref?.canonicalId ?? null,
    displayName: item.displayName ?? item.name ?? item.descricao,
    sourceName: item.sourceLabel ?? SOURCE_NAMES[sourceCode],
    sourceCode,
    sourceFoodId,
    preparation: null,
    group: item.group ?? item.grupo ?? null,
    defaultPortion: portion,
    availablePortions: [portion],
    nutrientsPreview: { energyKcal: item.energyKcal ?? null, proteinG: item.proteinG ?? null, carbohydrateG: item.carbohydrateG ?? null, fatG: item.fatG ?? null },
    matchInfo: { rank: 5, method: "LEGACY" },
  };
}

function nutrientValue(rows: CanonicalNutrientValue[], code: string): number | null {
  const row = rows.find((value) => value.nutrientCode === code);
  return row?.status === "reported" ? row.value : null;
}

function canonicalViewModel(result: CanonicalFoodSearchResult, portionRows: CanonicalPortionSummary[], nutrientRows: CanonicalNutrientValue[]): FoodSearchResultViewModel {
  const portions = portionRows.map(toPortion);
  const sourceCode = canonicalSource(result.source);
  return {
    canonicalFoodId: result.foodId,
    displayName: toDisplayFoodName(result.name),
    sourceName: SOURCE_NAMES[sourceCode],
    sourceCode,
    sourceFoodId: result.sourceFoodId,
    preparation: result.preparation?.name ?? result.preparation?.method ?? null,
    group: result.classification?.group ?? null,
    defaultPortion: chooseDefaultPortion(portions),
    availablePortions: portions.length ? portions : [fallbackPortion()],
    nutrientsPreview: {
      energyKcal: nutrientValue(nutrientRows, "ENERGY_KCAL"),
      proteinG: nutrientValue(nutrientRows, "PROTEIN"),
      carbohydrateG: nutrientValue(nutrientRows, "CARBOHYDRATE"),
      fatG: nutrientValue(nutrientRows, "TOTAL_FAT"),
    },
    matchInfo: { rank: result.matchMethod === "EXACT_NAME" ? 0 : result.matchMethod === "ALIAS_EXACT" ? 1 : result.matchMethod === "PREFIX" ? 2 : 3, method: result.matchMethod },
  };
}

/** Server-side F4 search response. Source identity is deliberately part of the key: similar names from TBCA and IBGE remain separate choices. */
export async function buildMultiSourceFoodSearch(query: string, legacyItems: LegacyFoodSearchResponseItem[], limit = 24): Promise<FoodSearchResultViewModel[]> {
  // The legacy endpoint remains available when the canonical store is not yet
  // configured (local tests and controlled rollout). A search enhancement must
  // never turn a reference-data outage into a blocked Meal Plan editor.
  const candidateLimit = Math.min(50, Math.max(limit * 3, 40));
  const canonicalResults = (await canonicalFoodSearch({ query, limit: candidateLimit }).catch(() => []))
    .filter((result) => typeof result.foodId === "string" && typeof result.name === "string" && typeof result.sourceFoodId === "string");
  const previews = await getSearchPreviews(canonicalResults.map((result) => result.foodId));
  const canonicalItems = canonicalResults.map((result) => canonicalViewModel(result, previews.portionsByFoodId.get(result.foodId) ?? [], previews.nutrientsByFoodId.get(result.foodId) ?? []));
  const bySourceIdentity = new Map<string, FoodSearchResultViewModel>();
  for (const item of [...legacyItems.map(legacyViewModel), ...canonicalItems]) {
    const key = `${item.sourceCode}:${item.sourceFoodId}`;
    // Canonical rows carry preparation and official portions, so they supersede
    // the legacy representation of the same source identity only.
    bySourceIdentity.set(key, item);
  }
  return rankFoodSearchResults(query, [...bySourceIdentity.values()])
    .slice(0, limit)
    .map(({ rankingScore: _rankingScore, rankingFeatures: _rankingFeatures, ...item }) => item);
}
