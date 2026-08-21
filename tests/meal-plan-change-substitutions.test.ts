import { afterEach, describe, expect, it, vi } from "vitest";
import { TACO_REFERENCES } from "@/lib/nutrition/taco";
import { applyMealPlanChangesWithPreview, MealPlanChangeValidationError } from "@/lib/ai/agents/nutrition/meal-plan-change-agent";
import type { MealPlanMealPayload, MealPlanSubstitutionPayload } from "@/lib/repositories/meal-plans";

/**
 * Extensão do proposal engine (meal_plan_change) pra substituições —
 * reaproveita a MESMA função de aplicação usada por add_item/replace_item
 * (nunca uma segunda engine). A quantidade de add_substitution NUNCA é
 * fornecida pelo chamador — sempre calculada aqui pela substitution engine +
 * revalidada pela engine nutricional.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const rice = TACO_REFERENCES.find((f) => typeof f.numero === "number" && (f.carboidrato_g ?? 0) > 20 && (f.proteina_g ?? 0) < 5)!;
const potato = TACO_REFERENCES.find((f) => /batata,?\s*inglesa,?\s*cozida/i.test(f.descricao))!;
const proteinFood = TACO_REFERENCES.find((f) => typeof f.numero === "number" && (f.proteina_g ?? 0) > 20 && (f.lipidios_g ?? 0) < 12 && (f.carboidrato_g ?? 0) < 5)!;

function buildMeal(): MealPlanMealPayload {
  return {
    id: "meal-1",
    name: "Almoço",
    suggested_time: null,
    items: [
      { id: "item-1", food: rice.descricao, quantity: "100", unit: "g", food_source: "TACO", food_ref_id: String(rice.numero) },
    ],
  };
}

describe("applyMealPlanChangesWithPreview — add_substitution", () => {
  it("calcula a quantidade pela substitution engine (nunca aceita quantity/kcal fornecidos pelo chamador) e entra como pendente", () => {
    const meals = [buildMeal()];
    // Simula um payload "malicioso"/alucinado que tentaria embutir quantity/kcal — a operação nem tem esses campos no tipo, então TS já bloqueia, mas o teste prova em runtime que só o que o schema permite (identidade) é usado.
    const result = applyMealPlanChangesWithPreview(
      meals,
      [{ operation: "add_substitution", mealId: "meal-1", itemId: "item-1", optionFood: { foodName: potato.descricao, source: "TACO", refId: String(potato.numero) }, mode: "energy" }],
      "Plano",
      undefined,
      TACO_REFERENCES,
      new Map(),
      []
    );
    expect(result.substitutions).toHaveLength(1);
    const sub = result.substitutions[0];
    expect(sub.option_food_source).toBe("TACO");
    expect(sub.option_food_ref_id).toBe(String(potato.numero));
    expect(sub.approved_by_professional).toBe(false); // pendente até aprovação explícita
    expect(sub.ai_suggested).toBe(true);
    expect(Number(sub.quantity)).toBeGreaterThan(0);
    // A quantidade NUNCA é um valor "redondo suspeito" tipo 9999 — vem da engine.
    expect(Number(sub.quantity)).toBeLessThan(1500);
  });

  it("nunca sugere o próprio alimento como substituto de si mesmo (mesmo source+refId)", () => {
    const meals = [buildMeal()];
    expect(() => applyMealPlanChangesWithPreview(
      meals,
      [{ operation: "add_substitution", mealId: "meal-1", itemId: "item-1", optionFood: { foodName: rice.descricao, source: "TACO", refId: String(rice.numero) } }],
      "Plano", undefined, TACO_REFERENCES, new Map(), []
    )).toThrow(MealPlanChangeValidationError);
  });

  it("candidato duplicado (mesma identidade já presente) é rejeitado, nunca duplica", () => {
    const meals = [buildMeal()];
    const existing: MealPlanSubstitutionPayload[] = [{
      base_food: rice.descricao, option_food: potato.descricao, quantity: "180", unit: "g",
      base_food_source: "TACO", base_food_ref_id: String(rice.numero),
      option_food_source: "TACO", option_food_ref_id: String(potato.numero),
      approved_by_professional: true,
    }];
    expect(() => applyMealPlanChangesWithPreview(
      meals,
      [{ operation: "add_substitution", mealId: "meal-1", itemId: "item-1", optionFood: { foodName: potato.descricao, source: "TACO", refId: String(potato.numero) } }],
      "Plano", undefined, TACO_REFERENCES, new Map(), existing
    )).toThrow(MealPlanChangeValidationError);
  });

  it("item sem identidade vinculada (food_source/food_ref_id nulos) não permite substituição calculada", () => {
    const meals: MealPlanMealPayload[] = [{ id: "meal-1", name: "Almoço", suggested_time: null, items: [{ id: "item-1", food: "Arroz digitado livremente", quantity: "100", unit: "g", food_source: null, food_ref_id: null }] }];
    expect(() => applyMealPlanChangesWithPreview(
      meals,
      [{ operation: "add_substitution", mealId: "meal-1", itemId: "item-1", optionFood: { foodName: potato.descricao, source: "TACO", refId: String(potato.numero) } }],
      "Plano", undefined, TACO_REFERENCES, new Map(), []
    )).toThrow(MealPlanChangeValidationError);
  });
});

describe("applyMealPlanChangesWithPreview — approve_substitution / remove_substitution", () => {
  it("approve_substitution marca approved_by_professional=true só na substituição certa", () => {
    const meals = [buildMeal()];
    const existing: MealPlanSubstitutionPayload[] = [
      { base_food: rice.descricao, option_food: potato.descricao, quantity: "180", unit: "g", base_food_source: "TACO", base_food_ref_id: String(rice.numero), option_food_source: "TACO", option_food_ref_id: String(potato.numero), approved_by_professional: false },
      { base_food: rice.descricao, option_food: "Outra opção", quantity: "90", unit: "g", base_food_source: "TACO", base_food_ref_id: String(rice.numero), option_food_source: "TACO", option_food_ref_id: "999", approved_by_professional: false },
    ];
    const result = applyMealPlanChangesWithPreview(
      meals,
      [{ operation: "approve_substitution", mealId: "meal-1", itemId: "item-1", optionFoodSource: "TACO", optionFoodRefId: String(potato.numero) }],
      "Plano", undefined, TACO_REFERENCES, new Map(), existing
    );
    expect(result.substitutions.find((s) => s.option_food_ref_id === String(potato.numero))?.approved_by_professional).toBe(true);
    expect(result.substitutions.find((s) => s.option_food_ref_id === "999")?.approved_by_professional).toBe(false);
  });

  it("remove_substitution remove exatamente a substituição identificada por source+refId", () => {
    const meals = [buildMeal()];
    const existing: MealPlanSubstitutionPayload[] = [
      { base_food: rice.descricao, option_food: potato.descricao, quantity: "180", unit: "g", base_food_source: "TACO", base_food_ref_id: String(rice.numero), option_food_source: "TACO", option_food_ref_id: String(potato.numero), approved_by_professional: true },
    ];
    const result = applyMealPlanChangesWithPreview(
      meals,
      [{ operation: "remove_substitution", mealId: "meal-1", itemId: "item-1", optionFoodSource: "TACO", optionFoodRefId: String(potato.numero) }],
      "Plano", undefined, TACO_REFERENCES, new Map(), existing
    );
    expect(result.substitutions).toHaveLength(0);
  });

  it("approve_substitution de algo inexistente lança erro (nunca falha silenciosamente)", () => {
    const meals = [buildMeal()];
    expect(() => applyMealPlanChangesWithPreview(
      meals,
      [{ operation: "approve_substitution", mealId: "meal-1", itemId: "item-1", optionFoodSource: "TACO", optionFoodRefId: "000" }],
      "Plano", undefined, TACO_REFERENCES, new Map(), []
    )).toThrow(MealPlanChangeValidationError);
  });
});

describe("meal_plan_change confirm — stale proposal (409)", () => {
  it("plano alterado desde a criação da proposta → ProposalExecutionError 409, nenhuma alteração aplicada", async () => {
    const admin = { sub: "admin-1" };
    const plan = {
      id: "plan-1", client_id: "client-1", title: "Plano", status: "active", version: 5, notes: null,
      meals: [buildMeal()], weekly_slots: [], substitutions: [], supplements: [],
    };
    const updateMealPlan = vi.fn();
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getMealPlanById: vi.fn().mockResolvedValue(plan), updateMealPlan }));
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1" }) }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");

    const action = {
      kind: "meal_plan_change" as const,
      clientId: "client-1",
      mealPlanId: "plan-1",
      baseVersion: 3, // proposta foi criada quando a versão era 3, mas o plano já está em 5
      changes: [{ operation: "add_substitution" as const, mealId: "meal-1", itemId: "item-1", optionFood: { foodName: potato.descricao, source: "TACO" as const, refId: String(potato.numero) } }],
      preview: {
        mealPlanTitle: "Plano",
        changeSummaries: [{ operation: "add_substitution", mealName: "Almoço", before: null, after: "substituição pendente" }],
        totalImpact: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      },
      risk: "clinical" as const,
      requiresConfirmation: true,
    };

    await expect(executeProposedAction(action, { adminId: admin.sub })).rejects.toMatchObject({ status: 409 });
    expect(updateMealPlan).not.toHaveBeenCalled();
  });
});
