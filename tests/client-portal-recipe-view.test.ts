import { describe, expect, it, vi } from "vitest";

/**
 * Food-First Meal Plan V1, Fase 8 — o portal precisa mostrar o nome humano
 * da receita aceita (source_recipe_id) sem alterar em nada os itens/
 * nutrição reais da refeição (que continuam vindo 100% da engine central,
 * calculados antes deste enriquecimento rodar). Mocka só as fontes de
 * dados (D1 + repositórios) — a lógica de composição em
 * getClientPortalSummary é código real.
 */
const client = { id: "client-1", name: "Maria Silva", email: "maria@test.local", phone: null, birth_date: "1990-01-01", source_submission_id: null, status: "ativo", notes: null, created_at: "", updated_at: "" };

vi.mock("@/lib/d1/client", () => ({
  d1Query: vi.fn().mockImplementation(async (sql: string) => (sql.includes("FROM clients") ? [client] : [])),
  d1Execute: vi.fn(),
  d1Batch: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/repositories/nutrition-records", () => ({ getExistingNutritionRecord: vi.fn().mockResolvedValue(null) }));

const mealWithRecipe = {
  name: "Café da manhã",
  suggested_time: "07:30",
  notes: null,
  source_recipe_id: "recipe-1",
  items: [{ food: "Ovo, de galinha, inteiro, cru", quantity: "150", unit: "g", notes: null, food_source: "TACO", food_ref_id: "489" }],
};
const mealWithoutRecipe = {
  name: "Almoço",
  suggested_time: "12:00",
  notes: null,
  source_recipe_id: null,
  items: [{ food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g", notes: null, food_source: "TACO", food_ref_id: "3" }],
};
const mealPlan = {
  id: "plan-1", title: "Plano", notes: null, version: 3,
  meals: [mealWithRecipe, mealWithoutRecipe],
  weekly_slots: [], substitutions: [], supplements: [],
};

vi.mock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(mealPlan) }));
vi.mock("@/lib/repositories/recipes", () => ({
  getRecipeById: vi.fn().mockImplementation(async (id: string) => (id === "recipe-1" ? { id: "recipe-1", title: "Omelete simples", preparation_steps: "Bata os ovos e leve à frigideira." } : null)),
}));

describe("getClientPortalSummary — enriquecimento de receita no portal (Fase 8)", () => {
  it("refeição com source_recipe_id ganha recipe{title, preparation_steps} — itens/nutrição intactos", async () => {
    const { getClientPortalSummary } = await import("@/lib/repositories/client-portal");
    const summary = await getClientPortalSummary("client-1");
    const meal = summary!.mealPlan!.meals[0];
    expect(meal.recipe).toEqual({ title: "Omelete simples", preparation_steps: "Bata os ovos e leve à frigideira." });
    // Itens continuam exatamente os mesmos — o enriquecimento nunca toca neles.
    expect(meal.items).toEqual(mealWithRecipe.items);
  });

  it("refeição sem source_recipe_id nunca ganha recipe (fica null, nunca busca receita à toa)", async () => {
    const { getClientPortalSummary } = await import("@/lib/repositories/client-portal");
    const summary = await getClientPortalSummary("client-1");
    const meal = summary!.mealPlan!.meals[1];
    expect(meal.recipe).toBeNull();
    expect(meal.items).toEqual(mealWithoutRecipe.items);
  });

  it("só as substituições aprovadas chegam ao portal (regra pré-existente, preservada pelo enriquecimento)", async () => {
    const { getClientPortalSummary } = await import("@/lib/repositories/client-portal");
    const summary = await getClientPortalSummary("client-1");
    expect(summary!.mealPlan!.substitutions).toEqual([]);
  });
});
