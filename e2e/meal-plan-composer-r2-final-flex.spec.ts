import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";
import { addMeal, openMealPlanTab, saveDraft, selectFood, setLastQuantity } from "./helpers/meal-plan-editor";

test.use({ storageState: ADMIN_STORAGE_STATE });

async function createDraftPlan(request: import("@playwright/test").APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test.describe("Meal Plan Composer R2 — Flex structures (SIMPLE/OPTIONS/COMBINATION)", () => {
  test("OPTIONS: alternativas não são somadas na Live Nutrition; persiste após reload", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createDraftPlan(request, patient.id, "R2 Flex OPTIONS");
    await openMealPlanTab(page, patient.id);

    const meal = await addMeal(page, "Café OPTIONS");
    await selectFood(page, meal, "Arroz, tipo 1, cozido", /arroz/i);
    await setLastQuantity(meal, "100");

    await meal.getByLabel("Tipo da refeição").selectOption("OPTIONS");
    await meal.getByLabel("Alimento 1 da opção 1").fill("Arroz, tipo 1, cozido");
    await meal.getByLabel("Quantidade 1 da opção 1").fill("100");
    await meal.getByLabel("Unidade 1 da opção 1").fill("g");
    await meal.getByRole("button", { name: /adicionar opção/i }).click();
    await meal.getByLabel("Alimento 1 da opção 2").fill("Batata, doce, cozida");
    await meal.getByLabel("Quantidade 1 da opção 2").fill("150");
    await meal.getByLabel("Unidade 1 da opção 2").fill("g");

    // Live Nutrition mostra faixa (min-max) na Energia, nunca a soma das opções.
    const sidebar = page.locator("aside", { hasText: "Plano do dia" });
    await expect(sidebar.getByText(/^\d+–\d+ kcal$/)).toBeVisible({ timeout: 10_000 });

    await saveDraft(page);
    await page.reload();
    await openMealPlanTab(page, patient.id);
    const savedMeal = page.locator("article").filter({ hasText: "Café OPTIONS" });
    await expect(savedMeal.getByLabel("Nome da opção 2")).toHaveValue("Opção 2");
    await expect(savedMeal.getByLabel("Alimento 1 da opção 2")).toHaveValue(/batata,?\s*doce,?\s*cozida/i);
  });

  test("COMBINATION: item fixo + grupo de escolha calculam faixa real; persiste após reload", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createDraftPlan(request, patient.id, "R2 Flex COMBINATION");
    await openMealPlanTab(page, patient.id);

    const meal = await addMeal(page, "Almoço COMBINATION");
    await selectFood(page, meal, "Alface, lisa, crua", /alface/i);
    await setLastQuantity(meal, "80");

    await meal.getByLabel("Tipo da refeição").selectOption("COMBINATION");
    await meal.getByLabel("Alimento 1 do grupo 1").fill("Frango, peito, sem pele, grelhado");
    await meal.getByLabel("Quantidade 1 do grupo 1").fill("100");
    await meal.getByLabel("Unidade 1 do grupo 1").fill("g");
    await meal.getByRole("button", { name: /\+ alimento no grupo/i }).click();
    await meal.getByLabel("Alimento 2 do grupo 1").fill("Ovo, de galinha, inteiro, cozido");
    await meal.getByLabel("Quantidade 2 do grupo 1").fill("100");
    await meal.getByLabel("Unidade 2 do grupo 1").fill("g");

    const sidebar = page.locator("aside", { hasText: "Plano do dia" });
    await expect(sidebar.getByText(/^\d+–\d+ kcal$/)).toBeVisible({ timeout: 10_000 });

    await saveDraft(page);
    await page.reload();
    await openMealPlanTab(page, patient.id);
    const savedMeal = page.locator("article").filter({ hasText: "Almoço COMBINATION" });
    await expect(savedMeal.getByText(/escolha de 1 a 1 item/i)).toBeVisible();
    await expect(savedMeal.getByLabel("Alimento 1 do grupo 1")).toHaveValue(/frango,?\s*peito/i);
    await expect(savedMeal.getByLabel("Alimento 2 do grupo 1")).toHaveValue(/ovo,?\s*de galinha/i);
  });
});
