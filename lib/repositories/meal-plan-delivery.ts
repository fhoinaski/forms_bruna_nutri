import { listApprovedAlternativesForPlan } from "@/lib/repositories/exchange-groups";
import { currentItemGramsForExchangeGroup } from "@/lib/repositories/meal-plan-alternatives";
import {
  getMealPlanVersionById,
  getClientMealPlans,
  type MealPlanPayload,
  type MealPlanSupplementPayload,
  type MealPlanWeeklySlotPayload,
} from "@/lib/repositories/meal-plans";
import { buildMealPlanViewModel } from "@/lib/repositories/meal-plan-view-model";

export type MealPlanDeliveryStatus = "valid" | "no_active" | "invalid";

export interface MealPlanDeliveryResult {
  status: MealPlanDeliveryStatus;
  reason: string | null;
  activeVersionId: string | null;
  delivery: MealPlanDeliveryPayload | null;
}

export interface MealPlanDeliveryPayload {
  planId: string;
  versionId: string;
  activeVersionId: string;
  versionNumber: number;
  status: "active" | "draft" | "archived";
  title: string;
  notes: string | null;
  updatedAt: string;
  nutritionSummary: {
    sourceVersionId: string;
    energyKcal: number | null;
    proteinG: number | null;
    carbohydrateG: number | null;
    fatG: number | null;
    fiberG: number | null;
    unresolvedItems: number;
  };
  meals: MealPlanDeliveryMeal[];
  weeklySlots: MealPlanWeeklySlotPayload[];
  supplements: MealPlanSupplementPayload[];
  invalidReasons: string[];
  sourcePlan: MealPlanPayload;
}

export interface MealPlanDeliveryMeal {
  id: string | null;
  name: string;
  time: string | null;
  notes: string | null;
  recipeId: string | null;
  items: MealPlanDeliveryItem[];
}

export interface MealPlanDeliveryItem {
  id: string | null;
  foodRef: {
    source: string | null;
    refId: string | null;
    canonicalFoodId: string | null;
  };
  displayName: string;
  prescribedQuantity: string | null;
  prescribedUnit: string | null;
  notes: string | null;
  approvedExchanges: MealPlanDeliveryExchange[];
}

export interface MealPlanDeliveryExchange {
  foodName: string;
  quantity: string | null;
  unit: string | null;
  notes: string | null;
}

export interface NormalizedMealPlanDelivery {
  versionId: string;
  activeVersionId: string;
  meals: Array<{
    name: string;
    time: string | null;
    items: Array<{
      foodRef: string;
      name: string;
      quantity: string | null;
      unit: string | null;
      approvedExchanges: Array<{ name: string; quantity: string | null; unit: string | null }>;
    }>;
  }>;
}

function versionIdFor(plan: Pick<MealPlanPayload, "id" | "version">): string {
  return `${plan.id}:v${plan.version}`;
}

function normalizeRef(source: string | null, refId: string | null, canonicalFoodId: string | null): string {
  return [source ?? "", refId ?? "", canonicalFoodId ?? ""].join(":");
}

async function findStaleApprovedExchangeGroups(plan: MealPlanPayload): Promise<string[]> {
  const stale: string[] = [];
  const groups = await listApprovedAlternativesForPlan(plan.id);
  for (const { group, approved } of groups) {
    if (approved.length === 0) continue;
    const currentGrams = currentItemGramsForExchangeGroup(plan, group);
    if (currentGrams !== null && Math.abs(currentGrams - group.primary_quantity_grams) >= 0.1) {
      stale.push(group.primary_food_name);
    }
  }
  return stale;
}

