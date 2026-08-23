import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrescribedQuantity, toNutritionGrams } from "../lib/nutrition/prescribed-quantity";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const GOLDEN_ADULT_HEALTHY_ITEMS = [
  ["Pao de forma integral", "50", "g", "52"],
  ["Ovo de galinha inteiro cozido", "100", "g", "489"],
  ["Banana prata", "80", "g", "182"],
  ["Arroz integral cozido", "120", "g", "1"],
  ["Feijao carioca cozido", "100", "g", "561"],
  ["Peito de frango grelhado", "120", "g", "410"],
  ["Brocolis cozido", "100", "g", "100"],
  ["Batata doce cozida", "150", "g", "88"],
  ["File de tilapia grelhado", "130", "g", "312"],
  ["Abobrinha cozida", "120", "g", "86"],
] as const;

function goldenPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-golden",
    client_id: "client-1",
    title: "Golden adult healthy",
    target_group: "ADULTO_SAUDAVEL",
    status: "draft",
    version: 1,
    notes: null,
    target_energy_kcal: null,
    target_protein_g: null,
    target_carbohydrate_g: null,
    target_fat_g: null,
    created_at: "now",
    updated_at: "now",
    meals: [
      {
        id: "meal-cafe",
        name: "Cafe da manha",
        suggested_time: null,
        notes: null,
        source_recipe_id: null,
        items: GOLDEN_ADULT_HEALTHY_ITEMS.slice(0, 3).map(([food, quantity, unit, refId], index) => item(food, quantity, unit, refId, `cafe-${index}`)),
      },
      {
        id: "meal-almoco",
        name: "Almoco",
        suggested_time: null,
        notes: null,
        source_recipe_id: null,
        items: GOLDEN_ADULT_HEALTHY_ITEMS.slice(3, 7).map(([food, quantity, unit, refId], index) => item(food, quantity, unit, refId, `almoco-${index}`)),
      },
      {
        id: "meal-jantar",
        name: "Jantar",
        suggested_time: null,
        notes: null,
        source_recipe_id: null,
        items: GOLDEN_ADULT_HEALTHY_ITEMS.slice(7).map(([food, quantity, unit, refId], index) => item(food, quantity, unit, refId, `jantar-${index}`)),
      },
    ],
    weekly_slots: [],
    substitutions: [],
    supplements: [],
    ...overrides,
  };
}

function item(food: string, quantity: string, unit: string, refId: string, id: string) {
  return {
    id,
    food,
    quantity,
    unit,
    notes: null,
    food_source: "TACO" as const,
    food_ref_id: refId,
    canonical_food_id: null,
    household_measure_id: null,
    food_name_snapshot: food,
    nutrition_snapshot: JSON.stringify({ descricao: food, energia_kcal: 100, proteina_g: 1, carboidrato_g: 1, lipidios_g: 1 }),
    resolved_grams_snapshot: Number(quantity),
    quantity_resolution_snapshot: null,
    quantity_locked: false,
    substitutions_locked: false,
    slot_food_group: null,
    slot_food_subgroup: null,
    slot_nutritional_role: null,
    template_slot_id: null,
    slot_exchange_eligible: null,
  };
}

function mockViewModelDeps(active = goldenPlan({ id: "active-plan", status: "active", version: 2 }), draft = goldenPlan({ id: "draft-plan", status: "draft", version: 3 })) {
  vi.doMock("@/lib/repositories/meal-plans", () => ({
    getMealPlanVersionById: vi.fn(async (planId: string) => planId === "draft-plan" ? draft : planId === "active-plan" ? active : null),
    getActiveMealPlanVersion: vi.fn(async () => active),
  }));
  vi.doMock("@/lib/repositories/meal-plan-alternatives", () => ({
    getApprovedMealPlanAlternatives: vi.fn(async (plan: { id: string }) => plan.id === "active-plan"
      ? [{ primaryFoodName: "Arroz integral cozido", alternatives: [{ source: "exchange_group", primaryFoodName: "Arroz integral cozido", optionFoodName: "Batata inglesa cozida", quantity: "140", unit: "g", notes: null }] }]
      : []),
  }));
  vi.doMock("@/lib/repositories/food-portions", () => ({
    getFoodPortionById: vi.fn(async () => null),
    toHouseholdMeasureOption: vi.fn(),
  }));
  vi.doMock("@/lib/nutrition/food-catalog", () => ({
    getFoodByReference: vi.fn(async (ref: { sourceId: string }) => ({ name: `food-${ref.sourceId}`, macroReference: { descricao: `food-${ref.sourceId}` } })),
  }));
  vi.doMock("@/lib/ai/agents/nutrition/meal-plan-change-agent", () => ({
    resolveMealPlanChangeReferences: vi.fn(async () => ({ references: [], measuresById: new Map() })),
    buildFoodReferenceLookup: vi.fn(() => ({})),
  }));
  vi.doMock("@/lib/nutrition/nutrients", () => ({
    calculatePlanNutrients: vi.fn(() => ({
      total: { values: { energyKcal: 1000, proteinG: 50, carbohydrateG: 120, fatG: 30, fiberG: 20 } },
      perMeal: [],
      quality: { unresolved: 0 },
    })),
    roundedNutrients: vi.fn((values: unknown) => values),
  }));
}

