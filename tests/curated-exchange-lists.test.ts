import { beforeEach, describe, expect, it, vi } from "vitest";
import { TACO_REFERENCES } from "@/lib/nutrition/taco";
import { classifyFoodExchangeGroup } from "@/lib/nutrition/food-exchange-hierarchy";

const d1Query = vi.hoisted(() => vi.fn());

vi.mock("@/lib/d1/client", () => ({ d1Query }));
vi.mock("@/lib/nutrition/food-catalog", () => ({
  getFoodByReference: vi.fn(async (ref: { sourceId: string }) => {
    const food = TACO_REFERENCES.find((candidate) => String(candidate.numero) === ref.sourceId);
    return food ? { macroReference: food } : null;
  }),
}));

const mainStarches = {
  id: "exl-system-main-meal-starches",
  name: "Carboidratos - refeicao principal",
  slug: "MAIN_MEAL_STARCHES",
  description: null,
  origin: "SYSTEM",
  owner_admin_id: null,
  food_group: "CARBOHYDRATE",
  food_subgroup: null,
  nutritional_role: "STARCH_SOURCE",
  meal_context: "LUNCH,DINNER",
  culinary_role: "STARCH_MAIN",
  default_profile: "CARBOHYDRATE",
  active: 1,
  version: 1,
  created_at: "2026-08-22T00:00:00.000Z",
  updated_at: "2026-08-22T00:00:00.000Z",
};

const breakfastCarbs = {
  ...mainStarches,
  id: "exl-system-breakfast-carbs",
  name: "Carboidratos - cafe/lanche",
  slug: "BREAKFAST_CARBS",
  meal_context: "BREAKFAST,MORNING_SNACK,AFTERNOON_SNACK,SUPPER",
  culinary_role: "BREAKFAST_CARB",
  default_profile: "BALANCED",
};

function taco(description: RegExp) {
  const food = TACO_REFERENCES.find((candidate) => description.test(candidate.descricao));
  if (!food) throw new Error(`fixture nao encontrada: ${description}`);
  return food;
}

beforeEach(() => {
  d1Query.mockReset();
  d1Query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM diet_template_slots")) {
      return params[0] === "slot-breakfast-explicit" ? [{ exchange_list_id: "exl-system-breakfast-carbs" }] : [{ exchange_list_id: null }];
    }
    if (sql.includes("FROM exchange_lists") && sql.includes("WHERE id = ?1")) {
      return [mainStarches, breakfastCarbs].filter((list) => list.id === params[0]);
    }
    if (sql.includes("FROM exchange_lists")) {
      return [breakfastCarbs, mainStarches];
    }
    if (sql.includes("FROM exchange_list_items")) {
      const refs = params[0] === "exl-system-breakfast-carbs" ? ["52", "53", "7"] : ["3", "1", "88"];
      return refs.map((ref, index) => ({
        id: `item-${ref}`,
        exchange_list_id: params[0],
        food_source: "TACO",
        food_ref_id: ref,
        canonical_food_id: null,
        display_name: `item ${ref}`,
        family: null,
        priority: index,
        active: 1,
        created_at: "2026-08-22T00:00:00.000Z",
        updated_at: "2026-08-22T00:00:00.000Z",
      }));
    }
    return [];
  });
});

describe("resolveExchangeListForContext", () => {
  it("mapeia LUNCH + STARCH_MAIN para MAIN_MEAL_STARCHES", async () => {
    const { resolveExchangeListForContext } = await import("@/lib/repositories/curated-exchange-lists");
    const rice = taco(/arroz, integral, cozido/i);
    const resolved = await resolveExchangeListForContext({ classification: classifyFoodExchangeGroup(rice), mealContext: "LUNCH" });
    expect(resolved?.list.slug).toBe("MAIN_MEAL_STARCHES");
    expect(resolved?.resolution).toBe("CONTEXT");
  });

  it("mapeia BREAKFAST + BREAKFAST_CARB para BREAKFAST_CARBS", async () => {
    const { resolveExchangeListForContext } = await import("@/lib/repositories/curated-exchange-lists");
    const bread = taco(/pão, trigo, forma, integral/i);
    const resolved = await resolveExchangeListForContext({ classification: classifyFoodExchangeGroup(bread), mealContext: "BREAKFAST" });
    expect(resolved?.list.slug).toBe("BREAKFAST_CARBS");
    expect(resolved?.resolution).toBe("CONTEXT");
  });

  it("prioriza exchangeListId explicito do slot acima da resolucao contextual", async () => {
    const { resolveExchangeListForContext } = await import("@/lib/repositories/curated-exchange-lists");
    const rice = taco(/arroz, integral, cozido/i);
    const resolved = await resolveExchangeListForContext({
      classification: classifyFoodExchangeGroup(rice),
      mealContext: "LUNCH",
      templateSlotId: "slot-breakfast-explicit",
    });
    expect(resolved?.list.slug).toBe("BREAKFAST_CARBS");
    expect(resolved?.resolution).toBe("TEMPLATE_SLOT");
  });
});
