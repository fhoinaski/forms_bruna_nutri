import { describe, expect, it } from "vitest";
import { normalizeMealPlanDelivery, type MealPlanDeliveryPayload } from "@/lib/repositories/meal-plan-delivery";

function delivery(overrides: Partial<MealPlanDeliveryPayload> = {}): MealPlanDeliveryPayload {
  return {
    planId: "plan-active",
    versionId: "plan-active:v2",
    activeVersionId: "plan-active:v2",
    versionNumber: 2,
    status: "active",
    title: "Plano ativo",
    notes: "Orientação para paciente",
    updatedAt: "2026-08-23T10:00:00.000Z",
    nutritionSummary: {
      sourceVersionId: "plan-active:v2",
      energyKcal: 1800,
      proteinG: 120,
      carbohydrateG: 210,
      fatG: 55,
      fiberG: 28,
      unresolvedItems: 0,
    },
    meals: [
      {
        id: "meal-breakfast",
        name: "Café da manhã",
        time: "08:00",
        notes: null,
        recipeId: null,
        items: [
          {
            id: "item-bread",
            foodRef: { source: "TACO", refId: "52", canonicalFoodId: null },
            displayName: "Pão integral",
            prescribedQuantity: "50",
            prescribedUnit: "g",
            notes: null,
            approvedExchanges: [{ foodName: "Tapioca", quantity: "55", unit: "g", notes: null }],
          },
          {
            id: "item-egg",
            foodRef: { source: "TACO", refId: "489", canonicalFoodId: null },
            displayName: "Ovo cozido",
            prescribedQuantity: "100",
            prescribedUnit: "g",
            notes: null,
            approvedExchanges: [],
          },
        ],
      },
      {
        id: "meal-lunch",
        name: "Almoço",
        time: "12:30",
        notes: null,
        recipeId: null,
        items: [
          {
            id: "item-rice",
            foodRef: { source: "TACO", refId: "1", canonicalFoodId: null },
            displayName: "Arroz integral",
            prescribedQuantity: "120",
            prescribedUnit: "g",
            notes: null,
            approvedExchanges: [
              { foodName: "Batata-doce", quantity: "165", unit: "g", notes: null },
              { foodName: "Mandioca", quantity: "105", unit: "g", notes: null },
            ],
          },
        ],
      },
    ],
    weeklySlots: [],
    supplements: [],
    invalidReasons: [],
    sourcePlan: {
      id: "plan-active",
      client_id: "client-1",
      title: "Plano ativo",
      target_group: null,
      status: "active",
      version: 2,
      notes: "Orientação para paciente",
      created_at: "2026-08-23T09:00:00.000Z",
      updated_at: "2026-08-23T10:00:00.000Z",
      meals: [],
      weekly_slots: [],
      substitutions: [],
      supplements: [],
    },
    ...overrides,
  };
}

describe("R5 canonical meal plan delivery", () => {
  it("normaliza somente a estrutura clínica comparável entre portal e print", () => {
    const normalized = normalizeMealPlanDelivery(delivery());
    expect(normalized).toEqual({
      versionId: "plan-active:v2",
      activeVersionId: "plan-active:v2",
      meals: [
        {
          name: "Café da manhã",
          time: "08:00",
          items: [
            {
              foodRef: "TACO:52:",
              name: "Pão integral",
              quantity: "50",
              unit: "g",
              approvedExchanges: [{ name: "Tapioca", quantity: "55", unit: "g" }],
            },
            {
              foodRef: "TACO:489:",
              name: "Ovo cozido",
              quantity: "100",
              unit: "g",
              approvedExchanges: [],
            },
          ],
        },
        {
          name: "Almoço",
          time: "12:30",
          items: [
            {
              foodRef: "TACO:1:",
              name: "Arroz integral",
              quantity: "120",
              unit: "g",
              approvedExchanges: [
                { name: "Batata-doce", quantity: "165", unit: "g" },
                { name: "Mandioca", quantity: "105", unit: "g" },
              ],
            },
          ],
        },
      ],
    });
  });

  it("permite comparar portal e print por estrutura, não por HTML", () => {
    const portal = normalizeMealPlanDelivery(delivery());
    const print = normalizeMealPlanDelivery(delivery());
    expect(portal).toEqual(print);
  });

  it("expõe divergência de versão active quando um consumidor usa draft por engano", () => {
    const portal = normalizeMealPlanDelivery(delivery());
    const draftPrint = normalizeMealPlanDelivery(delivery({
      planId: "plan-draft",
      versionId: "plan-draft:v3",
      activeVersionId: "plan-active:v2",
      versionNumber: 3,
      status: "draft",
    }));
    expect(draftPrint.versionId).not.toBe(portal.versionId);
    expect(draftPrint.activeVersionId).toBe(portal.versionId);
  });
});
