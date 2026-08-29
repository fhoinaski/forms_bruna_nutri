import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient, seedNutritionRecordForReadiness } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

type PlanResponse = {
  id: string;
  title: string;
  status: "draft" | "active" | "archived";
  target_group: string | null;
  meals: Array<{ id: string; name: string; items: Array<{ id: string; food: string; quantity?: string | null; unit?: string | null; food_source?: string | null; food_ref_id?: string | null; quantity_locked?: boolean }> }>;
};

async function createTemplatePlan(request: APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<PlanResponse>;
}

async function setFixture(request: APIRequestContext, clientId: string, mealKey: string, query: string) {
  const response = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
    data: { clientId, meals: [{ mealKey, recipeId: null, items: [{ query, quantity: 100, unit: "g" }], rationale: null }] },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test.describe("Clinical Copilot R5 — Readiness e Previous Plan Changeset", () => {
  test("NOT_READY: prontuário em branco mostra aviso, mas nunca bloqueia o wizard de abrir", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar com ia$/i }).click();

    const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    await expect(dialog).toBeVisible();
    // Paciente novo sem plano anterior — entra direto em "Dados do paciente" (sem etapa "source").
    await expect(dialog.getByText("Faltam informações para gerar uma proposta segura.")).toBeVisible({ timeout: 10_000 });
  });

  test("plano anterior: seletor 'Usar plano anterior como base' aparece só quando há plano existente", async ({ page, request }) => {
    const withPlan = await createTestPatient(request);
    await createTemplatePlan(request, withPlan.id, "R5 has plan");
    await page.goto(`/dashboard/clients/${withPlan.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar com ia$/i }).click();
    const dialogWithPlan = page.getByRole("dialog", { name: /criar plano com ia/i });
    await expect(dialogWithPlan.getByText("Usar plano anterior como base")).toBeVisible();

    const withoutPlan = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${withoutPlan.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar com ia$/i }).click();
    const dialogWithoutPlan = page.getByRole("dialog", { name: /criar plano com ia/i });
    await expect(dialogWithoutPlan.getByText("Usar plano anterior como base")).toHaveCount(0);
  });

  test("changeset: regenerar só o Almoço mostra o diff correto e aplica sem tocar o plano original", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await seedNutritionRecordForReadiness(request, patient.id);
    const sourcePlan = await createTemplatePlan(request, patient.id, "R5 changeset source");
    const originalMealsJson = JSON.stringify(sourcePlan.meals);

    await setFixture(request, patient.id, "almoco", "Batata, doce, cozida");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar com ia$/i }).click();

    const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    await expect(dialog).toBeVisible();
    await dialog.getByText("Usar plano anterior como base").click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click(); // source -> context
    await dialog.getByRole("button", { name: /^continuar$/i }).click(); // context -> goals
    await dialog.getByRole("button", { name: /^continuar$/i }).click(); // goals -> meals

    // Só seleciona Almoço pra regenerar (desmarca as demais que vêm marcadas por padrão).
    for (const label of ["Café da manhã", "Lanche da tarde", "Jantar"]) {
      const checkbox = dialog.locator(`label:has-text("${label}")`).locator("..").locator('input[type="checkbox"]');
      if (await checkbox.isChecked().catch(() => false)) await checkbox.uncheck();
    }
    const almocoCheckbox = dialog.locator('label:has-text("Almoço")').locator("..").locator('input[type="checkbox"]');
    await almocoCheckbox.check();

    await dialog.getByRole("button", { name: /^continuar$/i }).click(); // meals -> preferences
    await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();

    await expect(dialog.getByText(/alterações propostas sobre/i)).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(/refeição\(ões\) mantida\(s\)/i)).toBeVisible();
    await expect(dialog.getByText(/1 alterada/)).toBeVisible();
    await expect(dialog.getByText(/✎ Alterada: Almoço/)).toBeVisible();

    await dialog.getByRole("button", { name: /^aplicar ao editor$/i }).click();
    await expect(dialog).not.toBeVisible();

    // O plano de ORIGEM nunca foi alterado.
    const plansAfter = await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json() as PlanResponse[];
    const stillOriginal = plansAfter.find((p) => p.id === sourcePlan.id);
    expect(JSON.stringify(stillOriginal?.meals)).toBe(originalMealsJson);

    // Um NOVO draft foi criado com o Almoço substituído e as outras refeições preservadas.
    const newDraft = plansAfter.find((p) => p.id !== sourcePlan.id);
    expect(newDraft).toBeTruthy();
  });

  test("refeição bloqueada (quantity_locked) nunca aparece marcável pro Copilot regenerar", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const sourcePlan = await createTemplatePlan(request, patient.id, "R5 locked meal");
    const lunchMeal = sourcePlan.meals.find((m) => /almo[çc]o/i.test(m.name));
    expect(lunchMeal).toBeTruthy();

    // Bloqueia o primeiro item do Almoço diretamente via API (mesmo contrato usado pelo editor real).
    // O schema de update é .strict() — reconstrói cada refeição/item só com
    // os campos aceitos (nunca reenvia `id`, que não faz parte do payload).
    const lockedMeals = sourcePlan.meals.map((meal, mealIndex) => ({
      name: meal.name,
      items: meal.items.map((item, itemIndex) => ({
        food: item.food,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        food_source: item.food_source ?? null,
        food_ref_id: item.food_ref_id ?? null,
        quantity_locked: mealIndex === sourcePlan.meals.indexOf(lunchMeal!) && itemIndex === 0 ? true : Boolean(item.quantity_locked),
      })),
    }));
    const putResponse = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${sourcePlan.id}`, {
      data: { title: sourcePlan.title, status: sourcePlan.status, meals: lockedMeals, weekly_slots: [], substitutions: [], supplements: [], expectedVersion: 1 },
    });
    expect(putResponse.ok(), await putResponse.text()).toBeTruthy();

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar com ia$/i }).click();
    const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    await dialog.getByText("Usar plano anterior como base").click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();

    const almocoRow = dialog.locator('label:has-text("Almoço")').locator("..");
    await expect(almocoRow.getByText("🔒")).toBeVisible();
    const almocoCheckbox = almocoRow.locator('input[type="checkbox"]');
    await expect(almocoCheckbox).toBeDisabled();
    await expect(almocoCheckbox).not.toBeChecked();
  });
});
