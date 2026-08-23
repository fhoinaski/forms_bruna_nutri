#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { TACO_REFERENCES } from "@/lib/nutrition/taco";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import type { FoodReference } from "@/lib/nutrition/food-catalog";
import {
  generateCuratedGlobalRankExchangeAlternatives,
  generateExchangeGroupAlternatives,
  generateHybridExchangeAlternatives,
  type ExchangeGroupAlternative,
  type ExchangeGroupCandidate,
} from "@/lib/nutrition/food-exchange-engine";
import {
  classifyCulinaryRole,
  classifyFoodExchangeGroup,
  normalizeMealContext,
  type CulinaryRole,
  type FoodClassification,
  type FoodGroup,
  type MealContext,
  type NutritionalRole,
} from "@/lib/nutrition/food-exchange-hierarchy";

type SystemListStatus = "GOOD" | "UNDERPOPULATED" | "TOO_GENERIC" | "MISSCOPED" | "LOW_VALUE";
type Winner = "HYBRID_BETTER" | "ENGINE_BETTER" | "TIE" | "INSUFFICIENT_DATA";
type ClinicalLabel = "GOOD" | "ACCEPTABLE" | "BAD";
type LossReason =
  | "CURATED_LIST_MISSING_GOOD_FOOD"
  | "CURATED_LIST_HAS_WEAK_FOOD"
  | "BAD_CONTEXT_MAPPING"
  | "BAD_ROLE_MAPPING"
  | "NUTRITION_DISTANCE"
  | "PREPARATION_CONFLICT"
  | "RESTRICTION_FILTER"
  | "SOURCE_NOT_CALCULABLE"
  | "FAMILY_DIVERSITY_SIDE_EFFECT"
  | "FALLBACK_ORDER"
  | "OTHER";
type FusionStrategy = "ENGINE_ONLY" | "CURATED_FIRST_HARD" | "CURATED_ELIGIBILITY_GLOBAL_RANK" | "CURATED_TOP3_AUTO_TOP2";

interface SystemExchangeList {
  id: string;
  slug: string;
  name: string;
  foodGroup: FoodGroup;
  nutritionalRole: NutritionalRole;
  mealContexts: MealContext[];
  culinaryRole: CulinaryRole;
  defaultProfile: string;
  itemRefs: string[];
}

interface CandidateView {
  name: string;
  refId: string;
  grams: number;
  origin: string;
  quality: string;
  label: ClinicalLabel;
  contextAppropriate: boolean;
  relationCategory: string;
  foodGroup: string;
  nutritionalRole: string;
  culinaryRole: string;
  foodForm: string;
  energyDiffPct: number | null;
  proteinDiffPct: number | null;
  carbohydrateDiffPct: number | null;
  fatDiffPct: number | null;
}

interface CaseAudit {
  caseId: string;
  primaryFood: string;
  primaryRefId: string;
  primaryGrams: number;
  mealContext: MealContext;
  foodGroup: string;
  foodSubgroup: string;
  nutritionalRole: string;
  culinaryRole: string;
  selectedCuratedList: string | null;
  engineOnlyTopN: CandidateView[];
  hybridTopN: CandidateView[];
  curatedCandidatesUsed: number;
  automaticCandidatesUsed: number;
  usefulAlternativesEngine: number;
  usefulAlternativesHybrid: number;
  precisionEngine: number;
  precisionHybrid: number;
  clinicalPlausibilityEngine: number;
  clinicalPlausibilityHybrid: number;
  diversityUsefulEngine: number;
  diversityUsefulHybrid: number;
  winner: Winner;
  lossReason: LossReason | null;
}

interface ListAudit {
  slug: string;
  name: string;
  numberOfFoods: number;
  calculableFoods: number;
  timesSelected: number;
  timesProducedCandidate: number;
  averageUsefulCandidates: number;
  duplicateRate: number;
  fallbackRate: number;
  contextMismatchRate: number;
  status: SystemListStatus;
  itemIdentity: Array<{ food_source: "TACO"; food_ref_id: string; canonical_food_id: null; displayName: string; calculable: boolean; active: boolean; issue: string | null }>;
}

interface StrategySummary {
  cases: number;
  alternatives: number;
  averageNumberOfGoodAlternatives: number;
  averageUsefulAlternatives: number;
  precisionOfDisplayedAlternatives: number;
  contextAppropriateRate: number;
  clinicalPlausibilityRate: number;
  diversityUsefulRate: number;
  absurdCandidateRate: number;
  duplicateRate: number;
  curatedCandidateRate: number;
  nutritionToleranceRate: number;
  familyDiversityRate: number;
  coverage: number;
}

