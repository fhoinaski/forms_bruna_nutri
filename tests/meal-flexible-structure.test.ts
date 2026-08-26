import { describe, expect, it } from "vitest";
import { calculateMealNutritionRange, getMealStructure, getMealStructureItems, validateMealStructure } from "@/lib/meal-plans/flexible-structure";
import { cleanMealsForSave } from "@/components/dashboard/MealItemsEditor";

const item = (food: string, kcal: number, optional = false) => ({ food, is_optional: optional, notes: String(kcal) });
const values = (value: { notes?: string | null }) => ({ energyKcal: Number(value.notes ?? 0), proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0 });

describe("flexible meal structure", () => {
  it("treats legacy meals as SIMPLE", () => expect(getMealStructure({})).toBe("SIMPLE"));
  it("does not sum complete options", () => {
    const range = calculateMealNutritionRange({ name: "Café", meal_structure: "OPTIONS", items: [], options: [
      { label: "Opção 1", items: [item("A", 300)] }, { label: "Opção 2", items: [item("B", 400)] },
    ] }, values);
    expect(range.min.energyKcal).toBe(300); expect(range.max.energyKcal).toBe(400);
  });
  it("includes flexible branches for validation without making them additive", () => {
    const items = getMealStructureItems({ items: [item("Fixo", 100)], options: [{ label: "Opção", items: [item("A", 200)] }], choice_groups: [{ title: "Grupo", min_selections: 1, max_selections: 1, items: [item("B", 300)] }] });
    expect(items.map((entry) => entry.food)).toEqual(["Fixo", "A", "B"]);
  });
  it("keeps an OPTIONS meal with no fixed item and strips client-only item fields", () => {
    const meals = cleanMealsForSave([{ name: "Café", meal_structure: "OPTIONS", items: [], options: [{ id: "option-id", label: "Opção", items: [{ id: "item-id", food: "Ovo", quantity: "2", unit: "un" }] }], choice_groups: [] }]);
    expect(meals).toHaveLength(1);
    expect(meals[0]?.options?.[0]?.items[0]).toMatchObject({ food: "Ovo", quantity: "2", unit: "un", is_optional: false });
    expect(meals[0]?.options?.[0]?.items[0]).not.toHaveProperty("id");
  });
  it("calculates independent combination bounds", () => {
    const range = calculateMealNutritionRange({ name: "Almoço", meal_structure: "COMBINATION", items: [item("Fixo", 100)], choice_groups: [
      { title: "Proteína", min_selections: 1, max_selections: 1, items: [item("Frango", 200), item("Carne", 300)] },
      { title: "Carboidrato", min_selections: 1, max_selections: 1, items: [item("Arroz", 100), item("Batata", 150)] },
    ] }, values);
    expect(range.min.energyKcal).toBe(400); expect(range.max.energyKcal).toBe(550);
  });
  it("uses optional items only in the maximum", () => {
    const range = calculateMealNutritionRange({ name: "Lanche", items: [item("Base", 100), item("Opcional", 50, true)] }, values);
    expect(range.min.energyKcal).toBe(100); expect(range.max.energyKcal).toBe(150);
  });
  it("handles multi-selection groups", () => {
    const range = calculateMealNutritionRange({ name: "Jantar", meal_structure: "COMBINATION", items: [], choice_groups: [
      { title: "Acompanhamentos", min_selections: 2, max_selections: 2, items: [item("A", 100), item("B", 200), item("C", 300)] },
    ] }, values);
    expect(range.min.energyKcal).toBe(300); expect(range.max.energyKcal).toBe(500);
  });
  it("rejects invalid group bounds and empty options", () => {
    expect(validateMealStructure({ name: "x", meal_structure: "OPTIONS", items: [] }).length).toBeGreaterThan(0);
    expect(validateMealStructure({ name: "x", meal_structure: "COMBINATION", items: [], choice_groups: [{ title: "x", min_selections: 2, max_selections: 1, items: [] }] }).length).toBeGreaterThan(0);
  });
});
