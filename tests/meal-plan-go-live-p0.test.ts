import { beforeEach, describe, expect, it, vi } from "vitest";

const batchCalls: Array<Array<{ sql: string; params?: unknown[] }>> = [];

vi.mock("@/lib/security/encrypted-fields", () => ({
  encryptJsonValue: vi.fn((value: unknown) => JSON.stringify(value)),
  decryptNullableText: vi.fn((value: string | null) => value),
}));

vi.mock("@/lib/repositories/food-portions", () => ({
  getFoodPortionById: vi.fn(),
  toHouseholdMeasureOption: vi.fn(),
}));

vi.mock("@/lib/nutrition/food-snapshot-server", () => ({
  buildItemSnapshot: vi.fn().mockResolvedValue({ food_name_snapshot: null, nutrition_snapshot: null }),
}));

vi.mock("@/lib/d1/client", () => ({
  d1Query: vi.fn(async (sql: string) => {
    if (sql.includes("nutrition_records")) {
      return [{ allergies: "Alergia a leite", restrictions: null, food_aversions: null, diagnoses: null, risk_flags: null }];
    }
    if (sql.includes("FROM protocol_templates")) {
      return [{ id: "tpl-adulto-dieta-base", type: "DIETA", target_group: "ADULTO_SAUDAVEL", title: "Dieta base", is_active: 1, version: 1, template_origin: "SYSTEM", is_default: 1 }];
    }
    return [];
  }),
  d1Batch: vi.fn(async (statements: Array<{ sql: string; params?: unknown[] }>) => {
    batchCalls.push(statements);
    if (statements[0]?.sql.includes("diet_template_meals") && statements.length === 5) {
      return [
        { results: [{ id: "meal-1", template_id: "tpl-adulto-dieta-base", name: "Cafe da manha", meal_context: "BREAKFAST", suggested_time: null, notes: null, source_recipe_id: null, sort_order: 0 }], success: true },
        { results: [{ id: "item-1", meal_id: "meal-1", food: "Iogurte natural", quantity: "170", unit: "g", food_source: "TACO", food_ref_id: "448", canonical_food_id: null, notes: null, sort_order: 0 }], success: true },
        { results: [{ id: "slot-1", meal_id: "meal-1", food_group: "DAIRY", food_subgroup: "YOGURT", nutritional_role: "DAIRY", exchange_list_id: "exl-system-dairy-options", required: 1, exchange_eligible: 1, min_items: 1, max_items: 1, sort_order: 0 }], success: true },
        { results: [{ id: "sf-1", slot_id: "slot-1", food: "Iogurte natural", quantity: "170", unit: "g", source_item_id: "item-1", food_source: "TACO", food_ref_id: "448", canonical_food_id: null, sort_order: 0 }], success: true },
        { results: [{ id: "exl-system-dairy-options", slug: "DAIRY_OPTIONS", active: 1 }], success: true },
      ];
    }
    if (statements[0]?.sql.includes("diet_template_meals")) {
      return [
        { results: [{ id: "meal-1", template_id: "tpl-adulto-dieta-base", name: "Cafe da manha", meal_context: "BREAKFAST", suggested_time: null, notes: null, source_recipe_id: null, sort_order: 0 }], success: true },
        { results: [{ id: "item-1", meal_id: "meal-1", food: "Iogurte natural", quantity: "170", unit: "g", food_source: "TACO", food_ref_id: "448", canonical_food_id: null, notes: null, sort_order: 0 }], success: true },
        { results: [], success: true },
        { results: [], success: true },
      ];
    }
    return statements.map(() => ({ results: [], success: true }));
  }),
  d1Execute: vi.fn(),
}));

