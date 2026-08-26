import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

async function createDraft(request: Parameters<typeof createTestPatient>[0], patientId: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "F4 busca" } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function openFirstFoodEditor(page: import("@playwright/test").Page, patientId: string) {
  await page.goto(`/dashboard/clients/${patientId}`);
  await page.getByRole("tab", { name: "Plano alimentar" }).click();
  await page.getByRole("button", { name: /mais ações do alimento/i }).first().click();
  await page.getByRole("button", { name: /^editar$/i }).click();
  return page.locator('input[aria-label="Alimento"]').first();
}

test.describe("F4 multi-source food search", () => {
  test("desktop accepts the F5 clinical query set through the real Meal Plan editor", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createDraft(request, patient.id);
    const input = await openFirstFoodEditor(page, patient.id);
    for (const query of ["ovo", "ovo cozido", "arroz integral", "frango grelhado", "queijo minas", "batata doce", "maçã", "maca"]) {
      await input.fill(query);
      await expect(page.locator('[role="option"]:visible').first()).toBeVisible();
    }
  });

  test("keyboard navigation keeps the latest search result active and can dismiss the list", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createDraft(request, patient.id);
    const input = await openFirstFoodEditor(page, patient.id);

    await input.fill("o");
    await input.fill("ov");
    await input.fill("ovo");
    await expect(page.locator('[role="option"]:visible').filter({ hasText: /ovo/i }).first()).toBeVisible();

    await input.press("ArrowDown");
    await expect(input).toHaveAttribute("aria-activedescendant", /-option-\d+$/);
    await input.press("Enter");
    await expect(page.locator('[role="option"]:visible')).toHaveCount(0);

    await input.fill("ovo");
    await expect(page.locator('[role="option"]:visible').first()).toBeVisible();
    await input.press("Escape");
    await expect(page.locator('[role="option"]:visible')).toHaveCount(0);
  });

  test("desktop keeps source visible and preserves chosen food after save/reload", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    await createDraft(request, patient.id);
    const input = await openFirstFoodEditor(page, patient.id);
    await input.fill("ovo");
    const option = page.getByRole("option").filter({ hasText: /ovo/i }).first();
    await expect(option).toBeVisible();
    await expect(option).toContainText(/TACO|IBGE|TBCA|USDA/i);
    await option.click();
    const quantity = page.locator('input[aria-label="Quantidade"]:visible').first();
    await quantity.fill("2");
    await page.screenshot({ path: `reports/screenshots/food-search-f4-desktop-${testInfo.project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByText(/ovo/i).first()).toBeVisible();
    await expect(page.getByText(/^2\s*(g|medida)$/i).first()).toBeVisible();
  });

  test("mobile search list remains usable without horizontal overflow", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    await createDraft(request, patient.id);
    await page.setViewportSize({ width: 390, height: 844 });
    const input = await openFirstFoodEditor(page, patient.id);
    await input.fill("ovo");
    await expect(page.getByRole("option").filter({ hasText: /ovo/i }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `reports/screenshots/food-search-f4-mobile-${testInfo.project.name}.png`, fullPage: true });
  });
});
