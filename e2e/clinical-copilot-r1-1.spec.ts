import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

async function openConsultation(page: import("@playwright/test").Page, patient: { id: string }) {
  await suppressDailyBriefingPopup(page);
  await page.goto(`/dashboard/clients/${patient.id}`);
  await page.getByRole("button", { name: "Iniciar primeira consulta" }).click();
  await expect(page.getByRole("heading", { name: "Pré-análise para o plano" })).toBeVisible();
}

test.describe("Clinical copilot R1.1", () => {
  test("dados completos: card compacto abre o detalhe com dados rastreáveis", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const existing = await request.get(`/api/admin/clients/${patient.id}/nutrition-record`);
    const record = await existing.json();
    const update = await request.patch(`/api/admin/clients/${patient.id}/nutrition-record`, { data: {
      expectedVersion: record.version, goals: "Emagrecimento", current_weight_kg: "70", height_cm: "165", eating_routine: "Trabalha das 9h às 18h", allergies: "Nenhuma",
    } });
    expect(update.ok()).toBe(true);
    await openConsultation(page, patient);
    await expect(page.getByText(/5 informações disponíveis/i)).toBeVisible();
    await page.getByRole("button", { name: "Revisar pré-análise" }).click();
    const dialog = page.getByRole("dialog", { name: "Revisar pré-análise" });
    await expect(dialog.getByText("Dados disponíveis")).toBeVisible();
    await expect(dialog.getByText("Emagrecimento")).toBeVisible();
    await expect(dialog.getByText("Origem: Prontuário").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("dados ausentes: detalhe mostra pendências e perguntas, sem bloquear a consulta", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await openConsultation(page, patient);
    await expect(page.getByText("Ainda faltam informações para preparar o plano.")).toBeVisible();
    await page.getByRole("button", { name: "Revisar pré-análise" }).click();
    const dialog = page.getByRole("dialog", { name: "Revisar pré-análise" });
    await expect(dialog.getByText("Informações pendentes")).toBeVisible();
    await expect(dialog.getByText("Perguntas sugeridas")).toBeVisible();
    await expect(dialog.getByText(/Como são seus horários de acordar/i)).toBeVisible();
  });

  test("conflito: o detalhe exibe ambas as fontes sem decidir por uma", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.route(`**/api/admin/clients/${patient.id}/meal-plans/clinical-copilot`, async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({
        facts: [{ key: "objective", label: "Objetivo", state: "CONFLICTING", value: "Emagrecimento", source: "nutrition_record", sourcePath: "nutrition_record.goals", conflictingValue: "Ganho de massa" }],
        completion: { known: 0, required: 1, percent: 0 }, questions: [], canGenerateDraft: false, brief: {},
      }) });
    });
    await openConsultation(page, patient);
    await expect(page.getByText(/1 conflito/i)).toBeVisible();
    await page.getByRole("button", { name: "Revisar pré-análise" }).click();
    const dialog = page.getByRole("dialog", { name: "Revisar pré-análise" });
    await expect(dialog.getByText("Conflitos para revisar")).toBeVisible();
    await expect(dialog.getByText("Prontuário:")).toBeVisible();
    await expect(dialog.getByText("Pré-consulta:")).toBeVisible();
    await expect(dialog.getByText(/Confirme a informação/i)).toBeVisible();
  });
});
