import { normalize, type MacroReferenceFood } from "@/lib/nutrition/macros";
import { TACO_REFERENCES, getTacoFoodByNumber } from "@/lib/nutrition/taco";
import { listCustomFoods, getCustomFoodById, toMacroReferenceFood, type CustomFood } from "@/lib/repositories/custom-foods";
import { listFoodPortions, type FoodPortion, type FoodPortionSource } from "@/lib/repositories/food-portions";
import { normalizePortionUnit, type UnifiedFoodPortion } from "@/lib/nutrition/portion-resolution";
import { getUsdaFoodBySourceId, searchUsdaFoods, toUsdaMacroReference, toUsdaSearchMacroReference, type UsdaFood, type UsdaFoodSearchRow } from "@/lib/repositories/usda-foods";

export type FoodCatalogSource = "TACO" | "COMPLEMENTARY" | "CUSTOM" | "MANUFACTURER" | "USDA" | "OPEN_FOOD_FACTS";
export type RuntimeFoodCatalogSource = "TACO" | "COMPLEMENTARY" | "CUSTOM" | "MANUFACTURER" | "USDA";
export type PersistedMealFoodSource = "TACO" | "CUSTOM" | "MANUFACTURER";

export interface FoodReference {
  source: FoodCatalogSource;
  sourceId: string;
  canonicalId?: string | null;
}

export interface FoodSearchResult {
  ref: FoodReference;
  name: string;
  brand?: string | null;
  group?: string | null;
  sourceLabel: string;
  energyKcal?: number | null;
  proteinG?: number | null;
  carbohydrateG?: number | null;
  fatG?: number | null;
  fiberG?: number | null;
}

export interface FoodDetails extends FoodSearchResult {
  macroReference: MacroReferenceFood;
}

export interface FoodCatalogSearchOptions {
  query: string;
  limit?: number;
  sources?: RuntimeFoodCatalogSource[];
}

export interface LegacyFoodSearchResponseItem extends MacroReferenceFood {
  numero: number | string;
  grupo: string;
  ref: FoodReference;
  sourceLabel: string;
  name: string;
  brand?: string | null;
  group?: string | null;
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

type Candidate = FoodDetails & {
  searchableTexts: string[];
  aliasTexts: string[];
  sourcePriority: number;
  sourceOrder: number;
  legacyKey: string;
};

const SOURCE_LABELS: Record<RuntimeFoodCatalogSource, string> = {
  TACO: "TACO",
  COMPLEMENTARY: "Complementar",
  CUSTOM: "Personalizado",
  MANUFACTURER: "Fabricante",
  USDA: "USDA",
};

const SOURCE_PRIORITY: Record<RuntimeFoodCatalogSource, number> = {
  TACO: 0,
  COMPLEMENTARY: 1,
  CUSTOM: 2,
  MANUFACTURER: 2,
  USDA: 4,
};

const MAX_LIMIT = 50;
const LOCAL_RESULTS_SUFFICIENT_FOR_USDA = 5;

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit ?? 20)));
}

export function sourceFromMacroReference(food: MacroReferenceFood): RuntimeFoodCatalogSource {
  if (food.fonte === "complementar") return "COMPLEMENTARY";
  if (food.fonte === "custom") return "CUSTOM";
  if (food.fonte === "manufacturer") return "MANUFACTURER";
  if (food.fonte === "usda") return "USDA";
  return "TACO";
}

export function toPersistedMealFoodSource(source: FoodCatalogSource): PersistedMealFoodSource | null {
  if (source === "CUSTOM" || source === "MANUFACTURER") return source;
  if (source === "TACO" || source === "COMPLEMENTARY") return "TACO";
  return null;
}

