import { checkFoodAgainstPatientRestrictions } from "@/lib/clinical/food-safety";
import { getFoodByReference, type FoodReference } from "@/lib/nutrition/food-catalog";
import { toNutritionGrams } from "@/lib/nutrition/prescribed-quantity";
import { compareTargetVsPrescribed, type NutrientTarget } from "@/lib/nutrition/targets";
import { listApprovedAlternativesForPlan } from "@/lib/repositories/exchange-groups";
import { buildMealPlanDelivery } from "@/lib/repositories/meal-plan-delivery";
import { currentItemGramsForExchangeGroup } from "@/lib/repositories/meal-plan-alternatives";
import { getFoodPortionById, toHouseholdMeasureOption } from "@/lib/repositories/food-portions";
import { listPatientClinicalMarkers } from "@/lib/repositories/patient-clinical-markers";
import type { MealPlanItemPayload, MealPlanPayload } from "@/lib/repositories/meal-plans";
import { getMealStructureItems } from "@/lib/meal-plans/flexible-structure";

export type MealPlanPublicationCode =
  | "UNRESOLVED_FOOD"
  | "UNCALCULABLE_FOOD"
  | "INVALID_QUANTITY"
  | "INVALID_UNIT"
  | "MISSING_ROLE"
  | "STALE_APPROVED_EXCHANGE"
  | "RESTRICTION_CONFLICT"
  | "DELIVERY_INVALID"
  | "VERSION_CONFLICT"
  | "INVALID_STATUS"
  | "TARGET_ENERGY_DIFFERENCE"
  | "TARGET_MACRO_DIFFERENCE"
  | "NO_APPROVED_EXCHANGES";

export interface MealPlanPublicationIssue {
  code: MealPlanPublicationCode;
  severity: "ERROR" | "WARNING" | "INFO";
  blockPublishing: boolean;
  mealName?: string | null;
  itemId?: string | null;
  foodName?: string | null;
  message: string;
}

export interface MealPlanPublicationReview {
  valid: boolean;
  blockers: MealPlanPublicationIssue[];
  warnings: MealPlanPublicationIssue[];
  summary: {
    meals: number;
    items: number;
    resolvedItems: number;
    approvedExchanges: number;
    staleExchanges: number;
    restrictionConflicts: number;
    blockers: number;
    warnings: number;
  };
  nutritionSummary: {
    energyKcal: number | null;
    proteinG: number | null;
    carbohydrateG: number | null;
    fatG: number | null;
    fiberG: number | null;
    unresolvedItems: number;
  };
  mealSummary: Array<{ mealName: string; items: number; blockers: number; warnings: number }>;
}

function issue(input: Omit<MealPlanPublicationIssue, "severity" | "blockPublishing"> & { severity?: "ERROR" | "WARNING" | "INFO" }): MealPlanPublicationIssue {
  const severity = input.severity ?? "ERROR";
  return { ...input, severity, blockPublishing: severity === "ERROR" };
}

function itemRef(item: MealPlanItemPayload): FoodReference | null {
  if (!item.food_source || !item.food_ref_id) return null;
  return { source: item.food_source, sourceId: item.food_ref_id, canonicalId: item.canonical_food_id ?? null };
}

function needsStructuredRole(item: MealPlanItemPayload): boolean {
  return Boolean(item.template_slot_id || item.slot_food_group || item.slot_food_subgroup || item.slot_exchange_eligible !== null && item.slot_exchange_eligible !== undefined);
}

function hasRole(item: MealPlanItemPayload): boolean {
  return Boolean(item.slot_nutritional_role?.trim());
}

