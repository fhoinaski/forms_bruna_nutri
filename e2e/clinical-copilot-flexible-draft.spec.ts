import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient, seedNutritionRecordForReadiness } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

async function generate(page: import("@playwright/test").Page, patientId: string) {
  await page.goto(`/dashboard/clients/${patientId}`);
  await page.getByRole("tab", { name: "Plano alimentar" }).click();
  await page.getByRole("button", { name: /^criar com ia$/i }).click();
  const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
  await dialog.getByRole("button", { name: /^continuar$/i }).click();
  await dialog.getByRole("button", { name: /^continuar$/i }).click();
  await dialog.getByRole("button", { name: /^continuar$/i }).click();
  await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();
  return dialog;
}

async function saveAndReload(page: import("@playwright/test").Page, dialog: import("@playwright/test").Locator) {
  await dialog.getByRole("button", { name: /^aplicar ao editor$/i }).click();
  await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
  await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Plano alimentar" }).click();
}

test.describe("Clinical Copilot flexible drafts", () => {
  test("OPTIONS survives generation, editor, save and reload without summing alternatives", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await seedNutritionRecordForReadiness(request, patient.id);
    const fixture = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", { data: { clientId: patient.id, meals: [{
      mealKey: "almoco", structure: "OPTIONS",
      options: [
        { label: "Opção arroz", items: [{ query: "Arroz, tipo 1, cozido", quantity: 100, unit: "g", preparation: "cozido" }] },
        { label: "Opção banana", items: [{ query: "Banana, prata, crua", quantity: 100, unit: "g", optional: true }] },
      ],
    }] } });
    expect(fixture.ok(), await fixture.text()).toBeTruthy();
    const dialog = await generate(page, patient.id);
    await expect(dialog.getByText("Opção arroz")).toBeVisible();
    await expect(dialog.getByText("Opção banana")).toBeVisible();
    // A UI recebe o mínimo da faixa; o teste de domínio garante que 100g de
    // arroz + 100g de banana não seja somado como uma opção única.
    await expect(dialog.getByText(/^\d+ kcal$/).first()).toBeVisible();
    await saveAndReload(page, dialog);
    const plans = await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json() as Array<{ meals: Array<{ meal_structure?: string; options?: unknown[] }> }>;
    const meal = plans[0]?.meals.find((entry) => entry.meal_structure === "OPTIONS");
    expect(meal?.options).toHaveLength(2);
    expect(JSON.stringify(meal)).toContain("Opção arroz");
    expect(JSON.stringify(meal)).toContain("Opção banana");
  });

  test("COMBINATION survives generation, editor, save and reload", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await seedNutritionRecordForReadiness(request, patient.id);
    const fixture = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", { data: { clientId: patient.id, meals: [{
      mealKey: "almoco", structure: "COMBINATION",
      fixed_items: [{ query: "Arroz, tipo 1, cozido", quantity: 80, unit: "g", preparation: "cozido" }],
      choice_groups: [{ title: "Escolha uma proteína", min_selections: 1, max_selections: 1, items: [
        { query: "Frango, peito, sem pele, grelhado", quantity: 100, unit: "g" },
        { query: "Ovo, de galinha, inteiro, cozido", quantity: 100, unit: "g", optional: true },
      ] }],
    }] } });
    expect(fixture.ok(), await fixture.text()).toBeTruthy();
    const dialog = await generate(page, patient.id);
    await expect(dialog.getByText("Escolha uma proteína")).toBeVisible();
    await expect(dialog.getByText(/^\d+ kcal$/).first()).toBeVisible();
    await saveAndReload(page, dialog);
    const plans = await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json() as Array<{ meals: Array<{ meal_structure?: string; items?: unknown[]; choice_groups?: unknown[] }> }>;
    const meal = plans[0]?.meals.find((entry) => entry.meal_structure === "COMBINATION");
    expect(meal?.items).toHaveLength(1);
    expect(meal?.choice_groups).toHaveLength(1);
    expect(JSON.stringify(meal)).toContain("Escolha uma proteína");
  });
});