vi.mock("@/lib/repositories/protocol-templates", () => ({
  getAllTemplates: vi.fn().mockResolvedValue([
    {
      id: "tpl-adulto-dieta-base",
      type: "DIETA",
      target_group: "ADULTO_SAUDAVEL",
      title: "Dieta base - adulto saudavel",
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
    },
  ]),
  getSlotClassificationBySourceItemId: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/repositories/patient-clinical-markers", () => ({
  listPatientClinicalMarkers: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/repositories/exchange-groups", () => ({
  generateAndSaveExchangeGroup: vi.fn().mockResolvedValue({
    group: { id: "group-new" },
    alternatives: [{ id: "alt-1" }, { id: "alt-2" }],
    classification: { foodGroup: "CARBOHYDRATE" },
    excludedByGroup: 0,
    excludedByRestriction: 0,
  }),
  approveAlternatives: vi.fn(),
  listExchangeGroupsForPlan: vi.fn().mockResolvedValue([]),
  listApprovedAlternativesForPlan: vi.fn().mockResolvedValue([
    {
      group: { id: "group-1", primary_food_name: "Batata-doce cozida", food_group: "CARBOHYDRATE" },
      approved: [
        { id: "alt-1", food_name: "Mandioca", quantity_grams: 105, state: "APPROVED" },
        { id: "alt-2", food_name: "Inhame", quantity_grams: 120, state: "APPROVED" },
      ],
    },
  ]),
}));

beforeEach(() => {
  batchCalls.length = 0;
  vi.clearAllMocks();
  vi.resetModules();
});

describe("Meal Plan Go-Live P0", () => {
  it("preview detecta conflito deterministico antes de importar template", async () => {
    const { previewMealPlanTemplateImport } = await import("../lib/repositories/meal-plans");

    const preview = await previewMealPlanTemplateImport({ clientId: "client-1", targetGroup: "ADULTO_SAUDAVEL" });

    expect(preview.template).toMatchObject({ origin: "SYSTEM", mealCount: 1, itemCount: 1 });
    expect(preview.hasConflicts).toBe(true);
    expect(preview.conflicts[0]).toMatchObject({ food: "Iogurte natural", source: "free_text" });
  });

  it("bloqueia clone silencioso quando preview encontrou conflito e nao houve confirmacao", async () => {
    const { createMealPlanFromTemplates } = await import("../lib/repositories/meal-plans");

    await expect(createMealPlanFromTemplates({ clientId: "client-1", targetGroup: "ADULTO_SAUDAVEL" })).rejects.toThrow(/precisam ser revisados/);
    expect(batchCalls.flat().some((statement) => statement.sql.includes("INSERT INTO meal_plans"))).toBe(false);
  });

  it("leitura canonica entrega exchange_groups aprovados e deduplica legado equivalente", async () => {
    const { getApprovedMealPlanAlternatives } = await import("../lib/repositories/meal-plan-alternatives");

    const groups = await getApprovedMealPlanAlternatives({
      id: "plan-1",
      substitutions: [
        { base_food: "Batata-doce cozida", option_food: "Mandioca", quantity: "105", unit: "g", approved_by_professional: true },
        { base_food: "Batata-doce cozida", option_food: "Arroz integral", quantity: "105", unit: "g", approved_by_professional: false },
      ],
    } as never);

    expect(groups).toHaveLength(1);
    expect(groups[0].alternatives.map((item) => item.optionFoodName)).toEqual(["Mandioca", "Inhame"]);
  });

  it("gera lista persistida e aprova alternativas quando plano vem de template pronto", async () => {
    const { generateExchangeGroupsForMealPlanItems } = await import("../lib/repositories/meal-plans");
    const exchangeGroups = await import("@/lib/repositories/exchange-groups");
    const { TACO_REFERENCES } = await import("@/lib/nutrition/taco");
    const rice = TACO_REFERENCES.find((food) => /arroz, tipo 1, cozido/i.test(food.descricao));
    expect(rice).toBeTruthy();

    const result = await generateExchangeGroupsForMealPlanItems({
      clientId: "client-1",
      approveGenerated: true,
      plan: {
        id: "plan-template",
        meals: [{
          name: "Almoco",
          items: [{
            food: "Arroz integral cozido",
            quantity: "120",
            unit: "g",
            food_source: "TACO",
            food_ref_id: String(rice!.numero),
            slot_exchange_eligible: true,
          }],
        }],
      } as never,
    });

    expect(result).toMatchObject({ generated: 1, approved: 2 });
    expect(exchangeGroups.generateAndSaveExchangeGroup).toHaveBeenCalledWith(expect.objectContaining({
      mealPlanId: "plan-template",
      primaryGrams: 120,
      limit: 5,
    }));
    expect(exchangeGroups.approveAlternatives).toHaveBeenCalledWith("group-new", ["alt-1", "alt-2"]);
  });
});
