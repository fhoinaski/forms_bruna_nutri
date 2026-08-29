import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * R6.5.4 — badge de prontidão (texto+ícone pros 3 estados reais do motor,
 * incluindo READY que antes não mostrava NADA) e chips de resumo de
 * revisão (contadores reais já computados, nunca inventados) no
 * Assistente de IA. Também prova o rótulo "Última alteração" no toolbar
 * do Composer (usa updated_at real, já presente na API).
 */

async function setFixture(request: APIRequestContext, clientId: string, meal: Record<string, unknown>) {
  const response = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", { data: { clientId, meals: [meal] } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function openWizardAndGenerate(page: Page, patientId: string) {
  await page.goto(`/dashboard/clients/${patientId}`);
  await page.getByRole("tab", { name: "Plano alimentar" }).click();
  await page.getByRole("button", { name: /^criar com ia$/i }).click();
  const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /^continuar$/i }).click();
  await dialog.getByRole("button", { name: /^continuar$/i }).click();
  await dialog.getByRole("button", { name: /^continuar$/i }).click();
  await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();
  return dialog;
}

test.describe("Meal Plan Composer R6.5.4 — Copilot: prontidão + chips de revisão; toolbar: última alteração", () => {
  test("badge de prontidão: paciente sem dados mostra 'Faltam informações' com ícone (não só texto solto)", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar com ia$/i }).click();

    const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    const badge = dialog.getByText("Faltam informações", { exact: true });
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await expect(badge.locator("xpath=..").locator("svg")).toHaveCount(1);
  });

  test("chips de resumo de revisão: refeição totalmente resolvida mostra 'N resolvido(s)', sem chip de revisar/não encontrado", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await setFixture(request, patient.id, { mealKey: "almoco", recipeId: null, items: [{ query: "Arroz, tipo 1, cozido", quantity: 100, unit: "g" }], rationale: null });

    const dialog = await openWizardAndGenerate(page, patient.id);
    const summary = dialog.getByRole("status", { name: "Resumo da revisão" });
    await expect(summary).toBeVisible({ timeout: 20_000 });
    await expect(summary.getByText("1 resolvido", { exact: true })).toBeVisible();
    await expect(summary.getByText(/revisar/)).toHaveCount(0);
    await expect(summary.getByText(/não encontrado/)).toHaveCount(0);
  });

  test("chips de resumo de revisão: item COMBINATION não resolvido mostra chip 'pra revisar' com contagem real", async ({ page, request }) => {
    const patient = await createTestPatient(request);
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

    const dialog = await openWizardAndGenerate(page, patient.id);
    const summary = dialog.getByRole("status", { name: "Resumo da revisão" });
    await expect(summary).toBeVisible({ timeout: 20_000 });
    await expect(summary.getByText(/1 pra revisar/)).toBeVisible();
    await expect(summary.getByText("1 resolvido", { exact: true })).toBeVisible();
  });

  test("toolbar do Composer mostra 'Última alteração' após salvar (não mostra enquanto há edição não salva)", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const planRes = await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R6.5.4 Timestamp" } });
    const plan = await planRes.json() as { id: string; title: string };
    const putRes = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: {
        title: plan.title, status: "draft",
        meals: [{ name: "Almoço", items: [{ food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "129" }] }],
        weekly_slots: [], substitutions: [], supplements: [], expectedVersion: 1,
      },
    });
    expect(putRes.ok(), await putRes.text()).toBeTruthy();

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByText(/^Última alteração às \d{2}:\d{2}$/)).toBeVisible({ timeout: 10_000 });

    // Ao editar (sem salvar ainda), o rótulo de timestamp some — "Alterações não salvas" já comunica o estado.
    await page.getByRole("button", { name: /^adicionar refeição$/i }).click();
    await expect(page.getByText(/^Última alteração às \d{2}:\d{2}$/)).toHaveCount(0);
    await expect(page.getByText(/alterações não salvas/i)).toBeVisible();
  });
});