export function toFoodSearchResult(food: MacroReferenceFood, overrides: Partial<FoodSearchResult> = {}): FoodDetails {
  const source = sourceFromMacroReference(food);
  return {
    ref: { source, sourceId: String(food.numero ?? "") },
    name: food.descricao,
    brand: null,
    group: food.grupo ?? null,
    sourceLabel: SOURCE_LABELS[source],
    energyKcal: food.energia_kcal ?? null,
    proteinG: food.proteina_g ?? null,
    carbohydrateG: food.carboidrato_g ?? null,
    fatG: food.lipidios_g ?? null,
    fiberG: food.fibra_g ?? null,
    macroReference: food,
    ...overrides,
  };
}

function toCustomCandidate(row: CustomFood): Candidate {
  const macroReference = toMacroReferenceFood(row);
  const source: RuntimeFoodCatalogSource = row.source;
  return {
    ...toFoodSearchResult(macroReference, {
      ref: { source, sourceId: row.id },
      name: row.name,
      brand: row.brand,
      group: null,
      sourceLabel: SOURCE_LABELS[source],
    }),
    searchableTexts: [row.name, row.brand, row.brand ? `${row.name} ${row.brand}` : null].filter((value): value is string => Boolean(value)),
    aliasTexts: [row.brand].filter((value): value is string => Boolean(value)),
    sourcePriority: SOURCE_PRIORITY[source],
    sourceOrder: 100_000,
    legacyKey: `${source}:${row.id}`,
  };
}

async function toUsdaCandidate(row: UsdaFood | UsdaFoodSearchRow): Promise<Candidate | null> {
  const macroReference = "energy_kcal" in row ? toUsdaSearchMacroReference(row) : await toUsdaMacroReference(row);
  if (!macroReference) return null;
  return {
    ...toFoodSearchResult(macroReference, {
      ref: { source: "USDA", sourceId: row.source_id },
      name: row.original_name,
      brand: null,
      group: row.food_group,
      sourceLabel: SOURCE_LABELS.USDA,
    }),
    searchableTexts: [row.original_name],
    aliasTexts: [],
    sourcePriority: SOURCE_PRIORITY.USDA,
    sourceOrder: 200_000,
    legacyKey: `USDA:${row.source_id}`,
  };
}

function toMacroCandidate(food: MacroReferenceFood, sourceOrder = 0): Candidate {
  const source = sourceFromMacroReference(food);
  return {
    ...toFoodSearchResult(food),
    searchableTexts: [food.descricao],
    aliasTexts: [],
    sourcePriority: SOURCE_PRIORITY[source],
    sourceOrder,
    legacyKey: `${source}:${String(food.numero ?? "")}`,
  };
}

