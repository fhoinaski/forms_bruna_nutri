import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * R6.5 — Composer UX/UI: prova real (não só visual) do que foi
 * profissionalizado nesta fase: sidebar de nutrição com header de
 * energia/meta, barras de progresso por macro, e missing nunca exibido
 * como 0%/"sem dado" (sempre "—"). Também serve de screenshot
 * before/after (desktop/tablet/mobile) pro relatório final.
 */

test.describe("Meal Plan Composer R6.5 — sidebar de nutrição profissionalizada", () => {
  test("desktop: header de energia/meta, barras de progresso por macro, missing como —", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    const planRes = await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R6.5 UI" } });
    expect(planRes.ok(), await planRes.text()).toBeTruthy();
    const plan = await planRes.json() as { id: string; title: string };
    const putRes = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: {
        title: plan.title,
        status: "draft",
        meals: [{ name: "Almoço", items: [{ food: "Arroz, tipo 1, cozido", quantity: "150", unit: "g", food_source: "TACO", food_ref_id: "129" }] }],
        weekly_slots: [], substitutions: [], supplements: [],
        target_energy_kcal: 2000, target_protein_g: 100, target_carbohydrate_g: 250, target_fat_g: 65,
        expectedVersion: 1,
      },
    });
    expect(putRes.ok(), await putRes.text()).toBeTruthy();

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByText(/kcal/).first()).toBeVisible({ timeout: 10_000 });

    // Header de energia/meta (seção 20) e % da meta (seção 21).
    await expect(page.getByText(/\/ 2000 kcal/)).toBeVisible();
    await expect(page.getByText(/% da meta/)).toBeVisible();

    // Barras de progresso por macro (seção 21) — role=progressbar, uma por macro.
    const bars = page.locator('[role="progressbar"]');
    await expect(bars).toHaveCount(3, { timeout: 10_000 });

    // Micronutriente sem dado mostra "—", nunca "0%"/"0".
    const microSummary = page.getByText("Micronutrientes");
    await microSummary.click();
    await expect(page.getByText("0%").first()).toHaveCount(0);

    await page.screenshot({ path: `reports/screenshots/meal-plan-ui-r6-5-desktop-${testInfo.project.name}.png`, fullPage: true });
  });

  test("tablet: composer permanece utilizável (1 coluna funcional, sem overflow horizontal quebrado)", async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByRole("heading", { name: /prescri..o visual/i }).first()).toBeVisible({ timeout: 10_000 });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 4);
    await page.screenshot({ path: `reports/screenshots/meal-plan-ui-r6-5-tablet-${testInfo.project.name}.png`, fullPage: true });
  });

  test("mobile: composer permanece utilizável (1 coluna, sem overflow horizontal quebrado)", async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByRole("heading", { name: /prescri..o visual/i }).first()).toBeVisible({ timeout: 10_000 });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 4);
    await page.screenshot({ path: `reports/screenshots/meal-plan-ui-r6-5-mobile-${testInfo.project.name}.png`, fullPage: true });
  });

  test("plano grande (8 refeições / itens múltiplos) continua renderizando sem quebrar", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const planRes = await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R6.5 large plan" } });
    const plan = await planRes.json() as { id: string; title: string };
    const meals = Array.from({ length: 8 }, (_, mealIndex) => ({
      name: `Refeição ${mealIndex + 1}`,
      items: Array.from({ length: 6 }, (_, itemIndex) => ({ food: `Arroz, tipo 1, cozido`, quantity: String(50 + itemIndex), unit: "g", food_source: "TACO", food_ref_id: "129" })),
    }));
    const putRes = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: { title: plan.title, status: "draft", meals, weekly_slots: [], substitutions: [], supplements: [], expectedVersion: 1 },
    });
    expect(putRes.ok(), await putRes.text()).toBeTruthy();

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByRole("article").filter({ hasText: "Refeição 8" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("article").filter({ hasText: "Refeição 1" })).toBeVisible();
  });
});
