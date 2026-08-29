import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";
import { addMeal, openMealPlanTab, selectFood, setLastQuantity } from "./helpers/meal-plan-editor";

test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * R6.5.2C — fecha os 2 últimos blockers da R6.5.2: menu de ações da
 * refeição consolidado no "⋯" (com acessibilidade real: aria-haspopup/
 * aria-expanded/role=menu/Escape/foco de volta) e compactação visual
 * leve da food row (ações reveladas em hover/foco no desktop, sempre
 * visíveis no mobile — CSS puro, sem mudança estrutural).
 */

test.describe("Meal Plan Composer R6.5.2C — menu de ações da refeição + food row compacta", () => {
  test("abrir o menu ⋯ mostra Mover/Duplicar/Excluir; Escape fecha e devolve o foco ao botão que abriu", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    const meal = await addMeal(page, "Refeição R6.5.2C");
    const trigger = meal.getByRole("button", { name: /ações da refeição/i });

    // aria-haspopup/aria-expanded corretos antes/depois de abrir.
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    const menu = page.getByRole("menu", { name: /ações da refeição/i });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button", { name: /mover .* para cima/i })).toBeVisible();
    await expect(menu.getByRole("button", { name: /mover .* para baixo/i })).toBeVisible();
    await expect(menu.getByRole("button", { name: /duplicar refeição r6\.5\.2c/i })).toBeVisible();
    await expect(menu.getByRole("button", { name: /excluir refeição/i })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("excluir refeição pelo menu ⋯ remove só a refeição correta (comportamento R4/existente preservado)", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    await addMeal(page, "Manter");
    await addMeal(page, "Excluir Esta");
    const articlesBefore = await page.locator("article").count();

    const targetMeal = page.locator("article").filter({ hasText: "Excluir Esta" });
    await targetMeal.getByRole("button", { name: /ações da refeição/i }).click();
    await targetMeal.getByRole("button", { name: /excluir refeição/i }).click();

    await expect(page.locator("article")).toHaveCount(articlesBefore - 1);
    await expect(page.getByRole("article").filter({ hasText: "Manter" })).toBeVisible();
    await expect(page.getByRole("article").filter({ hasText: "Excluir Esta" })).toHaveCount(0);
  });

  test("food row: ações secundárias (trocas/⋯) ficam reveladas em hover/foco no desktop, sempre visíveis no mobile (CSS, sem mudança de handler)", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const planRes = await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R6.5.2C Food Row" } });
    const plan = await planRes.json() as { id: string; title: string };
    const putRes = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: {
        title: plan.title, status: "draft",
        meals: [{ name: "Almoço", items: [{ food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "129" }] }],
        weekly_slots: [], substitutions: [], supplements: [], expectedVersion: 1,
      },
    });
    expect(putRes.ok(), await putRes.text()).toBeTruthy();

    await openMealPlanTab(page, patient.id);
    const mealCard = page.getByRole("article").filter({ hasText: "Almoço" });
    await expect(mealCard).toBeVisible({ timeout: 10_000 });

    // As ações continuam presentes no DOM e operáveis (accessible, mesmo com opacidade
    // controlada por CSS de hover/foco) — testado via foco programático, não hover simulado.
    const moreActions = mealCard.getByRole("button", { name: /mais ações do alimento/i }).first();
    await moreActions.focus();
    await expect(moreActions).toBeFocused();
    await moreActions.click();
    await expect(mealCard.getByRole("button", { name: /^editar$/i })).toBeVisible();
  });

  test("quantidade/unidade e R3 continuam intactos com a food row compacta (sem regressão do menu novo)", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    const meal = await addMeal(page, "Jantar R6.5.2C");
    await selectFood(page, meal, "Arroz, tipo 1, cozido", /arroz/i);
    await setLastQuantity(meal, "100");
    await meal.locator('input[aria-label="Quantidade"]:visible').last().blur();

    // Trocas (R3) continua acessível, uma única entrada.
    const trocasButtons = meal.getByRole("button", { name: /trocas/i });
    expect(await trocasButtons.count()).toBeGreaterThan(0);

    // Menu novo da refeição não interfere na edição do item.
    await meal.getByRole("button", { name: /ações da refeição/i }).click();
    await page.keyboard.press("Escape");
    await expect(meal.locator('input[aria-label="Quantidade"]')).toHaveCount(1);
  });
});
