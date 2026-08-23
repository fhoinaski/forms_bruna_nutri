import { afterEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_TEMPLATE_FOOD_CONTRACTS } from "@/lib/meal-templates/system-template-contract";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const TEMPLATE_ROW = {
  id: "tpl-adulto-saudavel-dieta-base",
  type: "DIETA",
  target_group: "ADULTO_SAUDAVEL",
  title: "Dieta base - adulto saudável",
  content: "{}",
  notes: null,
  is_active: 1,
  created_at: "now",
  updated_at: "now",
  clinical_risk_level: "low",
  requires_professional_review: 0,
  version: 1,
  structure_version: "v2",
  template_origin: "SYSTEM",
  owner_admin_id: null,
  is_default: 1,
};

const PLAN_ROW = {
  id: "plan-r2",
  client_id: "client-1",
  title: "Plano R2",
  target_group: "ADULTO_SAUDAVEL",
  status: "draft",
  version: 1,
  notes: null,
  target_energy_kcal: null,
  target_protein_g: null,
  target_carbohydrate_g: null,
  target_fat_g: null,
  template_id: TEMPLATE_ROW.id,
  template_version: 1,
  created_at: "now",
  updated_at: "now",
};

function goldenRows(overrides: { beanRole?: string; unresolvedFood?: boolean } = {}) {
  const foods = [
    { id: "item-bread", meal: "meal-breakfast", food: "Pao de forma integral", quantity: "50", unit: "g", order: 0 },
    { id: "item-egg", meal: "meal-breakfast", food: "Ovo de galinha inteiro cozido", quantity: "100", unit: "g", order: 1 },
    { id: "item-banana", meal: "meal-breakfast", food: "Banana prata", quantity: "80", unit: "g", order: 2 },
    { id: "item-rice", meal: "meal-lunch", food: "Arroz integral cozido", quantity: "120", unit: "g", order: 0 },
    { id: "item-bean", meal: "meal-lunch", food: "Feijao carioca cozido", quantity: "100", unit: "g", order: 1 },
    { id: "item-chicken", meal: "meal-lunch", food: "Peito de frango grelhado", quantity: "120", unit: "g", order: 2 },
    { id: "item-broccoli", meal: "meal-lunch", food: "Brocolis cozido", quantity: "100", unit: "g", order: 3 },
  ];
  const meals = [
    { id: "meal-breakfast", template_id: TEMPLATE_ROW.id, name: "Cafe da manha", meal_context: "BREAKFAST", suggested_time: null, notes: null, source_recipe_id: null, sort_order: 0 },
    { id: "meal-lunch", template_id: TEMPLATE_ROW.id, name: "Almoco", meal_context: "LUNCH", suggested_time: null, notes: null, source_recipe_id: null, sort_order: 1 },
  ];
  const items = foods.map((row) => {
    const contract = SYSTEM_TEMPLATE_FOOD_CONTRACTS[row.food];
    return {
      id: row.id,
      meal_id: row.meal,
      food: row.food,
      quantity: row.quantity,
      unit: row.unit,
      notes: null,
      food_source: overrides.unresolvedFood && row.id === "item-rice" ? null : contract.food_source,
      food_ref_id: overrides.unresolvedFood && row.id === "item-rice" ? null : contract.food_ref_id,
      canonical_food_id: contract.canonical_food_id,
      sort_order: row.order,
    };
  });
  const slots = foods.map((row) => {
    const contract = SYSTEM_TEMPLATE_FOOD_CONTRACTS[row.food];
    return {
      id: `slot-${row.id}`,
      meal_id: row.meal,
      food_group: contract.food_group,
      food_subgroup: contract.food_subgroup,
      nutritional_role: row.id === "item-bean" ? overrides.beanRole ?? contract.clinical_role : contract.clinical_role,
      exchange_list_id: contract.exchange_list_id,
      required: 1,
      exchange_eligible: contract.exchange_eligible ? 1 : 0,
      min_items: 1,
      max_items: 1,
      sort_order: row.order,
    };
  });
  const slotFoods = foods.map((row) => {
    const contract = SYSTEM_TEMPLATE_FOOD_CONTRACTS[row.food];
    return {
      id: `sf-${row.id}`,
      slot_id: `slot-${row.id}`,
      food: row.food,
      quantity: row.quantity,
      unit: row.unit,
      source_item_id: row.id,
      food_source: overrides.unresolvedFood && row.id === "item-rice" ? null : contract.food_source,
      food_ref_id: overrides.unresolvedFood && row.id === "item-rice" ? null : contract.food_ref_id,
      canonical_food_id: contract.canonical_food_id,
      sort_order: 0,
    };
  });
  const exchangeLists = Object.values(SYSTEM_TEMPLATE_FOOD_CONTRACTS)
    .map((contract) => contract.exchange_list_id)
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ id, slug: id.replace(/^exl-system-/, "").toUpperCase(), active: 1 }));
  return { meals, items, slots, slotFoods, exchangeLists };
}

