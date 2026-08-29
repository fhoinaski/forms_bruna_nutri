import { describe, expect, it } from "vitest";
import { shouldShowFixedItemsLabel } from "@/components/dashboard/MealItemsEditor";

describe("shouldShowFixedItemsLabel (R6.5.2B)", () => {
  it("mostra o rótulo só em COMBINATION com grupo de escolha E itens base", () => {
    expect(shouldShowFixedItemsLabel({ meal_structure: "COMBINATION", choice_groups: [{ items: [{}] }], items: [{}] })).toBe(true);
  });

  it("não mostra em SIMPLE, mesmo com choice_groups presentes por engano", () => {
    expect(shouldShowFixedItemsLabel({ meal_structure: "SIMPLE", choice_groups: [{ items: [{}] }], items: [{}] })).toBe(false);
  });

  it("não mostra em OPTIONS", () => {
    expect(shouldShowFixedItemsLabel({ meal_structure: "OPTIONS", choice_groups: [{ items: [{}] }], items: [{}] })).toBe(false);
  });

  it("não mostra em COMBINATION sem nenhum grupo de escolha", () => {
    expect(shouldShowFixedItemsLabel({ meal_structure: "COMBINATION", choice_groups: [], items: [{}] })).toBe(false);
    expect(shouldShowFixedItemsLabel({ meal_structure: "COMBINATION", choice_groups: null, items: [{}] })).toBe(false);
  });

  it("não mostra em COMBINATION sem nenhum item base (só grupos de escolha, sem itens fixos de fato)", () => {
    expect(shouldShowFixedItemsLabel({ meal_structure: "COMBINATION", choice_groups: [{ items: [{}] }], items: [] })).toBe(false);
  });
});
