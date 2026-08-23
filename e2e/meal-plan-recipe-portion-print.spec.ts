import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { publishPlan } from "./helpers/meal-plan-editor";
import { createTestPatient, uniqueSuffix } from "./helpers/test-data";

/**
 * Prova especifica (pedido de correcao do print do plano alimentar) de que
 * uma receita inserida no plano mostra a PORCAO PRESCRITA, nunca o total
 * do LOTE inteiro da receita — bug relatado: uma receita de rendimento N
 * porcoes aparecia com o kcal do lote inteiro (ex.: "1510 kcal") em vez do
 * kcal de 1 porcao (ex.: "377,5 kcal"). A correcao (insertRecipe em
 * MealItemsEditor.tsx) escala as gramas dos ingredientes por
 * 1/servings ANTES de gravar o item — a impressao nunca calcula nada
 * sozinha, so mostra o resultado do MESMO motor central.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("receita no plano: porcao prescrita, nao o lote inteiro", () => {
  test("print mostra o kcal de 1 porcao (per_portion_kcal), nunca o total da receita (4x maior)", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    // Receita fixture: 4 porcoes, 400g de arroz integral cozido (taco_number 1)
    // no lote inteiro -> total = ~494 kcal, per_portion = ~124 kcal (1/4).
    const recipeTitle = `Receita Porcao E2E ${uniqueSuffix()}`;
    const recipeResponse = await request.post("/api/admin/recipes", {
      data: {
        title: recipeTitle,
        meal_group: "almoco",
        servings: 4,
        ingredients: [{ taco_number: 1, food_name: "Arroz, integral, cozido", grams: 400 }],
      },
    });
    expect(recipeResponse.ok(), await recipeResponse.text()).toBeTruthy();
    const recipeBody = (await recipeResponse.json()) as { id: string };

    const recipesList = (await (await request.get(`/api/admin/recipes?q=${encodeURIComponent(recipeTitle)}`)).json()) as {
      items: { id: string; total_kcal: number; per_portion_kcal: number; servings: number }[];
    };
    const recipe = recipesList.items.find((item) => item.id === recipeBody.id)!;
    expect(recipe).toBeTruthy();
    expect(recipe.servings).toBe(4);
    // O total do lote deve ser visivelmente maior que 1 porcao (prova que o
    // fixture realmente representa "receita rende bem mais que 1 porcao").
    expect(recipe.total_kcal).toBeGreaterThan(recipe.per_portion_kcal * 3);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    await page.getByRole("button", { name: /^inserir receita$/i }).click();
    await page.getByPlaceholder("Buscar por nome ou tag...").fill(recipeTitle);
    const recipeCard = page.locator("button", { hasText: recipeTitle });
    await expect(recipeCard).toBeVisible();
    await recipeCard.click();
    await expect(page.getByText(new RegExp(`receita "${recipeTitle}" inserida.*1 porç`, "i"))).toBeVisible();

    // O card da nova refeicao (nomeada com o titulo da receita) mostra o
    // kcal de 1 porcao, nao do lote inteiro.
    const mealCard = page.locator("article").filter({ hasText: recipeTitle }).first();
    await expect(mealCard).toBeVisible();
    await expect(mealCard.getByText(/kcal estimadas/)).toBeVisible();
    let editorKcal = 0;
    await expect(async () => {
      const mealCardText = (await mealCard.textContent()) ?? "";
      const editorKcalMatch = mealCardText.match(/(\d+)\s*kcal estimadas/);
      editorKcal = Number(editorKcalMatch?.[1] ?? "0");
      expect(editorKcal).toBeGreaterThan(0);
    }).toPass({ timeout: 10000 });
    // Tolerancia de arredondamento entre o motor de receitas (que resolve
    // por taco_number direto) e o motor de item do plano (que resolve por
    // food_source+food_ref_id) — devem ficar muito proximos.
    expect(Math.abs(editorKcal - recipe.per_portion_kcal)).toBeLessThanOrEqual(2);
    // Nunca o total do lote inteiro (a prova central deste teste).
    expect(editorKcal).toBeLessThan(recipe.total_kcal * 0.5);

    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();
    await publishPlan(page);

    // Impressao (cardapio) mostra EXATAMENTE o mesmo valor do editor —
    // nunca uma formula propria, e nunca o total do lote.
    await page.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar`);
    const printMealCard = page.locator(".meal", { hasText: recipeTitle });
    await expect(printMealCard).toBeVisible();
    await expect(printMealCard.getByText(/^\d+ kcal$/)).toBeVisible();
    const printKcalText = await printMealCard.getByText(/^\d+ kcal$/).textContent();
    const printKcal = Number((printKcalText ?? "").replace(/\D/g, "") || "0");
    expect(printKcal).toBe(editorKcal);
    expect(printKcal).toBeLessThan(recipe.total_kcal * 0.5);

    // A refeicao da receita mostra o rotulo "1 porção" e macros calculados
    // (nunca "Informação incompleta" para um item corretamente vinculado).
    await expect(printMealCard.getByText(/1 porção/i)).toBeVisible();
    await expect(printMealCard.getByText(/informação incompleta/i)).toHaveCount(0);
    await expect(printMealCard.getByText(/^P .*C .*G .*Fibra/)).toBeVisible();
  });
});
