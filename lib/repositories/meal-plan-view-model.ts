import type { FoodReference, PersistedMealFoodSource } from "@/lib/nutrition/food-catalog";
import { getFoodByReference } from "@/lib/nutrition/food-catalog";
import { toDisplayFoodName } from "@/lib/nutrition/food-terminology";
import { getPrescribedQuantity, toNutritionGrams } from "@/lib/nutrition/prescribed-quantity";
import { calculatePlanNutrients, roundedNutrients } from "@/lib/nutrition/nutrients";
import { getFoodPortionById, toHouseholdMeasureOption } from "@/lib/repositories/food-portions";
import { getApprovedMealPlanAlternatives, type ApprovedMealPlanAlternative } from "@/lib/repositories/meal-plan-alternatives";
import { getActiveMealPlanVersion, getMealPlanVersionById, type MealPlanItemPayload, type MealPlanPayload } from "@/lib/repositories/meal-plans";
import { buildFoodReferenceLookup, resolveMealPlanChangeReferences } from "@/lib/ai/agents/nutrition/meal-plan-change-agent";

export type MealPlanViewModelStatus = "draft" | "active" | "archived";
export type MealPlanFoodIdentityStatus = "RESOLVED" | "NEEDS_CONFIRMATION" | "UNRESOLVED";

export interface MealPlanViewModel {
  planId: string;
  versionId: string;
  versionNumber: number;
  status: MealPlanViewModelStatus;
  title: string;
  source: "CURRENT_PLAN";
  nutritionSummary: {
    sourceVersionId: string;
    energyKcal: number | null;
    proteinG: number | null;
    carbohydrateG: number | null;
    fatG: number | null;
    fiberG: number | null;
    unresolvedItems: number;
  };
  meals: MealPlanMealViewModel[];
  itemResolutionIssues: Array<{ itemId: string | null; food: string; status: MealPlanFoodIdentityStatus; reason: string }>;
}

export interface MealPlanMealViewModel {
  id: string | null;
  name: string;
  time: string | null;
  items: MealPlanItemViewModel[];
}

export interface MealPlanItemViewModel {
  id: string | null;
  role: {
    foodGroup: string | null;
    foodSubgroup: string | null;
    nutritionalRole: string | null;
  };
  foodIdentity: {
    status: MealPlanFoodIdentityStatus;
    source: PersistedMealFoodSource | null;
    refId: string | null;
    canonicalFoodId: string | null;
  };
  displayName: string;
  prescribedQuantity: string | null;
  prescribedUnit: string | null;
  nutritionGrams: number | null;
  resolutionStatus: string;
  approvedAlternatives: ApprovedMealPlanAlternative[];
}

function versionIdFor(plan: Pick<MealPlanPayload, "id" | "version">): string {
  return `${plan.id}:v${plan.version}`;
}

