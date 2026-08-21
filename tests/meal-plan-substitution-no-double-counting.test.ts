import { describe, expect, it } from "vitest";
import { TACO_REFERENCES } from "@/lib/nutrition/taco";

/**
 * Prova estrutural (não só comportamental) da seção 7 do pedido de
 * fechamento de gaps: substituições NUNCA entram no total do plano.
 * `calculatePlanNutrients` recebe `Pick<MealPlanPayload, "meals">` — o campo
 * `substitutions` nem está no tipo aceito, então não há como ele influenciar
 * o cálculo, ainda que um chamador passe um plano completo com o array.
 * Usa a MESMA engine (calculatePlanNutrients + buildFoodReferenceLookup) que
 * editor/print/portal usam — nunca um cálculo paralelo.
 */

const rice = TACO_REFERENCES.find((f) => typeof f.numero === "number" && (f.carboidrato_g ?? 0) > 20)!;
const potato = TACO_REFERENCES.find((f) => typeof f.numero === "number" && f.descricao.toLowerCase().includes("batata"))!;

function buildPlan(withSubstitutions: boolean) {
  return {
    meals: [
      {
        id: "meal-1",
        name: "Almoço",
        suggested_time: null,
        source_recipe_id: null,
        items: [
          { id: "item-1", food: rice.descricao, quantity: "100", unit: "g", food_source: "TACO" as const, food_ref_id: String(rice.numero) },
        ],
      },
    ],
    // Um plano completo (com substituições aprovadas) é passado aqui para
    // provar que a presença delas não muda o total — não é só ausência de
    // dado no teste, é presença real ignorada pelo cálculo.
    ...(withSubstitutions
      ? {
          substitutions: [
            {
              id: "sub-1",
              meal_plan_id: "plan-1",
              base_food: rice.descricao,
              option_food: potato.descricao,
              quantity: "300",
              unit: "g",
              notes: null,
              base_food_source: "TACO" as const,
              base_food_ref_id: String(rice.numero),
              option_food_source: "TACO" as const,
              option_food_ref_id: String(potato.numero),
              option_nutrition_snapshot: null,
              equivalence_mode: "energy" as const,
              equivalence_score: 0.01,
              equivalence_quality: "EXCELLENT" as const,
              approved_by_professional: true,
              ai_suggested: false,
              sort_order: 0,
            },
          ],
        }
      : {}),
  };
}

describe("substituições nunca entram no total do plano (nunca double-counting)", () => {
  it("nutritionWithSubstitutions == nutritionWithoutSubstitutionAlternatives — mesmo total, aprovada e com quantidade bem diferente do item base", async () => {
    const { resolveMealPlanChangeReferences, buildFoodReferenceLookup } = await import(
      "@/lib/ai/agents/nutrition/meal-plan-change-agent"
    );
    const { calculatePlanNutrients } = await import("@/lib/nutrition/nutrients");

    const planWithout = buildPlan(false);
    const planWith = buildPlan(true);

    const withoutRefs = await resolveMealPlanChangeReferences(planWithout);
    const withRefs = await resolveMealPlanChangeReferences(planWith);

    const withoutSub = calculatePlanNutrients(planWithout, buildFoodReferenceLookup(withoutRefs.references, withoutRefs.measuresById));
    const withSub = calculatePlanNutrients(planWith, buildFoodReferenceLookup(withRefs.references, withRefs.measuresById));

    expect(withSub.total.values).toEqual(withoutSub.total.values);
    expect(withSub.perMeal).toEqual(withoutSub.perMeal);
    // Confirma que o total não é zero/trivial — a comparação acima tem peso real.
    expect(withoutSub.total.values.energyKcal).toBeGreaterThan(0);
  });
});