function scoreText(query: string, candidate: Candidate) {
  const normalizedQuery = normalize(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  let best: { rank: number; tokenMisses: number; distance: number } | null = null;

  const texts = candidate.searchableTexts.map((text) => normalize(text)).filter(Boolean);
  const aliases = candidate.aliasTexts.map((text) => normalize(text)).filter(Boolean);

  for (const text of texts) {
    let rank: number | null = null;
    if (text === normalizedQuery) rank = 0;
    else if (aliases.includes(normalizedQuery)) rank = 1;
    else if (text.startsWith(normalizedQuery)) rank = 2;
    else if (text.includes(normalizedQuery)) rank = 3;
    else if (queryTokens.length && queryTokens.every((token) => text.includes(token))) rank = 4;
    if (rank === null) continue;
    const tokenMisses = queryTokens.filter((token) => !text.includes(token)).length;
    const distance = Math.abs(text.length - normalizedQuery.length);
    const scored = { rank, tokenMisses, distance };
    if (!best || rank < best.rank || (rank === best.rank && tokenMisses < best.tokenMisses) || (rank === best.rank && tokenMisses === best.tokenMisses && distance < best.distance)) {
      best = scored;
    }
  }
  return best;
}

export async function searchFoods(options: FoodCatalogSearchOptions): Promise<FoodSearchResult[]> {
  const normalizedQuery = normalize(options.query);
  if (normalizedQuery.length < 2) return [];
  const limit = clampLimit(options.limit);
  const sourceFilter = new Set<RuntimeFoodCatalogSource>(options.sources ?? ["TACO", "COMPLEMENTARY", "CUSTOM", "MANUFACTURER", "USDA"]);

  const staticCandidates = TACO_REFERENCES
    .map((food, index) => toMacroCandidate(food, index))
    .filter((candidate) => sourceFilter.has(candidate.ref.source as RuntimeFoodCatalogSource));

  const shouldSearchCustom = sourceFilter.has("CUSTOM") || sourceFilter.has("MANUFACTURER");
  const customCandidates = shouldSearchCustom
    ? (await listCustomFoods(options.query)).map(toCustomCandidate).filter((candidate) => sourceFilter.has(candidate.ref.source as RuntimeFoodCatalogSource))
    : [];
  const byKey = new Map<string, Candidate>();
  for (const candidate of [...staticCandidates, ...customCandidates]) byKey.set(candidate.legacyKey, candidate);

  const scoredLocal = Array.from(byKey.values())
    .map((candidate) => {
      const score = scoreText(options.query, candidate);
      return score ? { candidate, score } : null;
    })
    .filter((item): item is { candidate: Candidate; score: { rank: number; tokenMisses: number; distance: number } } => Boolean(item));

  const explicitUsda = options.sources?.includes("USDA") ?? false;
  if (sourceFilter.has("USDA") && (explicitUsda || scoredLocal.length < LOCAL_RESULTS_SUFFICIENT_FOR_USDA)) {
    const usdaCandidates = (await Promise.all((await searchUsdaFoods(options.query, limit)).map(toUsdaCandidate))).filter((candidate): candidate is Candidate => Boolean(candidate));
    for (const candidate of usdaCandidates) byKey.set(candidate.legacyKey, candidate);
  }

  return Array.from(byKey.values())
    .map((candidate) => {
      const score = scoreText(options.query, candidate);
      return score ? { candidate, score } : null;
    })
    .filter((item): item is { candidate: Candidate; score: { rank: number; tokenMisses: number; distance: number } } => Boolean(item))
    .sort((a, b) =>
      a.score.rank - b.score.rank
      || a.score.tokenMisses - b.score.tokenMisses
      || a.candidate.sourcePriority - b.candidate.sourcePriority
      || a.candidate.sourceOrder - b.candidate.sourceOrder
      || a.score.distance - b.score.distance
      || (a.candidate.name.length - b.candidate.name.length)
      || a.candidate.name.localeCompare(b.candidate.name, "pt-BR")
    )
    .slice(0, limit)
    .map(({ candidate }) => ({
      ref: candidate.ref,
      name: candidate.name,
      brand: candidate.brand ?? null,
      group: candidate.group ?? null,
      sourceLabel: candidate.sourceLabel,
      energyKcal: candidate.energyKcal ?? null,
      proteinG: candidate.proteinG ?? null,
      carbohydrateG: candidate.carbohydrateG ?? null,
      fatG: candidate.fatG ?? null,
      fiberG: candidate.fiberG ?? null,
    }));
}

export async function getFoodByReference(ref: FoodReference): Promise<FoodDetails | null> {
  if (ref.source === "TACO" || ref.source === "COMPLEMENTARY") {
    const food = getTacoFoodByNumber(ref.sourceId);
    if (!food) return null;
    const actualSource = sourceFromMacroReference(food);
    if (ref.source === "COMPLEMENTARY" && actualSource !== "COMPLEMENTARY") return null;
    return toFoodSearchResult(food);
  }
  if (ref.source === "CUSTOM" || ref.source === "MANUFACTURER") {
    const food = await getCustomFoodById(ref.sourceId);
    if (!food || food.source !== ref.source) return null;
    return toFoodSearchResult(toMacroReferenceFood(food), {
      ref,
      name: food.name,
      brand: food.brand,
      group: null,
      sourceLabel: SOURCE_LABELS[ref.source],
    });
  }
  if (ref.source === "USDA") {
    const food = await getUsdaFoodBySourceId(ref.sourceId);
    if (!food) return null;
    const macroReference = await toUsdaMacroReference(food);
    if (!macroReference) return null;
    return toFoodSearchResult(macroReference, {
      ref,
      name: food.original_name,
      brand: null,
      group: food.food_group,
      sourceLabel: SOURCE_LABELS.USDA,
    });
  }
  return null;
}

function toUnifiedFoodPortion(portion: FoodPortion, ref: FoodReference): UnifiedFoodPortion {
  return {
    id: portion.id,
    foodRef: ref,
    label: portion.description,
    quantity: 1,
    unit: portion.description,
    unitKind: normalizePortionUnit(portion.description),
    gramWeight: portion.gram_equivalent,
    mlWeight: null,
    source: portion.source ?? "professional",
    provenance: portion.source_version,
    confidence: portion.confidence,
  };
}

export async function getFoodPortions(ref: FoodReference): Promise<UnifiedFoodPortion[]> {
  const persistedSource = toPersistedMealFoodSource(ref.source);
  if (!persistedSource) return [];
  const portions = persistedSource === "MANUFACTURER"
    ? await listFoodPortions("MANUFACTURER", ref.sourceId)
    : await listFoodPortions(persistedSource as FoodPortionSource, ref.sourceId);
  return portions.map((portion) => toUnifiedFoodPortion(portion, ref));
}

export function toLegacyFoodSearchResponseItem(result: FoodSearchResult): LegacyFoodSearchResponseItem {
  const macro = result.ref.source === "CUSTOM" || result.ref.source === "MANUFACTURER" || result.ref.source === "USDA"
    ? {
        numero: result.ref.sourceId,
        descricao: result.brand ? `${result.name} (${result.brand})` : result.name,
        grupo: result.group ?? "",
        fonte: result.ref.source === "MANUFACTURER" ? "manufacturer" as const : result.ref.source === "USDA" ? "usda" as const : "custom" as const,
        energia_kcal: result.energyKcal ?? 0,
        proteina_g: result.proteinG ?? 0,
        carboidrato_g: result.carbohydrateG ?? 0,
        lipidios_g: result.fatG ?? 0,
        fibra_g: result.fiberG ?? null,
      }
    : getTacoFoodByNumber(result.ref.sourceId);

  const fallbackFonte = result.ref.source === "COMPLEMENTARY" ? "complementar" : "taco";
  return {
    numero: macro?.numero ?? result.ref.sourceId,
    descricao: macro?.descricao ?? result.name,
    grupo: macro?.grupo ?? result.group ?? "",
    fonte: macro?.fonte ?? fallbackFonte,
    energia_kcal: macro?.energia_kcal ?? result.energyKcal ?? 0,
    proteina_g: macro?.proteina_g ?? result.proteinG ?? 0,
    carboidrato_g: macro?.carboidrato_g ?? result.carbohydrateG ?? 0,
    lipidios_g: macro?.lipidios_g ?? result.fatG ?? 0,
    fibra_g: macro?.fibra_g ?? result.fiberG ?? null,
    sodio_mg: macro?.sodio_mg ?? null,
    calcio_mg: macro?.calcio_mg ?? null,
    ferro_mg: macro?.ferro_mg ?? null,
    potassio_mg: macro?.potassio_mg ?? null,
    vitamina_c_mg: macro?.vitamina_c_mg ?? null,
    ref: result.ref,
    sourceLabel: result.sourceLabel,
    name: result.name,
    brand: result.brand ?? null,
    group: result.group ?? null,
    energyKcal: result.energyKcal ?? null,
    proteinG: result.proteinG ?? null,
    carbohydrateG: result.carbohydrateG ?? null,
    fatG: result.fatG ?? null,
    fiberG: result.fiberG ?? null,
  };
}