function mockD1ForGolden(overrides: { beanRole?: string; unresolvedFood?: boolean } = {}) {
  const calls: Array<Array<{ sql: string; params?: unknown[] }>> = [];
  const rows = goldenRows(overrides);
  const d1Query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM protocol_templates")) return [TEMPLATE_ROW];
    if (sql.includes("FROM meal_plans")) return [PLAN_ROW];
    return [];
  });
  const d1Batch = vi.fn(async (statements: Array<{ sql: string; params?: unknown[] }>) => {
    calls.push(statements);
    if (statements.length === 5 && statements[0].sql.includes("diet_template_meals")) {
      return [
        { results: rows.meals, success: true },
        { results: rows.items, success: true },
        { results: rows.slots, success: true },
        { results: rows.slotFoods, success: true },
        { results: rows.exchangeLists, success: true },
      ];
    }
    if (statements.length === 4 && statements[0].sql.includes("diet_template_meals")) {
      return [
        { results: rows.meals, success: true },
        { results: rows.items, success: true },
        { results: [], success: true },
        { results: [], success: true },
      ];
    }
    return statements.map(() => ({ results: [], success: true }));
  });
  vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Batch, d1Execute: vi.fn() }));
  return { calls, d1Query, d1Batch };
}

describe("R2 system template integrity", () => {
  it("contrato golden define roles clínicos e listas curadas explícitas", () => {
    expect(SYSTEM_TEMPLATE_FOOD_CONTRACTS["Feijao carioca cozido"].clinical_role).toBe("LEGUME");
    expect(SYSTEM_TEMPLATE_FOOD_CONTRACTS["Arroz integral cozido"]).toMatchObject({ clinical_role: "MAIN_STARCH", exchange_list_id: "exl-system-main-meal-starches" });
    expect(SYSTEM_TEMPLATE_FOOD_CONTRACTS["Peito de frango grelhado"].clinical_role).toBe("MAIN_PROTEIN");
    expect(SYSTEM_TEMPLATE_FOOD_CONTRACTS["Brocolis cozido"].clinical_role).toBe("VEGETABLE");
    expect(SYSTEM_TEMPLATE_FOOD_CONTRACTS["Pao de forma integral"]).toMatchObject({ clinical_role: "BREAKFAST_CARB", exchange_list_id: "exl-system-breakfast-carbs" });
  });

  it("validador aprova o template SYSTEM adulto saudável quando identidade, roles, quantidades e listas estão íntegros", async () => {
    mockD1ForGolden();
    const { validateMealTemplateIntegrity } = await import("../lib/repositories/meal-template-integrity");

    const result = await validateMealTemplateIntegrity(TEMPLATE_ROW.id);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.stats).toMatchObject({ meals: 2, slots: 7, foods: 7, resolved: 7, calculable: 7 });
  });

  it("validador reprova feijão quando o role clínico volta a ser composição/macro", async () => {
    mockD1ForGolden({ beanRole: "PLANT_PROTEIN" });
    const { validateMealTemplateIntegrity } = await import("../lib/repositories/meal-template-integrity");

    const result = await validateMealTemplateIntegrity(TEMPLATE_ROW.id);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "MISSING_SLOT_ROLE" && /PLANT_PROTEIN/.test(issue.message))).toBe(true);
  });

  it("criação por template preserva mealContext, identidade, quantidade e role, sem aprovar alternativas automaticamente", async () => {
    const { calls } = mockD1ForGolden();
    const approveAlternatives = vi.fn();
    vi.doMock("@/lib/repositories/protocol-templates", () => ({
      getAllTemplates: vi.fn().mockResolvedValue([TEMPLATE_ROW]),
      getSlotClassificationBySourceItemId: vi.fn().mockResolvedValue(new Map(goldenRows().slots.map((slot) => [
        slot.id.replace("slot-", ""),
        {
          slot_id: slot.id,
          food_group: slot.food_group,
          food_subgroup: slot.food_subgroup,
          nutritional_role: slot.nutritional_role,
          exchange_eligible: Boolean(slot.exchange_eligible),
          exchange_list_id: slot.exchange_list_id,
        },
      ]))),
    }));
    vi.doMock("@/lib/repositories/exchange-groups", () => ({
      generateAndSaveExchangeGroup: vi.fn().mockResolvedValue({ group: { id: "group-1" }, alternatives: [{ id: "alt-1" }] }),
      approveAlternatives,
      listExchangeGroupsForPlan: vi.fn().mockResolvedValue([]),
      NoEligibleExchangeAlternativesError: class NoEligibleExchangeAlternativesError extends Error {},
    }));
    vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({ listPatientClinicalMarkers: vi.fn().mockResolvedValue([]) }));
    vi.doMock("@/lib/repositories/nutrition-records", () => ({ getExistingNutritionRecord: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/repositories/food-portions", () => ({ getFoodPortionById: vi.fn(), toHouseholdMeasureOption: vi.fn() }));
    vi.doMock("@/lib/nutrition/food-snapshot-server", () => ({ buildItemSnapshot: vi.fn().mockResolvedValue({ food_name_snapshot: null, nutrition_snapshot: null }) }));
    vi.doMock("@/lib/security/encrypted-fields", () => ({ encryptJsonValue: (value: unknown) => JSON.stringify(value) }));
    const { createMealPlanFromTemplates } = await import("../lib/repositories/meal-plans");

    await createMealPlanFromTemplates({ clientId: "client-1", targetGroup: "ADULTO_SAUDAVEL", title: "Plano R2" });

    const insertMeals = calls.flat().find((statement) => statement.sql.includes("INSERT INTO meal_plan_meals"));
    const mealRows = JSON.parse(insertMeals?.params?.[0] as string) as Array<Record<string, unknown>>;
    expect(mealRows.map((meal) => meal.mealContext)).toEqual(["BREAKFAST", "LUNCH"]);
    const insertItems = calls.flat().find((statement) => statement.sql.includes("INSERT INTO meal_plan_items"));
    const itemRows = JSON.parse(insertItems?.params?.[0] as string) as Array<Record<string, unknown>>;
    expect(itemRows.find((item) => item.food === "Feijao carioca cozido")).toMatchObject({
      quantity: "100",
      unit: "g",
      foodSource: "TACO",
      foodRefId: "561",
      slotNutritionalRole: "LEGUME",
      slotExchangeEligible: 1,
    });
    expect(approveAlternatives).not.toHaveBeenCalled();
  });

  it("criação por template falha com TEMPLATE_INTEGRITY_ERROR quando alimento obrigatório não tem identidade", async () => {
    mockD1ForGolden({ unresolvedFood: true });
    vi.doMock("@/lib/repositories/protocol-templates", () => ({
      getAllTemplates: vi.fn().mockResolvedValue([TEMPLATE_ROW]),
      getSlotClassificationBySourceItemId: vi.fn().mockResolvedValue(new Map()),
    }));
    const { createMealPlanFromTemplates, MealTemplateIntegrityError } = await import("../lib/repositories/meal-plans");

    await expect(createMealPlanFromTemplates({ clientId: "client-1", targetGroup: "ADULTO_SAUDAVEL" })).rejects.toThrow(MealTemplateIntegrityError);
  });
});
