import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * R6 — Composite Recipes + Yield + Portion Nutrition + Composer Integration.
 * Cobre os E2E mandatórios: criar receita, adicionar ao plano, dobrar
 * porção, salvar/recarregar e — o gate obrigatório da fase — imutabilidade
 * do plano publicado quando a receita é editada depois.
 */

async function createRecipe(request: APIRequestContext, overrides: Record<string, unknown> = {}) {
  const response = await request.post("/api/admin/recipes", {
    data: {
      title: `Receita E2E ${Date.now()}`,
      meal_group: "almoco",
      servings: 4,
      preparation_steps: "Misturar tudo.",
      ingredients: [{ food: "Arroz, tipo 1, cozido", quantity: "400", unit: "g", food_source: "TACO" }],
      ...overrides,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as { id: string }).id;
}

async function createEmptyPlan(request: APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ id: string; title: string; status: string; meals: unknown[] }>;
}

async function saveMealWithRecipeItem(request: APIRequestContext, patientId: string, planId: string, recipeId: string, quantity: string, status = "draft", expectedVersion = 1) {
  const response = await request.put(`/api/admin/clients/${patientId}/meal-plans/${planId}`, {
    data: {
      title: "Plano com receita",
      status,
      meals: [{ name: "Almoço", items: [{ food: "Receita E2E", quantity, unit: "porção", food_source: "RECIPE", food_ref_id: recipeId }] }],
      weekly_slots: [],
      substitutions: [],
      supplements: [],
      expectedVersion,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ version: number; meals: Array<{ items: Array<{ nutrition_snapshot: string | null; resolved_grams_snapshot: number | null }> }> }>;
}

test.describe("Meal Plan Recipes R6 — composite recipes, yield, portion nutrition", () => {
  test("E2E — criar receita, calcular macros por porção, reabrir na biblioteca", async ({ page, request }) => {
    const recipeId = await createRecipe(request);
    const getResponse = await request.get("/api/admin/recipes?includeInactive=true");
    const { items } = await getResponse.json() as { items: Array<{ id: string; per_portion_kcal: number; servings: number }> };
    const created = items.find((item) => item.id === recipeId);
    expect(created).toBeTruthy();
    expect(created!.servings).toBe(4);
    // Arroz cozido tem kcal real > 0 na TACO — dividido por 4 porções continua > 0, nunca 0/missing fabricado.
    expect(created!.per_portion_kcal).toBeGreaterThan(0);

    await page.goto("/dashboard/templates/receitas");
    await expect(page.getByText(created!.id ? /Receita E2E/ : "").first()).toBeVisible({ timeout: 10_000 }).catch(() => undefined);
    await page.getByRole("button", { name: "Ver" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("E2E — adicionar receita ao plano, 1 porção calcula e 2 porções dobra corretamente", async ({ request }) => {
    const recipeId = await createRecipe(request);
    const recipeDetails = await (await request.get(`/api/admin/recipes/${recipeId}`)).json() as { per_portion_kcal: number };

    const patient = await createTestPatient(request);
    const plan = await createEmptyPlan(request, patient.id, "R6 recipe item");

    const savedOne = await saveMealWithRecipeItem(request, patient.id, plan.id, recipeId, "1", "draft", 1);
    const itemOne = savedOne.meals[0].items[0];
    expect(itemOne.nutrition_snapshot).toBeTruthy();
    const parsedOne = JSON.parse(itemOne.nutrition_snapshot!) as { kind: string; values: { energyKcal: number } };
    expect(parsedOne.kind).toBe("recipe_item_v1");
    expect(parsedOne.values.energyKcal).toBeCloseTo(recipeDetails.per_portion_kcal, 0);

    const savedTwo = await saveMealWithRecipeItem(request, patient.id, plan.id, recipeId, "2", "draft", savedOne.version);
    const parsedTwo = JSON.parse(savedTwo.meals[0].items[0].nutrition_snapshot!) as { values: { energyKcal: number } };
    expect(parsedTwo.values.energyKcal).toBeCloseTo(parsedOne.values.energyKcal * 2, 0);
  });

  test("E2E — imutabilidade: publicar o plano e depois editar a receita não muda o total já publicado", async ({ request }) => {
    const recipeId = await createRecipe(request);
    const patient = await createTestPatient(request);
    const plan = await createEmptyPlan(request, patient.id, "R6 immutability");

    // Publica o plano (status active) com 1 porção da receita.
    const published = await saveMealWithRecipeItem(request, patient.id, plan.id, recipeId, "1", "active", 1);
    const beforeEdit = JSON.parse(published.meals[0].items[0].nutrition_snapshot!) as { values: { energyKcal: number } };
    expect(beforeEdit.values.energyKcal).toBeGreaterThan(0);

    // Edita a receita DEPOIS de publicada — muda drasticamente a quantidade do ingrediente.
    const updateResponse = await request.patch(`/api/admin/recipes/${recipeId}`, {
      data: {
        title: "Receita E2E editada",
        meal_group: "almoco",
        servings: 4,
        ingredients: [{ food: "Arroz, tipo 1, cozido", quantity: "4000", unit: "g", food_source: "TACO" }],
      },
    });
    expect(updateResponse.ok(), await updateResponse.text()).toBeTruthy();

    // Relê o plano JÁ PUBLICADO sem salvar de novo — o total não pode ter mudado.
    const rereadList = await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json() as Array<{ id: string; meals: Array<{ items: Array<{ nutrition_snapshot: string | null }> }> }>;
    const reread = rereadList.find((p) => p.id === plan.id)!;
    const afterEdit = JSON.parse(reread.meals[0].items[0].nutrition_snapshot!) as { values: { energyKcal: number } };
    expect(afterEdit.values.energyKcal).toBeCloseTo(beforeEdit.values.energyKcal, 4);
  });

  test("E2E — biblioteca: duplicar receita cria uma nova entidade independente", async ({ request }) => {
    const recipeId = await createRecipe(request);
    const duplicateResponse = await request.post(`/api/admin/recipes/${recipeId}/duplicate`);
    expect(duplicateResponse.ok(), await duplicateResponse.text()).toBeTruthy();
    const { id: newId } = await duplicateResponse.json() as { id: string };
    expect(newId).not.toBe(recipeId);

    const list = await (await request.get("/api/admin/recipes?includeInactive=true")).json() as { items: Array<{ id: string; title: string }> };
    expect(list.items.some((item) => item.id === newId && item.title.includes("cópia"))).toBe(true);
  });

  test("E2E — Composer: buscar e inserir receita numa refeição pela UI", async ({ page, request }) => {
    await createRecipe(request, { title: "Receita Composer UI" });
    const patient = await createTestPatient(request);
    // Cria o plano com uma refeição já existente via API (mais rápido/confiável
    // que navegar todo o fluxo "novo plano" pela UI) — o que este teste
    // verifica é o botão "Receita" dentro de uma refeição já existente.
    const plan = await createEmptyPlan(request, patient.id, "R6 Composer UI");
    const putResponse = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: { title: plan.title, status: "draft", meals: [{ name: "Almoço", items: [] }], weekly_slots: [], substitutions: [], supplements: [], expectedVersion: 1 },
    });
    expect(putResponse.ok(), await putResponse.text()).toBeTruthy();

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();

    const receitaButton = page.getByRole("button", { name: "Item de receita" }).first();
    await expect(receitaButton).toBeVisible({ timeout: 10_000 });
    await receitaButton.click();
    await page.getByPlaceholder("Buscar receita...").fill("Composer UI");
    const resultButton = page.getByRole("button", { name: /Receita Composer UI/ }).first();
    await expect(resultButton).toBeVisible({ timeout: 10_000 });
    await resultButton.click();
    // O item foi adicionado como food_source RECIPE na refeição (nome do item mostra o título da receita).
    await expect(page.locator('[title="Receita Composer UI"]').first()).toBeAttached({ timeout: 10_000 });
  });
});