export async function buildMealPlanDelivery(plan: MealPlanPayload, activeVersionId = versionIdFor(plan)): Promise<MealPlanDeliveryPayload> {
  const viewModel = await buildMealPlanViewModel(plan);
  const staleGroups = await findStaleApprovedExchangeGroups(plan);
  const invalidReasons = [
    ...viewModel.itemResolutionIssues.map((issue) => `ITEM_${issue.status}:${issue.food}`),
    ...staleGroups.map((food) => `STALE_EXCHANGE:${food}`),
  ];

  return {
    planId: plan.id,
    versionId: viewModel.versionId,
    activeVersionId,
    versionNumber: viewModel.versionNumber,
    status: viewModel.status,
    title: viewModel.title,
    notes: plan.notes,
    updatedAt: plan.updated_at,
    nutritionSummary: viewModel.nutritionSummary,
    meals: viewModel.meals.map((meal) => {
      const sourceMeal = plan.meals.find((item) => (meal.id && item.id === meal.id) || item.name === meal.name);
      return {
        id: meal.id,
        name: meal.name,
        time: meal.time,
        notes: sourceMeal?.notes ?? null,
        recipeId: sourceMeal?.source_recipe_id ?? null,
        items: meal.items.map((item) => {
          const sourceItem = sourceMeal?.items.find((candidate) =>
            (item.id && candidate.id === item.id) ||
            (candidate.food_source === item.foodIdentity.source && candidate.food_ref_id === item.foodIdentity.refId)
          );
          return {
            id: item.id,
            foodRef: {
              source: item.foodIdentity.source,
              refId: item.foodIdentity.refId,
              canonicalFoodId: item.foodIdentity.canonicalFoodId,
            },
            displayName: item.displayName,
            prescribedQuantity: item.prescribedQuantity,
            prescribedUnit: item.prescribedUnit,
            notes: sourceItem?.notes ?? null,
            approvedExchanges: item.approvedAlternatives.map((alternative) => ({
              foodName: alternative.optionFoodName,
              quantity: alternative.quantity,
              unit: alternative.unit,
              notes: alternative.notes,
            })),
          };
        }),
      };
    }),
    weeklySlots: plan.weekly_slots,
    supplements: plan.supplements,
    invalidReasons,
    sourcePlan: plan,
  };
}

export async function getActiveMealPlanDelivery(clientId: string): Promise<MealPlanDeliveryResult> {
  const plans = await getClientMealPlans(clientId);
  const activePlans = plans.filter((plan) => plan.status === "active");
  if (activePlans.length === 0) {
    return { status: "no_active", reason: "NO_ACTIVE_PLAN", activeVersionId: null, delivery: null };
  }
  if (activePlans.length > 1) {
    return { status: "invalid", reason: "MULTIPLE_ACTIVE_PLANS", activeVersionId: null, delivery: null };
  }
  const delivery = await buildMealPlanDelivery(activePlans[0]);
  if (delivery.invalidReasons.length > 0) {
    return { status: "invalid", reason: delivery.invalidReasons[0] ?? "INVALID_ACTIVE_PLAN", activeVersionId: delivery.activeVersionId, delivery };
  }
  return { status: "valid", reason: null, activeVersionId: delivery.activeVersionId, delivery };
}

export async function getMealPlanDeliveryPreview(planId: string): Promise<MealPlanDeliveryPayload | null> {
  const plan = await getMealPlanVersionById(planId);
  return plan ? buildMealPlanDelivery(plan, versionIdFor(plan)) : null;
}

export function normalizeMealPlanDelivery(delivery: MealPlanDeliveryPayload): NormalizedMealPlanDelivery {
  return {
    versionId: delivery.versionId,
    activeVersionId: delivery.activeVersionId,
    meals: delivery.meals.map((meal) => ({
      name: meal.name,
      time: meal.time,
      items: meal.items.map((item) => ({
        foodRef: normalizeRef(item.foodRef.source, item.foodRef.refId, item.foodRef.canonicalFoodId),
        name: item.displayName,
        quantity: item.prescribedQuantity,
        unit: item.prescribedUnit,
        approvedExchanges: item.approvedExchanges.map((exchange) => ({
          name: exchange.foodName,
          quantity: exchange.quantity,
          unit: exchange.unit,
        })),
      })),
    })),
  };
}
