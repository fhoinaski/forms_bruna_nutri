import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MealPlanPayload } from "@/lib/repositories/meal-plans";

const deps = vi.hoisted(() => ({
  getFoodByReference: vi.fn(),
  listPatientClinicalMarkers: vi.fn(),
  listApprovedAlternativesForPlan: vi.fn(),
  buildMealPlanDelivery: vi.fn(),
  getFoodPortionById: vi.fn(),
}));

vi.mock("@/lib/nutrition/food-catalog", () => ({ getFoodByReference: deps.getFoodByReference }));
vi.mock("@/lib/repositories/patient-clinical-markers", () => ({ listPatientClinicalMarkers: deps.listPatientClinicalMarkers }));
vi.mock("@/lib/repositories/exchange-groups", () => ({ listApprovedAlternativesForPlan: deps.listApprovedAlternativesForPlan }));
vi.mock("@/lib/repositories/meal-plan-delivery", () => ({ buildMealPlanDelivery: deps.buildMealPlanDelivery }));
vi.mock("@/lib/repositories/food-portions", () => ({ getFoodPortionById: deps.getFoodPortionById, toHouseholdMeasureOption: (value: unknown) => value }));

const rice = { fonte: "taco", numero: 1, descricao: "Arroz integral cozido", energia_kcal: 124, proteina_g: 2.6, carboidrato_g: 25.8, lipidios_g: 1, fibra_g: 2.7 };
const milk = { fonte: "taco", numero: 458, descricao: "Leite de vaca integral", energia_kcal: 61, proteina_g: 3.2, carboidrato_g: 4.7, lipidios_g: 3.3, fibra_g: 0 };

function plan(overrides: Partial<MealPlanPayload> = {}): MealPlanPayload {
  return {
    id: "plan-1",
    client_id: "client-1",
    title: "Plano",
    target_group: null,
    status: "draft",
    version: 1,
    notes: null,
    created_at: "2026-08-23T10:00:00.000Z",
    updated_at: "2026-08-23T10:00:00.000Z",
    meals: [{
      id: "meal-1",
      name: "Almoco",
      suggested_time: null,
      notes: null,
      source_recipe_id: null,
      items: [{
        id: "item-1",
        food: "Arroz integral cozido",
        quantity: "120",
        unit: "g",
        food_source: "TACO",
        food_ref_id: "1",
        resolved_grams_snapshot: 120,
        slot_nutritional_role: "MAIN_STARCH",
        template_slot_id: "slot-1",
      }],
    }],
    weekly_slots: [],
    substitutions: [],
    supplements: [],
    ...overrides,
  };
}

function mockValidDelivery(input: MealPlanPayload, energyKcal = 1800) {
  deps.buildMealPlanDelivery.mockResolvedValue({
    invalidReasons: [],
    nutritionSummary: {
      sourceVersionId: `${input.id}:v${input.version}`,
      energyKcal,
      proteinG: 112,
      carbohydrateG: 221,
      fatG: 56,
      fiberG: 28,
      unresolvedItems: 0,
    },
  });
}

describe("R6 validateMealPlanForPublication", () => {
  beforeEach(() => {
    deps.getFoodByReference.mockReset();
    deps.listPatientClinicalMarkers.mockReset();
    deps.listApprovedAlternativesForPlan.mockReset();
    deps.buildMealPlanDelivery.mockReset();
    deps.getFoodPortionById.mockReset();
    deps.getFoodByReference.mockResolvedValue({ macroReference: rice });
    deps.listPatientClinicalMarkers.mockResolvedValue([]);
    deps.listApprovedAlternativesForPlan.mockResolvedValue([]);
    deps.getFoodPortionById.mockResolvedValue(null);
  });

  it("golden válido não possui blockers", async () => {
    const input = plan();
    mockValidDelivery(input);
    const { validateMealPlanForPublication } = await import("@/lib/repositories/meal-plan-publication");
    const review = await validateMealPlanForPublication(input);
    expect(review.valid).toBe(true);
    expect(review.blockers).toHaveLength(0);
    expect(review.summary).toMatchObject({ meals: 1, items: 1, resolvedItems: 1, blockers: 0 });
  });

  it("bloqueia alimento sem identidade estruturada", async () => {
    const input = plan({ meals: [{ ...plan().meals[0], items: [{ ...plan().meals[0].items[0], food_source: null, food_ref_id: null }] }] });
    mockValidDelivery(input);
    const { validateMealPlanForPublication } = await import("@/lib/repositories/meal-plan-publication");
    const review = await validateMealPlanForPublication(input);
    expect(review.valid).toBe(false);
    expect(review.blockers.map((item) => item.code)).toContain("UNRESOLVED_FOOD");
  });

  it("bloqueia quantidade inválida", async () => {
    const input = plan({ meals: [{ ...plan().meals[0], items: [{ ...plan().meals[0].items[0], quantity: "0", resolved_grams_snapshot: null }] }] });
    mockValidDelivery(input);
    const { validateMealPlanForPublication } = await import("@/lib/repositories/meal-plan-publication");
    const review = await validateMealPlanForPublication(input);
    expect(review.valid).toBe(false);
    expect(review.blockers.map((item) => item.code)).toContain("INVALID_QUANTITY");
  });

  it("bloqueia troca aprovada stale", async () => {
    const input = plan({ meals: [{ ...plan().meals[0], items: [{ ...plan().meals[0].items[0], quantity: "150", resolved_grams_snapshot: 150 }] }] });
    mockValidDelivery(input);
    deps.listApprovedAlternativesForPlan.mockResolvedValue([{
      group: { primary_food_source: "TACO", primary_food_ref_id: "1", primary_food_name: "Arroz integral cozido", primary_quantity_grams: 120 },
      approved: [{ id: "alt-1" }],
    }]);
    const { validateMealPlanForPublication } = await import("@/lib/repositories/meal-plan-publication");
    const review = await validateMealPlanForPublication(input);
    expect(review.valid).toBe(false);
    expect(review.blockers.map((item) => item.code)).toContain("STALE_APPROVED_EXCHANGE");
  });

  it("bloqueia conflito objetivo de alergia estruturada", async () => {
    const input = plan({ meals: [{ ...plan().meals[0], items: [{ ...plan().meals[0].items[0], food: "Leite de vaca integral", food_ref_id: "458" }] }] });
    mockValidDelivery(input);
    deps.getFoodByReference.mockResolvedValue({ macroReference: milk });
    deps.listPatientClinicalMarkers.mockResolvedValue([{ id: "m1", type: "ALLERGY", normalized_code: "MILK", label: "Leite", severity: "severe", status: "ACTIVE" }]);
    const { validateMealPlanForPublication } = await import("@/lib/repositories/meal-plan-publication");
    const review = await validateMealPlanForPublication(input);
    expect(review.valid).toBe(false);
    expect(review.blockers.map((item) => item.code)).toContain("RESTRICTION_CONFLICT");
  });

  it("diferença de meta energética gera warning e não bloqueia", async () => {
    const input = plan({ target_energy_kcal: 1800 });
    mockValidDelivery(input, 1700);
    const { validateMealPlanForPublication } = await import("@/lib/repositories/meal-plan-publication");
    const review = await validateMealPlanForPublication(input);
    expect(review.valid).toBe(true);
    expect(review.blockers).toHaveLength(0);
    expect(review.warnings.map((item) => item.code)).toContain("TARGET_ENERGY_DIFFERENCE");
  });
});
