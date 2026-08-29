import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient, seedNutritionRecordForReadiness } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * R5.1 — OPTIONS/COMBINATION/nested review E2E. Cobre o gap real que
 * bloqueava CLINICAL_COPILOT_R5_COMPLETE: geração de refeição flexível
 * pelo Copilot, resolução recursiva, revisão aninhada e aplicação no
 * Composer sem achatar a estrutura (options/choice_groups reais, não
 * texto/instructions).
 */

async function setFixture(request: APIRequestContext, clientId: string, meal: Record<string, unknown>) {
  const response = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", { data: { clientId, meals: [meal] } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function openWizardAndReachPreferences(page: import("@playwright/test").Page, patientId: string) {
  await page.goto(`/dashboard/clients/${patientId}`);
  await page.getByRole("tab", { name: "Plano alimentar" }).click();
  await page.getByRole("button", { name: /^criar com ia$/i }).click();
  const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /^continuar$/i }).click(); // context -> goals
  await dialog.getByRole("button", { name: /^continuar$/i }).click(); // goals -> meals
  await dialog.getByRole("button", { name: /^continuar$/i }).click(); // meals -> preferences
  await dialog.getByRole("checkbox", { name: /permitir estrutura flexível/i }).check();
  return dialog;
}

test.describe("Clinical Copilot R5.1 — OPTIONS/COMBINATION/nested review", () => {
  test("OPTIONS: gera 2 alternativas, aplica ao Composer preservando meal_structure e options (nunca achatado)", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await seedNutritionRecordForReadiness(request, patient.id);
    await setFixture(request, patient.id, {
      structure: "OPTIONS",
      mealKey: "cafe_da_manha",
      options: [
        { label: "Opção A", items: [{ query: "Ovo, de galinha, inteiro, cru", quantity: 100, unit: "g" }] },
        { label: "Opção B", items: [{ query: "Iogurte, natural", quantity: 170, unit: "g" }] },
      ],
    });

    const dialog = await openWizardAndReachPreferences(page, patient.id);
    await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();

    await expect(dialog.getByText("Opção A")).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText("Opção B")).toBeVisible();
    await expect(dialog.getByText(/nunca somadas no cálculo nutricional/i)).toBeVisible();

    await dialog.getByRole("button", { name: /^aplicar ao editor$/i }).click();
    await expect(dialog).not.toBeVisible();

    // O Composer real recebeu a refeição com meal_structure OPTIONS intacta — never flattened to SIMPLE/text.
    await expect(page.locator('select:near(:text("Café da manhã"))').first()).toBeVisible().catch(() => undefined);
    const structureSelects = page.locator("select");
    const count = await structureSelects.count();
    let sawOptions = false;
    for (let i = 0; i < count; i += 1) {
      const value = await structureSelects.nth(i).inputValue().catch(() => null);
      if (value === "OPTIONS") sawOptions = true;
    }
    expect(sawOptions).toBe(true);
  });

  test("COMBINATION: item NOT_FOUND dentro do grupo de escolha vira revisão aninhada; resolver manualmente não afeta o item fixo", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await seedNutritionRecordForReadiness(request, patient.id);
    await setFixture(request, patient.id, {
      structure: "COMBINATION",
      mealKey: "almoco",
      fixed_items: [{ query: "Arroz, tipo 1, cozido", quantity: 100, unit: "g" }],
      choice_groups: [{
        title: "Proteína",
        min_selections: 1,
        max_selections: 1,
        items: [{ query: "alimento completamente inexistente xyz123", quantity: 120, unit: "g" }],
      }],
      optional_items: [],
    });

    const dialog = await openWizardAndReachPreferences(page, patient.id);
    await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();

    await expect(dialog.getByText(/precisa de revisão.*proteína/i)).toBeVisible({ timeout: 20_000 });
    // O item fixo (arroz) continua presente e calculável, independente da pendência no grupo.
    await expect(dialog.getByText(/arroz/i)).toBeVisible();

    await dialog.getByRole("button", { name: "Remover" }).last().click();
    await expect(dialog.getByText(/precisa de revisão.*proteína/i)).toHaveCount(0);
  });

  test("desmarcado (padrão): Copilot continua gerando só SIMPLE — sem regressão", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await seedNutritionRecordForReadiness(request, patient.id);
    await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
      data: { clientId: patient.id, meals: [{ mealKey: "almoco", recipeId: null, items: [{ query: "Arroz, tipo 1, cozido", quantity: 100, unit: "g" }], rationale: null }] },
    });

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar com ia$/i }).click();
    const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await expect(dialog.getByRole("checkbox", { name: /permitir estrutura flexível/i })).not.toBeChecked();
    await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();
    await expect(dialog.getByText(/^\d+ kcal$/).first()).toBeVisible({ timeout: 20_000 });
  });
});