function parseTarget(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function activeQuantityForGroup(plan: MealPlanPayload, group: { primary_food_source: string; primary_food_ref_id: string; primary_food_name: string }) {
  for (const meal of plan.meals) {
    for (const item of getMealStructureItems(meal)) {
      const refMatches = item.food_source === group.primary_food_source && item.food_ref_id === group.primary_food_ref_id;
      const nameMatches = item.food.trim().toLocaleLowerCase("pt-BR") === group.primary_food_name.trim().toLocaleLowerCase("pt-BR");
      if (refMatches || nameMatches) {
        const snapshotGrams = currentItemGramsForExchangeGroup(plan, group);
        if (snapshotGrams !== null) return snapshotGrams;
        const resolved = toNutritionGrams({
          quantity: item.quantity,
          unit: item.unit,
          resolvedGramsSnapshot: item.resolved_grams_snapshot,
          quantityResolutionSnapshot: item.quantity_resolution_snapshot,
        });
        return resolved.grams;
      }
    }
  }
  return null;
}

export async function validateMealPlanForPublication(plan: MealPlanPayload): Promise<MealPlanPublicationReview> {
  const issues: MealPlanPublicationIssue[] = [];
  const mealIssueCounts = new Map<string, { blockers: number; warnings: number }>();
  const markers = await listPatientClinicalMarkers(plan.client_id);

  function addIssue(next: MealPlanPublicationIssue) {
    issues.push(next);
    if (next.mealName) {
      const current = mealIssueCounts.get(next.mealName) ?? { blockers: 0, warnings: 0 };
      if (next.blockPublishing) current.blockers++;
      else if (next.severity === "WARNING") current.warnings++;
      mealIssueCounts.set(next.mealName, current);
    }
  }

  if (plan.status !== "draft") {
    addIssue(issue({
      code: "INVALID_STATUS",
      message: "Somente rascunhos podem ser publicados.",
    }));
  }

  let itemCount = 0;
  let resolvedItems = 0;
  for (const meal of plan.meals) {
    for (const item of getMealStructureItems(meal)) {
      if (!item.food.trim()) continue;
      itemCount++;
      const ref = itemRef(item);
      if (!ref) {
        addIssue(issue({
          code: "UNRESOLVED_FOOD",
          mealName: meal.name,
          itemId: item.id ?? null,
          foodName: item.food,
          message: `${item.food}: confirme o alimento antes de publicar.`,
        }));
      } else {
        const details = await getFoodByReference(ref);
        if (!details) {
          addIssue(issue({
            code: "UNCALCULABLE_FOOD",
            mealName: meal.name,
            itemId: item.id ?? null,
            foodName: item.food,
            message: `${item.food}: alimento sem dados suficientes para cálculo.`,
          }));
        } else {
          resolvedItems++;
          const safety = checkFoodAgainstPatientRestrictions({ food: details.macroReference, markers });
          if (safety.status === "conflict" && safety.conflicts.some((conflict) => conflict.type === "ALLERGY")) {
            addIssue(issue({
              code: "RESTRICTION_CONFLICT",
              mealName: meal.name,
              itemId: item.id ?? null,
              foodName: item.food,
              message: `${item.food}: conflito com alergia estruturada do paciente.`,
            }));
          } else if (safety.status === "conflict") {
            addIssue(issue({
              code: "RESTRICTION_CONFLICT",
              severity: "WARNING",
              mealName: meal.name,
              itemId: item.id ?? null,
              foodName: item.food,
              message: `${item.food}: revisar compatibilidade com restrição alimentar do paciente.`,
            }));
          }
        }
      }

      const householdMeasure = item.household_measure_id
        ? await getFoodPortionById(item.household_measure_id).then((portion) => portion ? toHouseholdMeasureOption(portion) : null)
        : null;
      const quantity = toNutritionGrams({
        quantity: item.quantity,
        unit: item.unit,
        householdMeasure,
        resolvedGramsSnapshot: item.resolved_grams_snapshot,
        quantityResolutionSnapshot: item.quantity_resolution_snapshot,
      });
      if (quantity.grams === null || !Number.isFinite(quantity.grams) || quantity.grams <= 0) {
        addIssue(issue({
          code: "INVALID_QUANTITY",
          mealName: meal.name,
          itemId: item.id ?? null,
          foodName: item.food,
          message: `${item.food}: informe uma quantidade válida.`,
        }));
      } else if (quantity.method === "estimated" || quantity.method === "generic_unit_conversion") {
        addIssue(issue({
          code: "INVALID_UNIT",
          mealName: meal.name,
          itemId: item.id ?? null,
          foodName: item.food,
          message: `${item.food}: unidade precisa de revisão antes de publicar.`,
        }));
      }

      if (needsStructuredRole(item) && !hasRole(item)) {
        addIssue(issue({
          code: "MISSING_ROLE",
          mealName: meal.name,
          itemId: item.id ?? null,
          foodName: item.food,
          message: `${item.food}: papel nutricional ausente no slot do modelo.`,
        }));
      }
    }
  }

  let approvedExchanges = 0;
  let staleExchanges = 0;
  const exchangeGroups = await listApprovedAlternativesForPlan(plan.id);
  for (const { group, approved } of exchangeGroups) {
    approvedExchanges += approved.length;
    if (!approved.length) continue;
    const currentGrams = activeQuantityForGroup(plan, group);
    if (currentGrams === null || Math.abs(currentGrams - group.primary_quantity_grams) >= 0.1) {
      staleExchanges++;
      addIssue(issue({
        code: "STALE_APPROVED_EXCHANGE",
        foodName: group.primary_food_name,
        message: `${group.primary_food_name}: trocas precisam ser atualizadas antes de publicar.`,
      }));
    }
  }

  let delivery: Awaited<ReturnType<typeof buildMealPlanDelivery>> | null = null;
  try {
    delivery = await buildMealPlanDelivery(plan);
    for (const reason of delivery.invalidReasons) {
      addIssue(issue({
        code: "DELIVERY_INVALID",
        message: `Entrega do plano precisa de revisão: ${reason}.`,
      }));
    }
  } catch {
    addIssue(issue({
      code: "DELIVERY_INVALID",
      message: "Não foi possível montar a entrega do plano.",
    }));
  }

  const nutritionSummary = delivery?.nutritionSummary ?? {
    energyKcal: null,
    proteinG: null,
    carbohydrateG: null,
    fatG: null,
    fiberG: null,
    unresolvedItems: itemCount,
  };
  if (nutritionSummary.unresolvedItems > 0) {
    addIssue(issue({
      code: "UNCALCULABLE_FOOD",
      message: "O resumo nutricional está incompleto.",
    }));
  }

  const target: NutrientTarget = {
    energyKcal: parseTarget(plan.target_energy_kcal),
    proteinG: parseTarget(plan.target_protein_g),
    carbohydrateG: parseTarget(plan.target_carbohydrate_g),
    fatG: parseTarget(plan.target_fat_g),
  };
  const targetComparison = delivery ? compareTargetVsPrescribed(target, {
    energyKcal: nutritionSummary.energyKcal,
    proteinG: nutritionSummary.proteinG,
    carbohydrateG: nutritionSummary.carbohydrateG,
    fatG: nutritionSummary.fatG,
    fiberG: nutritionSummary.fiberG,
    sodiumMg: null,
    calciumMg: null,
    ironMg: null,
    potassiumMg: null,
    vitaminCMg: null,
  }) : [];
  for (const row of targetComparison) {
    if (row.diff === null || row.target === null || row.prescribed === null) continue;
    const absoluteDiff = Math.abs(row.diff);
    const tolerance = row.nutrient === "energyKcal" ? 50 : 5;
    if (absoluteDiff > tolerance) {
      addIssue(issue({
        code: row.nutrient === "energyKcal" ? "TARGET_ENERGY_DIFFERENCE" : "TARGET_MACRO_DIFFERENCE",
        severity: "WARNING",
        message: row.nutrient === "energyKcal"
          ? `Energia do plano difere da meta em ${Math.round(row.diff)} kcal.`
          : `${row.nutrient}: diferença em relação à meta.`
      }));
    }
  }

  const blockers = issues.filter((item) => item.blockPublishing);
  const warnings = issues.filter((item) => item.severity === "WARNING");
  return {
    valid: blockers.length === 0,
    blockers,
    warnings,
    summary: {
      meals: plan.meals.length,
      items: itemCount,
      resolvedItems,
      approvedExchanges,
      staleExchanges,
      restrictionConflicts: issues.filter((item) => item.code === "RESTRICTION_CONFLICT").length,
      blockers: blockers.length,
      warnings: warnings.length,
    },
    nutritionSummary,
    mealSummary: plan.meals.map((meal) => {
      const counts = mealIssueCounts.get(meal.name) ?? { blockers: 0, warnings: 0 };
      return { mealName: meal.name, items: getMealStructureItems(meal).filter((item) => item.food.trim()).length, ...counts };
    }),
  };
}
