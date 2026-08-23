import { afterEach, describe, expect, it, vi } from "vitest";
import { mealPlanExchangeSummary } from "@/components/dashboard/MealItemsEditor";
import { currentItemGramsForExchangeGroup } from "@/lib/repositories/meal-plan-alternatives";
import type { MealPlanPayload } from "@/lib/repositories/meal-plans";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("R4 exchange UX quality", () => {
  it("resume trocas com um único vocabulário clínico", () => {
    expect(mealPlanExchangeSummary(4, 0)).toBe("4 trocas");
    expect(mealPlanExchangeSummary(0, 2)).toBe("2 sugestões");
    expect(mealPlanExchangeSummary(0, 0)).toBe("Sem trocas");
    expect(mealPlanExchangeSummary(1, 2, true)).toBe("Atualizar trocas");
  });

  it("detecta a gramatura atual do alimento principal para filtrar grupos stale no portal/print", () => {
    const plan: MealPlanPayload = {
      id: "plan-r4",
      client_id: "client-1",
      title: "Plano R4",
      target_group: "ADULTO_SAUDAVEL",
      status: "draft",
      version: 1,
      notes: null,
      created_at: "now",
      updated_at: "now",
      meals: [
        {
          name: "Almoco",
          items: [
            { food: "Arroz integral cozido", quantity: "150", unit: "g", food_source: "TACO", food_ref_id: "1", resolved_grams_snapshot: 150 },
          ],
        },
      ],
      weekly_slots: [],
      substitutions: [],
      supplements: [],
    };

    expect(currentItemGramsForExchangeGroup(plan, {
      primary_food_source: "TACO",
      primary_food_ref_id: "1",
      primary_food_name: "Arroz integral cozido",
    })).toBe(150);
  });

  it("portal/print ignoram troca aprovada stale quando a quantidade atual mudou", async () => {
    vi.doMock("@/lib/repositories/exchange-groups", () => ({
      listApprovedAlternativesForPlan: vi.fn().mockResolvedValue([
        {
          group: {
            primary_food_source: "TACO",
            primary_food_ref_id: "1",
            primary_food_name: "Arroz integral cozido",
            primary_quantity_grams: 120,
          },
          approved: [
            { food_name: "Arroz branco cozido", quantity_grams: 125 },
          ],
        },
      ]),
    }));
    const { getApprovedMealPlanAlternatives } = await import("@/lib/repositories/meal-plan-alternatives");
    const result = await getApprovedMealPlanAlternatives({
      id: "plan-r4",
      client_id: "client-1",
      title: "Plano R4",
      target_group: "ADULTO_SAUDAVEL",
      status: "draft",
      version: 1,
      notes: null,
      created_at: "now",
      updated_at: "now",
      meals: [
        {
          name: "Almoco",
          items: [
            { food: "Arroz integral cozido", quantity: "150", unit: "g", food_source: "TACO", food_ref_id: "1", resolved_grams_snapshot: 150 },
          ],
        },
      ],
      weekly_slots: [],
      substitutions: [],
      supplements: [],
    });

    expect(result).toEqual([]);
  });
});
