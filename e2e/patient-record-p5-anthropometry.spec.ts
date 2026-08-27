import { mkdirSync } from "node:fs";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestPatient, startConsultationSession } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

const SCREENSHOT_DIR = "reports/screenshots/patient-record";

async function expectOk(response: { ok(): boolean; status(): number; text(): Promise<string> }, label: string) {
  if (!response.ok()) throw new Error(`${label} falhou (${response.status()}): ${await response.text()}`);
}

async function screenshot(page: Page, name: string, projectName: string, retry: number) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}-${projectName}-r${retry}.png`, fullPage: true });
}

async function createEvolution(request: APIRequestContext, patientId: string, data: Record<string, unknown>) {
  const response = await request.post(`/api/admin/clients/${patientId}/evolutions`, { data });
  await expectOk(response, "create evolution");
  return response.json() as Promise<{ success: boolean; evolutionId: string }>;
}

async function seedP5Patient(request: APIRequestContext) {
  const patient = await createTestPatient(request, { name: "Patient Anthropometry P5 Test" });
  await createEvolution(request, patient.id, {
    measured_at: "2026-06-01T12:00:00.000Z",
    weight: 72.0,
    height: 168,
    waist_cm: 88,
    body_fat_percentage: 30.0,
  });
  await createEvolution(request, patient.id, {
    measured_at: "2026-07-15T12:00:00.000Z",
    weight: 70.0,
    height: 168,
    waist_cm: 85,
    body_fat_percentage: 29.2,
  });
  const latest = await createEvolution(request, patient.id, {
    measured_at: "2026-08-23T12:00:00.000Z",
    weight: 68.4,
    height: 168,
    waist_cm: 82,
    body_fat_percentage: 27.4,
    progress_notes: "P5 avaliação atual.",
  });
  return { ...patient, latestEvolutionId: latest.evolutionId };
}

async function openAnthropometry(page: Page, patientId: string) {
  await suppressDailyBriefingPopup(page);
  await page.goto(`/dashboard/clients/${patientId}?tab=antropometria`);
  await expect(page.getByTestId("anthropometry-progress-panel").getByRole("heading", { name: "Antropometria e progresso" })).toBeVisible();
}

test.describe("Patient Record P5 anthropometry progress", () => {
  test("current state, previous comparison, chart, history and details", async ({ page, request }, testInfo) => {
    const patient = await seedP5Patient(request);
    await openAnthropometry(page, patient.id);
    const panel = page.getByTestId("anthropometry-progress-panel");

    await expect(panel.getByText("Última avaliação: 23/08/2026")).toBeVisible();
    await expect(panel.getByLabel("Resumo antropometrico atual").getByText("68,4 kg")).toBeVisible();
    await expect(panel.getByLabel("Resumo antropometrico atual").getByText("82 cm")).toBeVisible();
    await expect(panel.getByLabel("Resumo antropometrico atual").getByText("27,4 %")).toBeVisible();
    await expect(panel.getByText("Diferença vs anterior: -1,6 kg")).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Atual vs anterior" })).toBeVisible();
    await expect(panel.getByRole("row", { name: /Peso 70 kg 68,4 kg -1,6 kg/i })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Peso" })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Histórico de avaliações" })).toBeVisible();
    await expect(panel.getByRole("button", { name: /Detalhes/i }).first()).toBeVisible();

    await screenshot(page, "P5-01-progress-desktop", testInfo.project.name, testInfo.retry);
    await screenshot(page, "P5-02-current-vs-previous", testInfo.project.name, testInfo.retry);
    await screenshot(page, "P5-03-weight-chart", testInfo.project.name, testInfo.retry);
    await screenshot(page, "P5-05-assessment-history", testInfo.project.name, testInfo.retry);

    await panel.getByRole("button", { name: /Detalhes/i }).first().click();
    await expect(panel.getByRole("heading", { name: "23/08/2026" })).toBeVisible();
    await expect(panel.getByText("P5 avaliação atual.")).toBeVisible();
    await screenshot(page, "P5-06-assessment-details", testInfo.project.name, testInfo.retry);
  });

  test("first comparison shows current versus first golden deltas", async ({ page, request }) => {
    const patient = await seedP5Patient(request);
    await openAnthropometry(page, patient.id);
    const panel = page.getByTestId("anthropometry-progress-panel");

    // Sem escopo ao painel, esse nome bate por substring em "Iniciar
    // primeira consulta" também — bug de seletor pré-existente, não
    // relacionado ao Clinical Copilot.
    await panel.getByRole("button", { name: "Primeira" }).click();

    await expect(page.getByRole("heading", { name: "Atual vs primeira avaliação" })).toBeVisible();
    await expect(page.getByRole("row", { name: /Peso 72 kg 68,4 kg -3,6 kg/i })).toBeVisible();
    await expect(page.getByRole("row", { name: /Cintura 88 cm 82 cm -6 cm/i })).toBeVisible();
    await expect(page.getByRole("row", { name: /% gordura 30 % 27,4 % -2,6 p\.p\./i })).toBeVisible();
  });

  test("body composition metric and missing data do not render zero", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request, { name: "Patient P5 Missing Data" });
    await createEvolution(request, patient.id, { measured_at: "2026-07-01T12:00:00.000Z", weight: 70, height: 168, waist_cm: 85, body_fat_percentage: 29.2 });
    await createEvolution(request, patient.id, { measured_at: "2026-08-23T12:00:00.000Z", weight: 68.4, height: 168, waist_cm: null, body_fat_percentage: 27.4 });
    await openAnthropometry(page, patient.id);

    await page.getByRole("button", { name: "% gordura" }).click();

    await expect(page.getByRole("heading", { name: "% gordura" })).toBeVisible();
    await expect(page.getByText("0 cm")).toHaveCount(0);
    await expect(page.getByRole("row", { name: /23\/08\/2026 68,4 kg/ })).toContainText("Nao informado");
    await screenshot(page, "P5-04-body-composition", testInfo.project.name, testInfo.retry);
    await screenshot(page, "P5-11-missing-data-case", testInfo.project.name, testInfo.retry);
  });

  test("empty and single assessment states avoid fake deltas", async ({ page, request }, testInfo) => {
    const empty = await createTestPatient(request, { name: "Patient P5 Empty" });
    await openAnthropometry(page, empty.id);
    await expect(page.getByTestId("anthropometry-progress-panel").getByText("Nenhuma avaliação antropométrica registrada.")).toBeVisible();
    await expect(page.getByTestId("anthropometry-progress-panel").getByRole("button", { name: "Registrar primeira avaliação" })).toBeVisible();
    await screenshot(page, "P5-07-empty", testInfo.project.name, testInfo.retry);

    const single = await createTestPatient(request, { name: "Patient P5 Single" });
    await createEvolution(request, single.id, { measured_at: "2026-08-23T12:00:00.000Z", weight: 68.4, height: 168, waist_cm: 82 });
    await openAnthropometry(page, single.id);
    await expect(page.getByTestId("anthropometry-progress-panel").getByText("Diferença vs anterior: Sem comparativo").first()).toBeVisible();
    await expect(page.getByTestId("anthropometry-progress-panel").getByRole("heading", { name: /Atual vs anterior/i })).toHaveCount(0);
    await screenshot(page, "P5-08-single-assessment", testInfo.project.name, testInfo.retry);
  });

  test("new assessment updates progress, overview, timeline and consultation workspace", async ({ page, request }) => {
    const patient = await seedP5Patient(request);
    const session = await startConsultationSession(request, patient.id);
    await openAnthropometry(page, patient.id);
    const panel = page.getByTestId("anthropometry-progress-panel");

    await panel.getByRole("button", { name: "Nova avaliação" }).click();
    await page.locator('input[type="date"]').fill("2026-09-10");
    await page.getByPlaceholder("Ex: 68.5").fill("67.9");
    await page.getByPlaceholder("Ex: 165").fill("168");
    await page.getByPlaceholder("Ex: 82").fill("81");
    await page.getByRole("button", { name: /Registrar evolucao/i }).click();

    await expect(panel.getByText("Última avaliação: 10/09/2026")).toBeVisible();
    await expect(panel.getByLabel("Resumo antropometrico atual").getByText("67,9 kg")).toBeVisible();

    await page.getByRole("tab", { name: "Resumo" }).click();
    await expect(page.getByText("67,9 kg").first()).toBeVisible();

    await page.getByRole("tab", { name: "Evolução" }).click();
    await expect(page.getByTestId("patient-clinical-timeline").getByText("Avaliacao antropometrica").first()).toBeVisible();

    await page.goto(`/dashboard/clients/${patient.id}/consulta?sessionId=${session.id}`);
    await expect(page.getByText("67,9 kg").first()).toBeVisible();
  });

  test("cross-patient read and write are blocked", async ({ request }) => {
    const patientA = await createTestPatient(request, { name: "Patient P5 A" });
    const patientB = await createTestPatient(request, { name: "Patient P5 B" });
    const evolutionB = await createEvolution(request, patientB.id, { measured_at: "2026-08-23T12:00:00.000Z", weight: 80, height: 170 });

    const read = await request.get(`/api/admin/clients/${patientA.id}/evolutions/${evolutionB.evolutionId}`);
    const write = await request.patch(`/api/admin/clients/${patientA.id}/evolutions/${evolutionB.evolutionId}`, {
      data: { weight: 79 },
    });
    const progressMissing = await request.get("/api/admin/clients/00000000-0000-4000-8000-000000000000/anthropometry-progress");

    expect(read.status()).toBe(404);
    expect(write.status()).toBe(404);
    expect(progressMissing.status()).toBe(404);
  });

  test("mobile and tablet baselines remain usable", async ({ page, request }, testInfo) => {
    const patient = await seedP5Patient(request);

    await page.setViewportSize({ width: 390, height: 900 });
    await openAnthropometry(page, patient.id);
    await expect(page.getByTestId("anthropometry-progress-panel").getByRole("heading", { name: "Antropometria e progresso" })).toBeVisible();
    await expect(page.getByTestId("anthropometry-progress-panel").getByRole("button", { name: "Nova avaliação" })).toBeVisible();
    await screenshot(page, "P5-09-mobile-390", testInfo.project.name, testInfo.retry);

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await expect(page.getByTestId("anthropometry-progress-panel").getByRole("heading", { name: "Antropometria e progresso" })).toBeVisible();
    await screenshot(page, "P5-10-tablet", testInfo.project.name, testInfo.retry);
  });
});