describe("R1 quantity contract", () => {
  it("prescribed quantity is quantity/unit and nutrition grams do not rewrite prescribed values", () => {
    const input = { quantity: "50", unit: "g" };
    expect(getPrescribedQuantity(input)).toEqual({ prescribedQuantity: "50", prescribedUnit: "g" });
    const grams = toNutritionGrams(input);
    expect(grams.grams).toBe(50);
    expect(getPrescribedQuantity(input)).toEqual({ prescribedQuantity: "50", prescribedUnit: "g" });
  });
});

describe("R1 MealPlanViewModel contract", () => {
  it("preserves golden exact quantities in the shared read model", async () => {
    mockViewModelDeps();
    const { getMealPlanViewModel, assertMealPlanViewModelVersionInvariant } = await import("../lib/repositories/meal-plan-view-model");
    const viewModel = await getMealPlanViewModel("draft-plan");
    expect(viewModel).toBeTruthy();
    assertMealPlanViewModelVersionInvariant(viewModel!);

    const quantities = viewModel!.meals.flatMap((meal) => meal.items.map((item) => [item.displayName, item.prescribedQuantity, item.prescribedUnit]));
    expect(quantities).toEqual(GOLDEN_ADULT_HEALTHY_ITEMS.map(([food, quantity, unit]) => [food, quantity, unit]));
    expect(viewModel!.versionId).toBe("draft-plan:v3");
    expect(viewModel!.nutritionSummary.sourceVersionId).toBe(viewModel!.versionId);
  });

  it("keeps active and draft content separate, without fallback to latest/active", async () => {
    const active = goldenPlan({
      id: "active-plan",
      status: "active",
      version: 2,
      meals: [{ id: "meal", name: "Almoco", suggested_time: null, notes: null, source_recipe_id: null, items: [item("Arroz integral cozido", "120", "g", "1", "active-rice")] }],
    });
    const draft = goldenPlan({
      id: "draft-plan",
      status: "draft",
      version: 3,
      meals: [{ id: "meal", name: "Almoco", suggested_time: null, notes: null, source_recipe_id: null, items: [item("Arroz integral cozido", "150", "g", "1", "draft-rice")] }],
    });
    mockViewModelDeps(active, draft);
    const { getActiveMealPlanViewModel, getMealPlanViewModel } = await import("../lib/repositories/meal-plan-view-model");

    const activeVm = await getActiveMealPlanViewModel("client-1");
    const draftVm = await getMealPlanViewModel("draft-plan");

    expect(activeVm?.status).toBe("active");
    expect(activeVm?.versionId).toBe("active-plan:v2");
    expect(activeVm?.meals[0].items[0].prescribedQuantity).toBe("120");
    expect(draftVm?.status).toBe("draft");
    expect(draftVm?.versionId).toBe("draft-plan:v3");
    expect(draftVm?.meals[0].items[0].prescribedQuantity).toBe("150");
  });

  it("keeps approved alternatives scoped to the same plan id", async () => {
    mockViewModelDeps();
    const { getActiveMealPlanViewModel, getMealPlanViewModel } = await import("../lib/repositories/meal-plan-view-model");

    const activeVm = await getActiveMealPlanViewModel("client-1");
    const draftVm = await getMealPlanViewModel("draft-plan");

    expect(activeVm?.meals.flatMap((meal) => meal.items).find((item) => item.displayName === "Arroz integral cozido")?.approvedAlternatives).toHaveLength(1);
    expect(draftVm?.meals.flatMap((meal) => meal.items).find((item) => item.displayName === "Arroz integral cozido")?.approvedAlternatives).toHaveLength(0);
  });
});