function alternativeKey(foodName: string): string {
  return toDisplayFoodName(foodName)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function itemRef(item: MealPlanItemPayload): FoodReference | null {
  if (!item.food_source || !item.food_ref_id) return null;
  return { source: item.food_source, sourceId: item.food_ref_id, canonicalId: item.canonical_food_id ?? null };
}

async function resolveFoodIdentityStatus(item: MealPlanItemPayload): Promise<{ status: MealPlanFoodIdentityStatus; reason: string }> {
  const ref = itemRef(item);
  if (!ref) return { status: "UNRESOLVED", reason: "Item sem food_source/food_ref_id persistidos." };
  const details = await getFoodByReference(ref);
  if (details) return { status: "RESOLVED", reason: "Identidade persistida e calculável." };
  return { status: "NEEDS_CONFIRMATION", reason: "Identidade persistida, mas sem alimento calculável no catálogo atual." };
}

async function buildItemViewModel(
  item: MealPlanItemPayload,
  alternativesByBase: Map<string, ApprovedMealPlanAlternative[]>
): Promise<{ viewModel: MealPlanItemViewModel; issue: MealPlanViewModel["itemResolutionIssues"][number] | null }> {
  const householdMeasure = item.household_measure_id
    ? await getFoodPortionById(item.household_measure_id).then((portion) => portion ? toHouseholdMeasureOption(portion) : null)
    : null;
  const quantityResolution = toNutritionGrams({
    quantity: item.quantity,
    unit: item.unit,
    householdMeasure,
    resolvedGramsSnapshot: item.resolved_grams_snapshot,
    quantityResolutionSnapshot: item.quantity_resolution_snapshot,
  });
  const identity = await resolveFoodIdentityStatus(item);
  const { prescribedQuantity, prescribedUnit } = getPrescribedQuantity(item);
  const displayName = item.food_name_snapshot?.trim() || toDisplayFoodName(item.food);
  const viewModel: MealPlanItemViewModel = {
    id: item.id ?? null,
    role: {
      foodGroup: item.slot_food_group ?? null,
      foodSubgroup: item.slot_food_subgroup ?? null,
      nutritionalRole: item.slot_nutritional_role ?? null,
    },
    foodIdentity: {
      status: identity.status,
      source: item.food_source ?? null,
      refId: item.food_ref_id ?? null,
      canonicalFoodId: item.canonical_food_id ?? null,
    },
    displayName,
    prescribedQuantity,
    prescribedUnit,
    nutritionGrams: quantityResolution.grams,
    resolutionStatus: quantityResolution.method,
    approvedAlternatives: alternativesByBase.get(alternativeKey(item.food)) ?? alternativesByBase.get(alternativeKey(displayName)) ?? [],
  };
  const issue = identity.status === "RESOLVED" && quantityResolution.method !== "unresolved"
    ? null
    : { itemId: item.id ?? null, food: item.food, status: identity.status, reason: identity.reason };
  return { viewModel, issue };
}

export async function getMealPlanViewModel(planId: string): Promise<MealPlanViewModel | null> {
  const plan = await getMealPlanVersionById(planId);
  return plan ? buildMealPlanViewModel(plan) : null;
}

export async function getActiveMealPlanViewModel(clientId: string): Promise<MealPlanViewModel | null> {
  const plan = await getActiveMealPlanVersion(clientId);
  return plan ? buildMealPlanViewModel(plan) : null;
}

export async function buildMealPlanViewModel(plan: MealPlanPayload): Promise<MealPlanViewModel> {
  const currentVersionId = versionIdFor(plan);
  const approvedAlternativeGroups = await getApprovedMealPlanAlternatives(plan);
  const alternativesByBase = new Map<string, ApprovedMealPlanAlternative[]>();
  for (const group of approvedAlternativeGroups) {
    alternativesByBase.set(alternativeKey(group.primaryFoodName), group.alternatives);
  }

  const itemResolutionIssues: MealPlanViewModel["itemResolutionIssues"] = [];
  const meals: MealPlanMealViewModel[] = [];
  for (const meal of plan.meals) {
    const items: MealPlanItemViewModel[] = [];
    for (const item of meal.items) {
      const result = await buildItemViewModel(item, alternativesByBase);
      items.push(result.viewModel);
      if (result.issue) itemResolutionIssues.push(result.issue);
    }
    meals.push({ id: meal.id ?? null, name: meal.name, time: meal.suggested_time ?? null, items });
  }

  const { references, measuresById } = await resolveMealPlanChangeReferences(plan);
  const nutrition = calculatePlanNutrients(plan, buildFoodReferenceLookup(references, measuresById));
  const totals = roundedNutrients(nutrition.total.values);

  return {
    planId: plan.id,
    versionId: currentVersionId,
    versionNumber: plan.version,
    status: plan.status,
    title: plan.title,
    source: "CURRENT_PLAN",
    nutritionSummary: {
      sourceVersionId: currentVersionId,
      energyKcal: totals.energyKcal,
      proteinG: totals.proteinG,
      carbohydrateG: totals.carbohydrateG,
      fatG: totals.fatG,
      fiberG: totals.fiberG,
      unresolvedItems: nutrition.quality.unresolved,
    },
    meals,
    itemResolutionIssues,
  };
}

export function assertMealPlanViewModelVersionInvariant(viewModel: MealPlanViewModel): void {
  if (viewModel.nutritionSummary.sourceVersionId !== viewModel.versionId) {
    throw new Error(`MealPlanViewModel invariant failed: nutrition summary version ${viewModel.nutritionSummary.sourceVersionId} differs from ${viewModel.versionId}.`);
  }
}