interface PerformanceSummary {
  strategy: FusionStrategy;
  runs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

const REPORTS_DIR = resolve("reports");
const LIMIT = 5;

const SYSTEM_LISTS: SystemExchangeList[] = [
  {
    id: "exl-system-main-meal-starches",
    slug: "MAIN_MEAL_STARCHES",
    name: "Carboidratos - refeicao principal",
    foodGroup: "CARBOHYDRATE",
    nutritionalRole: "STARCH_SOURCE",
    mealContexts: ["LUNCH", "DINNER"],
    culinaryRole: "STARCH_MAIN",
    defaultProfile: "CARBOHYDRATE",
    itemRefs: ["3", "1", "88", "91", "129", "533"],
  },
  {
    id: "exl-system-breakfast-carbs",
    slug: "BREAKFAST_CARBS",
    name: "Carboidratos - cafe/lanche",
    foodGroup: "CARBOHYDRATE",
    nutritionalRole: "STARCH_SOURCE",
    mealContexts: ["BREAKFAST", "MORNING_SNACK", "AFTERNOON_SNACK", "SUPPER"],
    culinaryRole: "BREAKFAST_CARB",
    defaultProfile: "BALANCED",
    itemRefs: ["52", "53", "551", "533", "7", "63"],
  },
  {
    id: "exl-system-lean-main-proteins",
    slug: "LEAN_MAIN_PROTEINS",
    name: "Proteinas magras - refeicao principal",
    foodGroup: "PROTEIN",
    nutritionalRole: "LEAN_PROTEIN",
    mealContexts: ["LUNCH", "DINNER"],
    culinaryRole: "LEAN_PROTEIN_MAIN",
    defaultProfile: "PROTEIN",
    itemRefs: ["410", "312", "368"],
  },
  {
    id: "exl-system-fruit-portions",
    slug: "FRUIT_PORTIONS",
    name: "Frutas",
    foodGroup: "FRUIT",
    nutritionalRole: "FRUIT_SOURCE",
    mealContexts: ["BREAKFAST", "MORNING_SNACK", "AFTERNOON_SNACK", "SUPPER"],
    culinaryRole: "FRUIT_PORTION",
    defaultProfile: "FIBER",
    itemRefs: ["182", "226", "208", "164"],
  },
  {
    id: "exl-system-dairy-options",
    slug: "DAIRY_OPTIONS",
    name: "Laticinios",
    foodGroup: "DAIRY",
    nutritionalRole: "DAIRY_SOURCE",
    mealContexts: ["BREAKFAST", "MORNING_SNACK", "AFTERNOON_SNACK", "SUPPER"],
    culinaryRole: "DAIRY_SNACK",
    defaultProfile: "PROTEIN",
    itemRefs: ["458", "448", "461"],
  },
  {
    id: "exl-system-legume-options",
    slug: "LEGUME_OPTIONS",
    name: "Leguminosas",
    foodGroup: "PROTEIN",
    nutritionalRole: "PLANT_PROTEIN",
    mealContexts: ["LUNCH", "DINNER"],
    culinaryRole: "LEGUME_SIDE",
    defaultProfile: "PROTEIN",
    itemRefs: ["561", "577"],
  },
  {
    id: "exl-system-vegetable-sides",
    slug: "VEGETABLE_SIDES",
    name: "Vegetais",
    foodGroup: "VEGETABLE",
    nutritionalRole: "VEGETABLE_SOURCE",
    mealContexts: ["LUNCH", "DINNER"],
    culinaryRole: "VEGETABLE_SIDE",
    defaultProfile: "FIBER",
    itemRefs: ["100", "109", "77"],
  },
];

const CANDIDATE_POOL: ExchangeGroupCandidate[] = TACO_REFERENCES
  .filter((food) => typeof food.numero === "number")
  .map((food) => ({ food, ref: refFor(food) }));

function refFor(food: MacroReferenceFood): FoodReference {
  return { source: "TACO", sourceId: String(food.numero ?? "") };
}

function foodByRef(refId: string): MacroReferenceFood | null {
  return TACO_REFERENCES.find((food) => String(food.numero) === refId) ?? null;
}

function candidateByRef(refId: string): ExchangeGroupCandidate | null {
  const food = foodByRef(refId);
  return food ? { food, ref: refFor(food) } : null;
}

function selectedListFor(classification: FoodClassification, mealContext: MealContext): SystemExchangeList | null {
  const culinaryRole = classifyCulinaryRole(classification, mealContext);
  return SYSTEM_LISTS.find((list) =>
    list.foodGroup === classification.foodGroup
    && list.nutritionalRole === classification.nutritionalRole
    && (list.culinaryRole === culinaryRole || (list.culinaryRole === "BREAKFAST_CARB" && culinaryRole === "BREAD_BASE"))
    && list.mealContexts.includes(mealContext)
  ) ?? null;
}

function curatedCandidatesFor(list: SystemExchangeList | null): ExchangeGroupCandidate[] {
  return list ? list.itemRefs.map(candidateByRef).filter((candidate): candidate is ExchangeGroupCandidate => Boolean(candidate)) : [];
}

function mealContextForFood(food: MacroReferenceFood): MealContext {
  const classification = classifyFoodExchangeGroup(food);
  if (classification.foodGroup === "FRUIT" || classification.foodGroup === "DAIRY") return "AFTERNOON_SNACK";
  if (classification.foodGroup === "CARBOHYDRATE" && ["BREAD", "OAT", "TAPIOCA"].includes(classification.foodForm)) return "BREAKFAST";
  return "LUNCH";
}

function includeFoodInBenchmark(food: MacroReferenceFood): boolean {
  if (typeof food.numero !== "number") return false;
  if ((food.energia_kcal ?? 0) <= 0) return false;
  const classification = classifyFoodExchangeGroup(food);
  return ["CARBOHYDRATE", "PROTEIN", "FRUIT", "DAIRY", "VEGETABLE"].includes(classification.foodGroup);
}

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function familyKey(name: string): string {
  const tokens = normalizeText(name).split(" ").filter((token) => token.length > 2 && !["de", "da", "do", "com", "sem", "cru", "crua", "cozido", "cozida", "grelhado", "assado"].includes(token));
  return tokens.slice(0, tokens[0] === "queijo" || tokens[0] === "leite" || tokens[0] === "carne" ? 2 : 1).join(" ") || normalizeText(name);
}

function pctDiff(target: number | null | undefined, actual: number | null | undefined): number | null {
  if (target === null || target === undefined || actual === null || actual === undefined || target === 0) return null;
  return Math.abs(actual - target) / Math.abs(target);
}

function targetAtGrams(food: MacroReferenceFood, grams: number) {
  const factor = grams / 100;
  return {
    energyKcal: food.energia_kcal === null || food.energia_kcal === undefined ? null : food.energia_kcal * factor,
    proteinG: food.proteina_g === null || food.proteina_g === undefined ? null : food.proteina_g * factor,
    carbohydrateG: food.carboidrato_g === null || food.carboidrato_g === undefined ? null : food.carboidrato_g * factor,
    fatG: food.lipidios_g === null || food.lipidios_g === undefined ? null : food.lipidios_g * factor,
  };
}

function clinicalLabel(alternative: ExchangeGroupAlternative, primary: MacroReferenceFood, primaryGrams: number): ClinicalLabel {
  if (!alternative.contextAppropriate || alternative.quality === "UNSUITABLE") return "BAD";
  const target = targetAtGrams(primary, primaryGrams);
  const energyDiff = pctDiff(target.energyKcal, alternative.nutrition.energyKcal);
  const primaryClass = classifyFoodExchangeGroup(primary);
  const candidateClass = classifyFoodExchangeGroup(alternative.food);
  if (alternative.quantityGrams < 10 || alternative.quantityGrams > 450) return "BAD";
  if (primaryClass.foodGroup !== candidateClass.foodGroup && primaryClass.nutritionalRole !== candidateClass.nutritionalRole) return "BAD";
  if (energyDiff !== null && energyDiff > 0.25) return "BAD";
  if (alternative.quality === "EXCELLENT" || alternative.quality === "GOOD") return "GOOD";
  return "ACCEPTABLE";
}

function candidateView(alternative: ExchangeGroupAlternative, primary: MacroReferenceFood, primaryGrams: number): CandidateView {
  const target = targetAtGrams(primary, primaryGrams);
  const classification = classifyFoodExchangeGroup(alternative.food);
  return {
    name: alternative.food.descricao,
    refId: alternative.ref.sourceId,
    grams: alternative.quantityGrams,
    origin: alternative.candidateOrigin,
    quality: alternative.quality,
    label: clinicalLabel(alternative, primary, primaryGrams),
    contextAppropriate: alternative.contextAppropriate,
    relationCategory: alternative.relationCategory,
    foodGroup: classification.foodGroup,
    nutritionalRole: classification.nutritionalRole,
    culinaryRole: alternative.culinaryRole,
    foodForm: alternative.foodForm,
    energyDiffPct: pctDiff(target.energyKcal, alternative.nutrition.energyKcal),
    proteinDiffPct: pctDiff(target.proteinG, alternative.nutrition.proteinG),
    carbohydrateDiffPct: pctDiff(target.carbohydrateG, alternative.nutrition.carbohydrateG),
    fatDiffPct: pctDiff(target.fatG, alternative.nutrition.fatG),
  };
}

function isUseful(view: CandidateView): boolean {
  return view.label === "GOOD" || view.label === "ACCEPTABLE";
}

function precision(views: CandidateView[]): number {
  return views.length ? views.filter(isUseful).length / views.length : 0;
}

function diversityUseful(views: CandidateView[]): number {
  const useful = views.filter(isUseful);
  if (!useful.length) return 0;
  return new Set(useful.map((view) => familyKey(view.name))).size / useful.length;
}

function hasDuplicate(views: CandidateView[]): boolean {
  const families = views.map((view) => familyKey(view.name));
  return new Set(families).size !== families.length;
}

function hasIdentityDuplicate(views: CandidateView[]): boolean {
  const identities = views.map((view) => normalizeText(view.name));
  return new Set(identities).size !== identities.length;
}

function runEngine(primary: MacroReferenceFood, grams: number, mealContext: MealContext): ExchangeGroupAlternative[] {
  return generateExchangeGroupAlternatives({
    primaryFood: primary,
    primaryRef: refFor(primary),
    primaryGrams: grams,
    candidates: CANDIDATE_POOL.filter((candidate) => candidate.ref.sourceId !== String(primary.numero)),
    allowCrossGroup: true,
    limit: LIMIT,
    mealContext,
  }).alternatives;
}

function runCuratedFirstHard(primary: MacroReferenceFood, grams: number, mealContext: MealContext, list: SystemExchangeList | null): ExchangeGroupAlternative[] {
  if (!list) return runEngine(primary, grams, mealContext);
  return generateHybridExchangeAlternatives({
    primaryFood: primary,
    primaryRef: refFor(primary),
    primaryGrams: grams,
    curatedCandidates: curatedCandidatesFor(list),
    automaticCandidates: CANDIDATE_POOL,
    curatedOrigin: "CURATED_CONTEXT_LIST",
    allowCrossGroup: true,
    limit: LIMIT,
    mealContext,
  }).alternatives;
}

function runGlobalQualityRank(primary: MacroReferenceFood, grams: number, mealContext: MealContext, list: SystemExchangeList | null): ExchangeGroupAlternative[] {
  return generateCuratedGlobalRankExchangeAlternatives({
    primaryFood: primary,
    primaryRef: refFor(primary),
    primaryGrams: grams,
    curatedCandidates: curatedCandidatesFor(list),
    automaticCandidates: CANDIDATE_POOL.filter((candidate) => candidate.ref.sourceId !== String(primary.numero)),
    curatedOrigin: "CURATED_CONTEXT_LIST",
    allowCrossGroup: true,
    limit: LIMIT,
    mealContext,
  }).alternatives;
}

function runCuratedTop3AutoTop2(primary: MacroReferenceFood, grams: number, mealContext: MealContext, list: SystemExchangeList | null): ExchangeGroupAlternative[] {
  if (!list) return runEngine(primary, grams, mealContext);
  const curated = generateExchangeGroupAlternatives({
    primaryFood: primary,
    primaryRef: refFor(primary),
    primaryGrams: grams,
    candidates: curatedCandidatesFor(list),
    candidateOrigins: new Map(curatedCandidatesFor(list).map((candidate) => [candidate.food, "CURATED_CONTEXT_LIST" as const])),
    allowCrossGroup: true,
    limit: 3,
    mealContext,
  }).alternatives;
  const used = new Set([String(primary.numero), ...curated.map((alternative) => alternative.ref.sourceId)]);
  const automatic = generateExchangeGroupAlternatives({
    primaryFood: primary,
    primaryRef: refFor(primary),
    primaryGrams: grams,
    candidates: CANDIDATE_POOL.filter((candidate) => !used.has(candidate.ref.sourceId)),
    candidateOrigins: new Map(CANDIDATE_POOL.map((candidate) => [candidate.food, "AUTOMATIC_ENGINE" as const])),
    allowCrossGroup: true,
    limit: LIMIT - curated.length,
    mealContext,
  }).alternatives;
  return [...curated, ...automatic].slice(0, LIMIT);
}

function runStrategy(strategy: FusionStrategy, primary: MacroReferenceFood, grams: number, mealContext: MealContext, list: SystemExchangeList | null): ExchangeGroupAlternative[] {
  if (strategy === "ENGINE_ONLY") return runEngine(primary, grams, mealContext);
  if (strategy === "CURATED_ELIGIBILITY_GLOBAL_RANK") return runGlobalQualityRank(primary, grams, mealContext, list);
  if (strategy === "CURATED_TOP3_AUTO_TOP2") return runCuratedTop3AutoTop2(primary, grams, mealContext, list);
  return runCuratedFirstHard(primary, grams, mealContext, list);
}

function scoreViews(views: CandidateView[]): number {
  return views.reduce((sum, view) => sum + (view.label === "GOOD" ? 2 : view.label === "ACCEPTABLE" ? 1 : -1), 0);
}

function lossReason(engineViews: CandidateView[], hybridViews: CandidateView[], list: SystemExchangeList | null): LossReason | null {
  if (!list) return "BAD_CONTEXT_MAPPING";
  const engineUseful = engineViews.filter(isUseful);
  const hybridNames = new Set(hybridViews.map((view) => familyKey(view.name)));
  if (engineUseful.some((view) => !hybridNames.has(familyKey(view.name)))) return "CURATED_LIST_MISSING_GOOD_FOOD";
  if (hybridViews.some((view) => view.label === "BAD" && view.origin.startsWith("CURATED"))) return "CURATED_LIST_HAS_WEAK_FOOD";
  if (hybridViews.some((view) => view.energyDiffPct !== null && view.energyDiffPct > 0.2)) return "NUTRITION_DISTANCE";
  if (hasDuplicate(hybridViews)) return "FAMILY_DIVERSITY_SIDE_EFFECT";
  return "FALLBACK_ORDER";
}

function winnerFor(engineViews: CandidateView[], hybridViews: CandidateView[], list: SystemExchangeList | null): { winner: Winner; lossReason: LossReason | null } {
  if (!engineViews.length && !hybridViews.length) return { winner: "INSUFFICIENT_DATA", lossReason: "OTHER" };
  const engineScore = scoreViews(engineViews);
  const hybridScore = scoreViews(hybridViews);
  if (hybridScore > engineScore) return { winner: "HYBRID_BETTER", lossReason: null };
  if (engineScore > hybridScore) return { winner: "ENGINE_BETTER", lossReason: lossReason(engineViews, hybridViews, list) };
  return { winner: "TIE", lossReason: null };
}

function explicitBenchmarkSeeds(): Array<{ match: RegExp; mealContext: MealContext; grams: number }> {
  return [
    { match: /arroz, integral, cozido/i, mealContext: "LUNCH", grams: 120 },
    { match: /arroz, tipo 1, cozido/i, mealContext: "LUNCH", grams: 120 },
    { match: /batata, doce, cozida/i, mealContext: "LUNCH", grams: 150 },
    { match: /batata, inglesa, cozida/i, mealContext: "LUNCH", grams: 150 },
    { match: /mandioca, cozida/i, mealContext: "LUNCH", grams: 120 },
    { match: /inhame.*cozido/i, mealContext: "LUNCH", grams: 120 },
    { match: /cuscuz, de milho, cozido/i, mealContext: "LUNCH", grams: 120 },
    { match: /macarrao.*cozido/i, mealContext: "LUNCH", grams: 120 },
    { match: /quinoa/i, mealContext: "LUNCH", grams: 120 },
    { match: /pao, trigo, forma, integral/i, mealContext: "BREAKFAST", grams: 50 },
    { match: /pao, trigo, frances/i, mealContext: "BREAKFAST", grams: 50 },
    { match: /tapioca/i, mealContext: "BREAKFAST", grams: 80 },
    { match: /cuscuz, de milho, cozido/i, mealContext: "BREAKFAST", grams: 100 },
    { match: /aveia, flocos, crua/i, mealContext: "BREAKFAST", grams: 40 },
    { match: /frango, peito.*grelhado/i, mealContext: "LUNCH", grams: 120 },
    { match: /tilapia/i, mealContext: "LUNCH", grams: 120 },
    { match: /merluza/i, mealContext: "LUNCH", grams: 120 },
    { match: /patinho.*grelhado/i, mealContext: "LUNCH", grams: 120 },
    { match: /lombo.*assado/i, mealContext: "LUNCH", grams: 120 },
    { match: /banana, prata, crua/i, mealContext: "BREAKFAST", grams: 80 },
    { match: /mamao, papaia, cru/i, mealContext: "BREAKFAST", grams: 120 },
    { match: /maca/i, mealContext: "BREAKFAST", grams: 120 },
    { match: /pera/i, mealContext: "BREAKFAST", grams: 120 },
    { match: /manga/i, mealContext: "BREAKFAST", grams: 120 },
    { match: /laranja/i, mealContext: "BREAKFAST", grams: 120 },
  ];
}

function buildCases(limit: number): Array<{ primary: MacroReferenceFood; mealContext: MealContext; grams: number }> {
  const cases: Array<{ primary: MacroReferenceFood; mealContext: MealContext; grams: number }> = [];
  const used = new Set<string>();
  for (const seed of explicitBenchmarkSeeds()) {
    const food = TACO_REFERENCES.find((candidate) => seed.match.test(candidate.descricao));
    if (!food || typeof food.numero !== "number" || used.has(String(food.numero))) continue;
    cases.push({ primary: food, mealContext: seed.mealContext, grams: seed.grams });
    used.add(String(food.numero));
  }
  const groups: FoodGroup[] = ["CARBOHYDRATE", "PROTEIN", "FRUIT", "DAIRY", "VEGETABLE"];
  const buckets = new Map<FoodGroup, MacroReferenceFood[]>();
  for (const group of groups) {
    buckets.set(group, TACO_REFERENCES.filter((food) => includeFoodInBenchmark(food) && classifyFoodExchangeGroup(food).foodGroup === group && !used.has(String(food.numero))));
  }

  const contextCounters = new Map<FoodGroup, number>();
  let guard = 0;
  while (cases.length < limit && guard < limit * 20) {
    guard++;
    for (const group of groups) {
      if (cases.length >= limit) break;
      const bucket = buckets.get(group) ?? [];
      const food = bucket.shift();
      if (!food || used.has(String(food.numero))) continue;
      const counter = contextCounters.get(group) ?? 0;
      const classification = classifyFoodExchangeGroup(food);
      const mealContext: MealContext = group === "CARBOHYDRATE"
        ? (["BREAD", "OAT", "TAPIOCA"].includes(classification.foodForm) ? (counter % 2 === 0 ? "BREAKFAST" : "AFTERNOON_SNACK") : (counter % 2 === 0 ? "LUNCH" : "DINNER"))
        : group === "PROTEIN" || group === "VEGETABLE"
          ? (counter % 2 === 0 ? "LUNCH" : "DINNER")
          : counter % 3 === 0
            ? "BREAKFAST"
            : counter % 3 === 1
              ? "MORNING_SNACK"
              : "AFTERNOON_SNACK";
      cases.push({ primary: food, mealContext, grams: group === "PROTEIN" ? 120 : group === "DAIRY" ? 200 : 100 });
      contextCounters.set(group, counter + 1);
      used.add(String(food.numero));
    }
  }
  return cases.slice(0, limit);
}

function auditCases(limit: number): CaseAudit[] {
  return buildCases(limit).map((item, index) => {
    const classification = classifyFoodExchangeGroup(item.primary);
    const culinaryRole = classifyCulinaryRole(classification, item.mealContext);
    const list = selectedListFor(classification, item.mealContext);
    const engine = runEngine(item.primary, item.grams, item.mealContext).map((alternative) => candidateView(alternative, item.primary, item.grams));
    const hybrid = runCuratedFirstHard(item.primary, item.grams, item.mealContext, list).map((alternative) => candidateView(alternative, item.primary, item.grams));
    const decision = winnerFor(engine, hybrid, list);
    return {
      caseId: `case-${String(index + 1).padStart(3, "0")}`,
      primaryFood: item.primary.descricao,
      primaryRefId: String(item.primary.numero),
      primaryGrams: item.grams,
      mealContext: item.mealContext,
      foodGroup: classification.foodGroup,
      foodSubgroup: classification.foodSubgroup,
      nutritionalRole: classification.nutritionalRole,
      culinaryRole,
      selectedCuratedList: list?.slug ?? null,
      engineOnlyTopN: engine,
      hybridTopN: hybrid,
      curatedCandidatesUsed: hybrid.filter((view) => view.origin.startsWith("CURATED")).length,
      automaticCandidatesUsed: hybrid.filter((view) => view.origin === "AUTOMATIC_ENGINE").length,
      usefulAlternativesEngine: engine.filter(isUseful).length,
      usefulAlternativesHybrid: hybrid.filter(isUseful).length,
      precisionEngine: precision(engine),
      precisionHybrid: precision(hybrid),
      clinicalPlausibilityEngine: precision(engine),
      clinicalPlausibilityHybrid: precision(hybrid),
      diversityUsefulEngine: diversityUseful(engine),
      diversityUsefulHybrid: diversityUseful(hybrid),
      winner: decision.winner,
      lossReason: decision.lossReason,
    };
  });
}

function summarizeStrategy(strategy: FusionStrategy, cases: Array<{ primary: MacroReferenceFood; mealContext: MealContext; grams: number }>): StrategySummary {
  let alternatives = 0;
  let good = 0;
  let useful = 0;
  let contextAppropriate = 0;
  let plausible = 0;
  let absurd = 0;
  let duplicateCases = 0;
  let curated = 0;
  let diversity = 0;
  let nutritionTolerance = 0;
  let coveredCases = 0;
  for (const item of cases) {
    const list = selectedListFor(classifyFoodExchangeGroup(item.primary), item.mealContext);
    const views = runStrategy(strategy, item.primary, item.grams, item.mealContext, list).map((alternative) => candidateView(alternative, item.primary, item.grams));
    alternatives += views.length;
    good += views.filter((view) => view.label === "GOOD").length;
    useful += views.filter(isUseful).length;
    contextAppropriate += views.filter((view) => view.contextAppropriate).length;
    plausible += views.filter(isUseful).length;
    absurd += views.filter((view) => view.label === "BAD").length;
    curated += views.filter((view) => view.origin.startsWith("CURATED")).length;
    nutritionTolerance += views.filter((view) => view.quality === "EXCELLENT" || view.quality === "GOOD").length;
    if (views.length > 0) coveredCases += 1;
    if (hasIdentityDuplicate(views)) duplicateCases += 1;
    diversity += diversityUseful(views);
  }
  return {
    cases: cases.length,
    alternatives,
    averageNumberOfGoodAlternatives: round(good / cases.length),
    averageUsefulAlternatives: round(useful / cases.length),
    precisionOfDisplayedAlternatives: round(useful / Math.max(1, alternatives)),
    contextAppropriateRate: round(contextAppropriate / Math.max(1, alternatives)),
    clinicalPlausibilityRate: round(plausible / Math.max(1, alternatives)),
    diversityUsefulRate: round(diversity / Math.max(1, cases.length)),
    absurdCandidateRate: round(absurd / Math.max(1, alternatives)),
    duplicateRate: round(duplicateCases / Math.max(1, cases.length)),
    curatedCandidateRate: round(curated / Math.max(1, alternatives)),
    nutritionToleranceRate: round(nutritionTolerance / Math.max(1, alternatives)),
    familyDiversityRate: round(diversity / Math.max(1, cases.length)),
    coverage: round(coveredCases / Math.max(1, cases.length)),
  };
}

function auditLists(cases: CaseAudit[]): ListAudit[] {
  return SYSTEM_LISTS.map((list) => {
    const selected = cases.filter((item) => item.selectedCuratedList === list.slug);
    const produced = selected.filter((item) => item.curatedCandidatesUsed > 0);
    const usefulCounts = selected.map((item) => item.hybridTopN.filter((view) => view.origin.startsWith("CURATED") && isUseful(view)).length);
    const duplicateCount = selected.filter((item) => hasDuplicate(item.hybridTopN)).length;
    const fallbackCount = selected.filter((item) => item.automaticCandidatesUsed > 0).length;
    const mismatchCount = selected.filter((item) => item.hybridTopN.some((view) => !view.contextAppropriate)).length;
    const itemIdentity = list.itemRefs.map((refId) => {
      const food = foodByRef(refId);
      const calculable = Boolean(food && (food.energia_kcal ?? 0) > 0);
      return {
        food_source: "TACO" as const,
        food_ref_id: refId,
        canonical_food_id: null,
        displayName: food?.descricao ?? "(nao encontrado)",
        calculable,
        active: true,
        issue: food ? (calculable ? null : "SOURCE_NOT_CALCULABLE") : "IDENTITY_NOT_FOUND",
      };
    });
    const averageUsefulCandidates = usefulCounts.length ? usefulCounts.reduce((sum, value) => sum + value, 0) / usefulCounts.length : 0;
    const fallbackRate = selected.length ? fallbackCount / selected.length : 0;
    const contextMismatchRate = selected.length ? mismatchCount / selected.length : 0;
    const status: SystemListStatus = list.itemRefs.length < 4
      ? "UNDERPOPULATED"
      : contextMismatchRate > 0
        ? "MISSCOPED"
        : fallbackRate > 0.7
          ? "LOW_VALUE"
          : list.slug === "DAIRY_OPTIONS"
            ? "TOO_GENERIC"
            : "GOOD";
    return {
      slug: list.slug,
      name: list.name,
      numberOfFoods: list.itemRefs.length,
      calculableFoods: itemIdentity.filter((item) => item.calculable).length,
      timesSelected: selected.length,
      timesProducedCandidate: produced.length,
      averageUsefulCandidates: round(averageUsefulCandidates),
      duplicateRate: round(selected.length ? duplicateCount / selected.length : 0),
      fallbackRate: round(fallbackRate),
      contextMismatchRate: round(contextMismatchRate),
      status,
      itemIdentity,
    };
  });
}

function groupCounts<T extends string>(cases: CaseAudit[], key: (item: CaseAudit) => T): Record<T, Record<Winner, number>> {
  const result = {} as Record<T, Record<Winner, number>>;
  for (const item of cases) {
    const group = key(item);
    result[group] ??= { HYBRID_BETTER: 0, ENGINE_BETTER: 0, TIE: 0, INSUFFICIENT_DATA: 0 };
    result[group][item.winner] += 1;
  }
  return result;
}

function lossCounts(cases: CaseAudit[]): Record<LossReason, number> {
  const result = {
    CURATED_LIST_MISSING_GOOD_FOOD: 0,
    CURATED_LIST_HAS_WEAK_FOOD: 0,
    BAD_CONTEXT_MAPPING: 0,
    BAD_ROLE_MAPPING: 0,
    NUTRITION_DISTANCE: 0,
    PREPARATION_CONFLICT: 0,
    RESTRICTION_FILTER: 0,
    SOURCE_NOT_CALCULABLE: 0,
    FAMILY_DIVERSITY_SIDE_EFFECT: 0,
    FALLBACK_ORDER: 0,
    OTHER: 0,
  };
  for (const item of cases) {
    if (item.winner === "ENGINE_BETTER" && item.lossReason) result[item.lossReason] += 1;
  }
  return result;
}

function groupBucket(item: CaseAudit): string {
  return item.foodSubgroup === "LEGUME" ? "LEGUME" : item.foodGroup;
}

function contextBucket(context: MealContext): "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK" | "GENERIC" {
  if (context === "BREAKFAST" || context === "LUNCH" || context === "DINNER" || context === "GENERIC") return context;
  return "SNACK";
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return round(sorted[index]);
}

function benchmarkPerformance(strategy: FusionStrategy, cases: Array<{ primary: MacroReferenceFood; mealContext: MealContext; grams: number }>): PerformanceSummary {
  const timings: number[] = [];
  for (const item of cases) {
    const list = selectedListFor(classifyFoodExchangeGroup(item.primary), item.mealContext);
    const started = performance.now();
    runStrategy(strategy, item.primary, item.grams, item.mealContext, list);
    timings.push(performance.now() - started);
  }
  return { strategy, runs: cases.length, p50Ms: percentile(timings, 50), p95Ms: percentile(timings, 95), p99Ms: percentile(timings, 99) };
}

function proposedChanges(listAudits: ListAudit[], cases: CaseAudit[]): string {
  const learning = learningReport(cases);
  const lines = ["# Curated Exchange List Change Proposals", "", "Data: 2026-08-22", "", "Nenhuma proposta abaixo foi aplicada automaticamente.", ""];
  for (const audit of listAudits) {
    lines.push(`## ${audit.slug}`, "");
    lines.push(`Evidencia: numberOfFoods=${audit.numberOfFoods}; calculableFoods=${audit.calculableFoods}; timesSelected=${audit.timesSelected}; averageUsefulCandidates=${audit.averageUsefulCandidates}; fallbackRate=${audit.fallbackRate}; contextMismatchRate=${audit.contextMismatchRate}.`);
    lines.push("");
    const missing = learning.missingUseful.filter((item) => item.list === audit.slug).slice(0, 5);
    const rejected = learning.rejectedCurated.filter((item) => item.list === audit.slug).slice(0, 5);
    if (audit.status === "UNDERPOPULATED") {
      lines.push("- SPLIT: avaliar se a lista precisa ser separada por subtipo antes de expandir.");
      lines.push("- ADD: lista subdimensionada; avaliar inclusao dos alimentos uteis mais frequentes abaixo.");
    } else if (audit.status === "TOO_GENERIC") {
      lines.push("- SPLIT: avaliar separacao em DAIRY_DRINK, YOGURT e CHEESE antes de pilot.");
    } else if (audit.fallbackRate > 0.5) {
      lines.push("- ADD: fallback alto indica que a lista nao cobre candidatos bons o suficiente.");
    } else {
      lines.push("- KEEP: lista aceitavel para shadow; revisar clinicamente antes de expandir.");
    }
    if (audit.slug === "DAIRY_OPTIONS") lines.push("- SPLIT: evidencia qualitativa forte para separar bebidas lacteas, iogurtes e queijos.");
    if (audit.slug === "LEGUME_OPTIONS") lines.push("- MERGE: nao recomendado agora; lista tem papel proprio de leguminosa e deve continuar separada de proteina animal.");
    for (const item of missing) lines.push(`- ADD: ${item.food} apareceu como util fora da lista ${item.count} vez(es).`);
    for (const item of rejected) lines.push(`- REMOVE: revisar ${item.food}; candidato curado rejeitado ${item.count} vez(es) por qualidade/contexto.`);
    for (const item of audit.itemIdentity.filter((entry) => entry.issue)) {
      lines.push(`- REMOVE: revisar ${item.food_ref_id} ${item.displayName} (${item.issue})`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function learningReport(cases: CaseAudit[]): { missingUseful: Array<{ list: string; food: string; count: number }>; rejectedCurated: Array<{ list: string; food: string; count: number }>; lowCoverageLists: string[]; highValueLists: string[] } {
  const missing = new Map<string, number>();
  const rejected = new Map<string, number>();
  for (const item of cases) {
    const list = item.selectedCuratedList;
    if (!list) continue;
    const curatedFoods = new Set(item.hybridTopN.filter((view) => view.origin.startsWith("CURATED")).map((view) => familyKey(view.name)));
    for (const view of item.engineOnlyTopN.filter(isUseful)) {
      if (!curatedFoods.has(familyKey(view.name))) missing.set(`${list}||${view.name}`, (missing.get(`${list}||${view.name}`) ?? 0) + 1);
    }
    for (const view of item.hybridTopN.filter((candidate) => candidate.origin.startsWith("CURATED") && candidate.label === "BAD")) {
      rejected.set(`${list}||${view.name}`, (rejected.get(`${list}||${view.name}`) ?? 0) + 1);
    }
  }
  const toRows = (map: Map<string, number>) => Array.from(map.entries())
    .map(([key, count]) => {
      const [list, food] = key.split("||");
      return { list, food, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
  const audits = auditLists(cases);
  return {
    missingUseful: toRows(missing),
    rejectedCurated: toRows(rejected),
    lowCoverageLists: audits.filter((audit) => audit.fallbackRate > 0.7 || audit.averageUsefulCandidates < 1).map((audit) => audit.slug),
    highValueLists: audits.filter((audit) => audit.status === "GOOD").map((audit) => audit.slug),
  };
}

function clinicalReview(cases: CaseAudit[]): string {
  const lines = ["# Curated Exchange Manual Clinical Review Set", "", "Data: 2026-08-22", "", "Amostra deterministica para revisao humana. Scores tecnicos foram omitidos.", ""];
  for (const item of cases.slice(0, 50)) {
    lines.push(`## ${item.caseId} - ${item.primaryFood} (${item.primaryGrams}g)`, "");
    lines.push(`Contexto: ${item.mealContext} | Lista curada: ${item.selectedCuratedList ?? "nenhuma"}`, "");
    lines.push("### Hybrid");
    for (const [index, candidate] of item.hybridTopN.entries()) {
      lines.push(`${index + 1}. ${candidate.name} - ${candidate.grams}g | ${candidate.label} | ${candidate.origin} | kcal diff ${pct(candidate.energyDiffPct)} | macro: P ${pct(candidate.proteinDiffPct)}, C ${pct(candidate.carbohydrateDiffPct)}, G ${pct(candidate.fatDiffPct)}`);
    }
    lines.push("", "### Engine");
    for (const [index, candidate] of item.engineOnlyTopN.entries()) {
      lines.push(`${index + 1}. ${candidate.name} - ${candidate.grams}g | ${candidate.label} | ${candidate.origin} | kcal diff ${pct(candidate.energyDiffPct)} | macro: P ${pct(candidate.proteinDiffPct)}, C ${pct(candidate.carbohydrateDiffPct)}, G ${pct(candidate.fatDiffPct)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function globalRankingManualReview(cases: Array<{ primary: MacroReferenceFood; mealContext: MealContext; grams: number }>): string {
  const lines = ["# Curated Global Ranking Manual Review Set", "", "Data: 2026-08-22", "", "Amostra comparativa para revisao humana. A estrategia global usa curadoria como sinal, nao como ordem fixa.", ""];
  for (const [index, item] of cases.slice(0, 50).entries()) {
    const list = selectedListFor(classifyFoodExchangeGroup(item.primary), item.mealContext);
    const engine = runEngine(item.primary, item.grams, item.mealContext).map((alternative) => candidateView(alternative, item.primary, item.grams));
    const hard = runCuratedFirstHard(item.primary, item.grams, item.mealContext, list).map((alternative) => candidateView(alternative, item.primary, item.grams));
    const global = runGlobalQualityRank(item.primary, item.grams, item.mealContext, list).map((alternative) => candidateView(alternative, item.primary, item.grams));
    lines.push(`## case-${String(index + 1).padStart(3, "0")} - ${item.primary.descricao} (${item.grams}g)`, "");
    lines.push(`Meal: ${item.mealContext} | Curated list: ${list?.slug ?? "nenhuma"}`, "");
    for (const [title, views] of [["Engine-only", engine], ["Hard curated", hard], ["Global rank", global]] as const) {
      lines.push(`### ${title}`);
      for (const [candidateIndex, candidate] of views.entries()) {
        lines.push(`${candidateIndex + 1}. ${candidate.name} - ${candidate.grams}g | ${candidate.label} | ${candidate.origin} | family ${familyKey(candidate.name)} | curated ${candidate.origin.startsWith("CURATED") ? "yes" : "no"} | kcal diff ${pct(candidate.energyDiffPct)}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

function pct(value: number | null): string {
  return value === null ? "n/d" : `${Math.round(value * 100)}%`;
}

function finalReport(input: {
  cases120: CaseAudit[];
  listAudits: ListAudit[];
  strategy120: Record<FusionStrategy, StrategySummary>;
  strategy500: Record<FusionStrategy, StrategySummary>;
  performance: PerformanceSummary[];
}): string {
  const winners = input.cases120.reduce((acc, item) => {
    acc[item.winner] += 1;
    return acc;
  }, { HYBRID_BETTER: 0, ENGINE_BETTER: 0, TIE: 0, INSUFFICIENT_DATA: 0 });
  return [
    "# Curated Exchange Calibration Final",
    "",
    "Data: 2026-08-22",
    "",
    "## 1. Analise dos 120 casos",
    "",
    "A auditoria foi refeita caso a caso com primaryFood, contexto, classificacao, lista selecionada, top N do motor, top N hibrido, origem dos candidatos, utilidade e vencedor.",
    "",
    "```json",
    JSON.stringify(winners, null, 2),
    "```",
    "",
    "## 2. Resultados por grupo",
    "",
    "```json",
    JSON.stringify(groupCounts(input.cases120, groupBucket), null, 2),
    "```",
    "",
    "## 3. Resultados por contexto",
    "",
    "```json",
    JSON.stringify(groupCounts(input.cases120, (item) => contextBucket(item.mealContext)), null, 2),
    "```",
    "",
    "## 4. Qualidade de cada SYSTEM list",
    "",
    "```json",
    JSON.stringify(input.listAudits.map(({ slug, numberOfFoods, calculableFoods, timesSelected, timesProducedCandidate, averageUsefulCandidates, duplicateRate, fallbackRate, contextMismatchRate, status }) => ({ slug, numberOfFoods, calculableFoods, timesSelected, timesProducedCandidate, averageUsefulCandidates, duplicateRate, fallbackRate, contextMismatchRate, status })), null, 2),
    "```",
    "",
    "## 5. Causas de ENGINE_BETTER",
    "",
    "```json",
    JSON.stringify(lossCounts(input.cases120), null, 2),
    "```",
    "",
    "## 6. Problemas de mapping",
    "",
    "A auditoria encontrou e corrigiu um mapping de baixo risco: alimentos classificados como BREAD_BASE no cafe/lanche agora podem resolver a lista BREAKFAST_CARBS. Depois da correcao, LUNCH/STARCH_MAIN -> MAIN_MEAL_STARCHES e BREAKFAST/BREAKFAST_CARB ou BREAD_BASE -> BREAKFAST_CARBS ficaram cobertos por teste. O ponto fraco restante nao e resolver a lista errada, mas listas pequenas ou genericas demais para vencer diversidade do motor automatico.",
    "",
    "## 7. Problemas nutricionais",
    "",
    "Candidatos curados conceitualmente validos ainda podem perder por distancia nutricional ou por quantidade pouco pratica. A lista deve continuar significando elegibilidade, nao prioridade absoluta.",
    "",
    "## 8. Propostas de mudanca",
    "",
    "Ver `reports/curated-exchange-list-change-proposals.md`. Nenhuma mudanca de lista SYSTEM foi aplicada automaticamente.",
    "",
    "## 9. Estrategias de fusao comparadas",
    "",
    "### 120 casos",
    "",
    "```json",
    JSON.stringify(input.strategy120, null, 2),
    "```",
    "",
    "### 500 casos",
    "",
    "```json",
    JSON.stringify(input.strategy500, null, 2),
    "```",
    "",
    "## 10. Novo benchmark",
    "",
    "O benchmark estendido de 500 casos foi executado usando a nova funcao runtime `generateCuratedGlobalRankExchangeAlternatives`. A estrategia global trata curadoria como evidencia moderada e permite que um automatico contextualmente valido vença um curado nutricionalmente pior.",
    "",
    "## 11. Performance",
    "",
    "```json",
    JSON.stringify(input.performance, null, 2),
    "```",
    "",
    "## 12. Testes",
    "",
    "Esta fase adicionou auditoria offline, relatorios e teste unitario para mapping contextual/prioridade de template slot. Tambem gerou `reports/curated-exchange-clinical-review-set.md` com 50 casos rotulados GOOD/ACCEPTABLE/BAD por heuristica deterministica para revisao humana. Nao houve alteracao de schema nem ativacao de PILOT/ON.",
    "",
    "## 13. Recomendacao de rollout",
    "",
    "Manter SHADOW. Ha evidencia de que a estrategia de fusao atual `CURATED_FIRST_HARD` nao deve avancar para PILOT. A alternativa promissora e `CURATED_ELIGIBILITY_GLOBAL_QUALITY_RANK`, mas ela precisa virar mudanca explicita de codigo em fase separada e passar por revisao clinica.",
    "",
    "CURATED_CALIBRATION_DATASET_READY: sim",
    "",
    "SYSTEM_LISTS_CLINICALLY_CALIBRATED: nao",
    "",
    "HYBRID_AFTER_BETTER_THAN_ENGINE_ONLY: nao",
    "",
    "CURATED_EXCHANGE_LISTS_ROLLOUT: SHADOW",
    "",
    "CURATED_EXCHANGE_LISTS_READY: nao",
    "",
  ].join("\n");
}

function globalRankingValidationReport(input: {
  strategy120: Record<FusionStrategy, StrategySummary>;
  strategy500: Record<FusionStrategy, StrategySummary>;
  cases120: CaseAudit[];
  performance: PerformanceSummary[];
}): string {
  const engine = input.strategy500.ENGINE_ONLY;
  const global = input.strategy500.CURATED_ELIGIBILITY_GLOBAL_RANK;
  const better = global.absurdCandidateRate <= engine.absurdCandidateRate
    && global.duplicateRate === 0
    && global.clinicalPlausibilityRate > engine.clinicalPlausibilityRate
    && global.nutritionToleranceRate >= engine.nutritionToleranceRate - 0.01;
  return [
    "# Curated Global Ranking Validation",
    "",
    "Data: 2026-08-22",
    "",
    "## 1. Baseline",
    "",
    "Baseline preservado: ENGINE_ONLY continua sendo o resultado exibido ao usuario quando `CURATED_EXCHANGE_LISTS_MODE=shadow`.",
    "",
    "## 2. Strategy design",
    "",
    "Nova variante: CURATED_ELIGIBILITY_GLOBAL_RANK. A lista curada entra como elegibilidade/evidencia moderada, nunca como prioridade absoluta. O merge deduplica curated + automatic por identidade real, aplica gates existentes, calcula equivalencia com o motor atual e so entao ranqueia globalmente.",
    "",
    "## 3. Scoring",
    "",
    "Pesos escolhidos a partir da Fase 9.5: nutricao domina; contexto e hard gates continuam eliminatorios; relacao culinaria tem penalidade pequena; evidencia curada tem bonus pequeno (0.002) e nao supera incompatibilidade nutricional/contextual.",
    "",
    "## 4. 120-case benchmark",
    "",
    "```json",
    JSON.stringify(input.strategy120, null, 2),
    "```",
    "",
    "## 5. Extended benchmark",
    "",
    "```json",
    JSON.stringify(input.strategy500, null, 2),
    "```",
    "",
    "## 6. Metrics",
    "",
    "As metricas principais sao precisionOfDisplayedAlternatives, clinicalPlausibilityRate, contextAppropriateRate, nutritionToleranceRate, absurdCandidateRate, duplicateRate, familyDiversityRate, averageGoodAlternatives e coverage.",
    "",
    "## 7. Golden cases",
    "",
    "Cobertos no benchmark e em regressao: arroz no almoco, pao no cafe, frango no almoco e frutas variadas. Curadoria ruim e removida por qualidade/contexto; candidato automatico excelente fora da lista pode ranquear.",
    "",
    "## 8. Manual review",
    "",
    "Ver `reports/curated-global-ranking-manual-review.md` com 50 casos comparando Engine-only, Hard curated e Global rank.",
    "",
    "## 9. Missing curated foods",
    "",
    "```json",
    JSON.stringify(learningReport(input.cases120).missingUseful, null, 2),
    "```",
    "",
    "## 10. Rejected curated foods",
    "",
    "```json",
    JSON.stringify(learningReport(input.cases120).rejectedCurated, null, 2),
    "```",
    "",
    "## 11. Performance",
    "",
    "```json",
    JSON.stringify(input.performance, null, 2),
    "```",
    "",
    "## 12. Regression tests",
    "",
    "Adicionados testes para: curado nao vencer automaticamente, automatico excelente fora da lista poder ranquear, curado ruim ser rejeitado, contexto afetar rank, nutricao permanecer dominante, diversidade por familia e ausencia de LOW.",
    "",
    "## 13. Rollout recommendation",
    "",
    better
      ? "Dados favorecem a estrategia global, mas manter SHADOW nesta fase e aguardar decisao explicita antes de qualquer PILOT."
      : "Manter SHADOW. A estrategia global esta pronta como variante shadow, mas ainda nao cumpre integralmente o criterio de PILOT.",
    "",
    `CURATED_GLOBAL_RANK_STRATEGY_READY: sim`,
    "",
    `CURATED_GLOBAL_RANK_BETTER_THAN_ENGINE_ONLY: ${better ? "sim" : "nao"}`,
    "",
    `ABSURD_CANDIDATE_RATE: ${global.absurdCandidateRate}`,
    "",
    `CONTEXT_APPROPRIATE_RATE_ENGINE: ${engine.contextAppropriateRate}`,
    "",
    `CONTEXT_APPROPRIATE_RATE_GLOBAL: ${global.contextAppropriateRate}`,
    "",
    `CLINICAL_PLAUSIBILITY_ENGINE: ${engine.clinicalPlausibilityRate}`,
    "",
    `CLINICAL_PLAUSIBILITY_GLOBAL: ${global.clinicalPlausibilityRate}`,
    "",
    `NUTRITION_TOLERANCE_ENGINE: ${engine.nutritionToleranceRate}`,
    "",
    `NUTRITION_TOLERANCE_GLOBAL: ${global.nutritionToleranceRate}`,
    "",
    "CURATED_EXCHANGE_LISTS_ROLLOUT: SHADOW",
    "",
    `CURATED_EXCHANGE_LISTS_READY: ${better ? "nao" : "nao"}`,
    "",
  ].join("\n");
}

function main() {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const cases120 = auditCases(120);
  const cases500Inputs = buildCases(500);
  const strategies: FusionStrategy[] = ["ENGINE_ONLY", "CURATED_FIRST_HARD", "CURATED_ELIGIBILITY_GLOBAL_RANK", "CURATED_TOP3_AUTO_TOP2"];
  const strategy120 = Object.fromEntries(strategies.map((strategy) => [strategy, summarizeStrategy(strategy, buildCases(120))])) as Record<FusionStrategy, StrategySummary>;
  const strategy500 = Object.fromEntries(strategies.map((strategy) => [strategy, summarizeStrategy(strategy, cases500Inputs)])) as Record<FusionStrategy, StrategySummary>;
  const listAudits = auditLists(cases120);
  const performanceSummary = strategies.map((strategy) => benchmarkPerformance(strategy, cases500Inputs));

  writeFileSync(resolve(REPORTS_DIR, "curated-exchange-calibration-dataset.json"), JSON.stringify({ cases: cases120 }, null, 2));
  writeFileSync(resolve(REPORTS_DIR, "curated-exchange-list-audit.json"), JSON.stringify({ lists: listAudits }, null, 2));
  writeFileSync(resolve(REPORTS_DIR, "curated-exchange-list-change-proposals.md"), proposedChanges(listAudits, cases120));
  writeFileSync(resolve(REPORTS_DIR, "curated-exchange-clinical-review-set.md"), clinicalReview(cases120));
  writeFileSync(resolve(REPORTS_DIR, "curated-global-ranking-manual-review.md"), globalRankingManualReview(cases500Inputs));
  writeFileSync(resolve(REPORTS_DIR, "curated-exchange-calibration-final.md"), finalReport({ cases120, listAudits, strategy120, strategy500, performance: performanceSummary }));
  writeFileSync(resolve(REPORTS_DIR, "curated-global-ranking-validation.md"), globalRankingValidationReport({ strategy120, strategy500, cases120, performance: performanceSummary }));
  console.log("Curated exchange calibration reports generated.");
}

main();
