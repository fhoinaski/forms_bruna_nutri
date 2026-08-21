import { describe, expect, it } from "vitest";
import { critiqueDraft } from "@/lib/nutrition/draft-critic";
import { DEFAULT_HARD_MAX_GRAMS } from "@/lib/nutrition/draft-optimizer-v2";
import type { DraftMeal, MealKey } from "@/lib/nutrition/draft-types";

/**
 * Critic determinístico (não um segundo LLM — mais testável, sem risco de
 * inventar diagnóstico clínico). Nunca altera o draft, só sinaliza.
 */
function item(food: string, refId: string): DraftMeal["items"][number] {
  return { food, displayName: food, quantity: "100", unit: "g", food_source: "TACO", food_ref_id: refId, ai_suggested: true };
}

function meal(mealKey: MealKey, name: string, items: DraftMeal["items"], needsReview: DraftMeal["needsReview"] = []): DraftMeal {
  return { mealKey, name, suggested_time: null, source_recipe_id: null, items, needsReview };
}

describe("critiqueDraft", () => {
  it("refeição com item precisando de revisão gera WARNING de escopo MEAL", () => {
    const meals: DraftMeal[] = [
      meal("almoco", "Almoço", [item("Arroz", "1"), item("Feijão", "2")], [{ query: "tilápia", quantity: "100", unit: "g", status: "AMBIGUOUS", reason: "x", candidates: [] }]),
    ];
    const findings = critiqueDraft(meals);
    expect(findings.some((f) => f.severity === "WARNING" && f.scope === "MEAL" && f.mealName === "Almoço")).toBe(true);
  });

  it("refeição totalmente vazia gera WARNING", () => {
    const meals: DraftMeal[] = [meal("lanche_tarde", "Lanche da tarde", [])];
    const findings = critiqueDraft(meals);
    expect(findings.some((f) => f.message.includes("sem nenhum alimento"))).toBe(true);
  });

  it("item com segurança clínica não confirmada gera REVIEW", () => {
    const meals: DraftMeal[] = [meal("jantar", "Jantar", [{ ...item("Alimento raro", "9"), needsSafetyReview: true }])];
    const findings = critiqueDraft(meals);
    expect(findings.some((f) => f.severity === "REVIEW" && f.message.includes("segurança clínica"))).toBe(true);
  });

  it("mesmo alimento repetido em 3+ refeições gera INFO de baixa variedade (identidade real, não texto)", () => {
    const meals: DraftMeal[] = [
      meal("cafe_da_manha", "Café da manhã", [item("Arroz, integral, cozido", "1")]),
      meal("almoco", "Almoço", [item("Arroz, integral, cozido", "1"), item("Feijão", "2")]),
      meal("jantar", "Jantar", [item("Arroz, integral, cozido", "1")]),
    ];
    const findings = critiqueDraft(meals);
    expect(findings.some((f) => f.scope === "PLAN" && f.severity === "INFO" && f.message.includes("pouca variedade"))).toBe(true);
  });

  it("refeição principal (almoço/jantar) com só 1 item gera INFO, mas lanche com 1 item não gera nada", () => {
    const meals: DraftMeal[] = [
      meal("almoco", "Almoço", [item("Arroz", "1")]),
      meal("lanche_tarde", "Lanche da tarde", [item("Banana", "3")]),
    ];
    const findings = critiqueDraft(meals);
    expect(findings.some((f) => f.mealName === "Almoço" && f.severity === "INFO")).toBe(true);
    expect(findings.some((f) => f.mealName === "Lanche da tarde")).toBe(false);
  });

  it("draft bem formado (variado, tudo resolvido, refeições completas) não gera nenhum finding", () => {
    const meals: DraftMeal[] = [
      meal("almoco", "Almoço", [item("Arroz", "1"), item("Feijão", "2"), item("Frango", "3")]),
      meal("jantar", "Jantar", [item("Batata", "4"), item("Peixe", "5")]),
    ];
    expect(critiqueDraft(meals)).toHaveLength(0);
  });

  it("item perto do teto técnico (≥90% do hard max) gera REVIEW de escopo ITEM — seção 28 do optimizer V2", () => {
    const meals: DraftMeal[] = [
      meal("almoco", "Almoço", [item("Arroz", "1"), { ...item("Batata gigante", "2"), quantity: String(DEFAULT_HARD_MAX_GRAMS * 0.95) }]),
    ];
    const findings = critiqueDraft(meals);
    expect(findings.some((f) => f.severity === "REVIEW" && f.scope === "ITEM" && f.message.includes("elevada"))).toBe(true);
  });

  it("nunca altera o draft de entrada (função pura)", () => {
    const meals: DraftMeal[] = [meal("almoco", "Almoço", [item("Arroz", "1")])];
    const snapshot = JSON.stringify(meals);
    critiqueDraft(meals);
    expect(JSON.stringify(meals)).toBe(snapshot);
  });
});
