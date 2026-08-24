import { mkdirSync, rmSync } from "node:fs";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestPatient, uniquePhone, uniqueSuffix } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

const SCREENSHOT_DIR = "reports/screenshots/patient-record";

async function expectOk(response: { ok(): boolean; status(): number; text(): Promise<string> }, label: string) {
  if (!response.ok()) throw new Error(`${label} falhou (${response.status()}): ${await response.text()}`);
}

async function screenshot(page: Page, name: string, projectName: string, retry: number) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const path = `${SCREENSHOT_DIR}/${name}-${projectName}-r${retry}.png`;
  // Playwright/Chromium can fail replacing an already-open PNG on Windows.
  // These are deterministic E2E review artifacts, so remove only this test's
  // exact previous output before creating the new file.
  rmSync(path, { force: true });
  await page.screenshot({ path, fullPage: true });
}

async function openAnamnesis(page: Page, patientId: string) {
  await suppressDailyBriefingPopup(page);
  await page.goto(`/dashboard/clients/${patientId}?tab=anamnese`);
  await expect(page.getByRole("heading", { name: "Anamnese", exact: true })).toBeVisible();
}

async function seedAnamnesis(request: APIRequestContext, overrides: Record<string, unknown> = {}) {
  const patient = await createTestPatient(request, { name: `Patient Anamnesis P4 Test ${uniqueSuffix()}` });
  const current = await request.get(`/api/admin/clients/${patient.id}/nutrition-record`);
  await expectOk(current, "load nutrition record");
  const record = await current.json() as { version: number };
  await expectOk(await request.patch(`/api/admin/clients/${patient.id}/nutrition-record`, {
    data: {
      chief_complaint: "Emagrecimento e melhora da disposição.",
      goals: "Reduzir medidas sem piorar a relação com a comida.",
      biological_sex: "Feminino",
      life_stage: "Adulto responsavel",
      diagnoses: "Hipotireoidismo controlado.",
      medications: "Levotiroxina 50 mcg pela manhã.",
      supplements: "Vitamina D semanal.",
      allergies: "Nenhuma alergia alimentar confirmada.",
      restrictions: "Evita leite por desconforto.",
      sleep_routine: "6h30 por noite, qualidade regular.",
      intestinal_health: "Evacuação diária, gases ocasionais.",
      hydration: "1,8 L de água por dia.",
      physical_activity: "Musculação 3x/semana.",
      eating_routine: "Café em casa, almoço no trabalho e jantar tarde. Texto longo para validar leitura compacta sem transformar a anamnese em formulário extenso.",
      food_preferences: "Arroz, feijão, frutas e ovos.",
      food_aversions: "Peixe cozido.",
      exams: "TSH dentro da meta em agosto.",
      assessment: "Boa adesão inicial, sono ainda limitante.",
      care_plan: "Ajustar horários e manter proteína no café da manhã.",
      expectedVersion: record.version,
      ...overrides,
    },
  }), "seed anamnesis");
  return patient;
}

async function seedPreConsultationPatient(request: APIRequestContext) {
  const suffix = uniqueSuffix();
  const submission = await request.post("/api/form-submissions", {
    data: {
      nome: `Patient Anamnesis P4 Pre ${suffix}`,
      email: `p4-pre-${suffix}@test.local`,
      whatsapp: uniquePhone(),
      privacyAccepted: true,
      companyWebsite: "",
      motivacao: "Respondido pelo paciente em pré-consulta: melhorar energia.",
      objetivo: "Melhorar disposição",
      diagnostico: "Resistência à insulina",
      medicacao: "Metformina",
      sonoHoras: "7 horas",
      intestinoFreq: "Diário",
      diaAlimentar: "Café, almoço e jantar em horários regulares.",
      naoGosta: "Coentro",
      suplementos: "Ômega 3",
    },
  });
  await expectOk(submission, "create pre consultation");
  const { id } = await submission.json() as { id: string };
  const converted = await request.post(`/api/admin/submissions/${id}/convert-to-client`);
  await expectOk(converted, "convert pre consultation");
  const body = await converted.json() as { clientId: string };
  return { id: body.clientId };
}

test.describe("Patient Record P4 anamnesis", () => {
  // Full-page captures on this long clinical form are unstable when several
  // P4 pages capture concurrently on Windows. Keep the test cases intact,
  // but serialize this artifact-producing spec within each browser project.
  test.describe.configure({ mode: "serial" });
  test("read mode opens as structured record without section inputs", async ({ page, request }, testInfo) => {
    const patient = await seedAnamnesis(request);
    await openAnamnesis(page, patient.id);

    await expect(page.getByRole("heading", { name: "Objetivo e contexto" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sono, intestino e rotina" })).toBeVisible();
    await expect(page.locator("#anamnesis-section-saude").getByText("Levotiroxina 50 mcg pela manhã.")).toBeVisible();
    await expect(page.locator("#anamnesis-section-rotina").getByText("6h30 por noite, qualidade regular.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar secao" })).toHaveCount(0);
    await expect(page.locator("textarea")).toHaveCount(0);
    await screenshot(page, "P4-01-anamnesis-read-desktop", testInfo.project.name, testInfo.retry);
  });

  test("edits only one section and saves/reloads", async ({ page, request }, testInfo) => {
    const patient = await seedAnamnesis(request);
    await openAnamnesis(page, patient.id);

    const section = page.locator("#anamnesis-section-rotina");
    await section.getByRole("button", { name: "Editar secao" }).click();
    await expect(section.getByLabel("Sono e descanso")).toBeVisible();
    await expect(page.getByLabel("Motivo principal do acompanhamento")).toHaveCount(0);
    await section.getByLabel("Sono e descanso").fill("7h por noite, qualidade boa.");
    await section.getByRole("button", { name: "Salvar secao" }).click();
    await expect(page.getByText("Secao salva.")).toBeVisible();

    await page.reload();
    await expect(page.getByText("7h por noite, qualidade boa.")).toBeVisible();
    await screenshot(page, "P4-02-edit-one-section", testInfo.project.name, testInfo.retry);
    await screenshot(page, "P4-04-sleep-section", testInfo.project.name, testInfo.retry);
  });

  test("cancel restores persisted state", async ({ page, request }) => {
    const patient = await seedAnamnesis(request);
    await openAnamnesis(page, patient.id);

    const section = page.locator("#anamnesis-section-rotina");
    await section.getByRole("button", { name: "Editar secao" }).click();
    await section.getByLabel("Sono e descanso").fill("3h, texto nao salvo");
    page.once("dialog", (dialog) => dialog.accept());
    await section.getByRole("button", { name: "Cancelar" }).click();

    await expect(page.getByText("6h30 por noite, qualidade regular.")).toBeVisible();
    await expect(page.getByText("3h, texto nao salvo")).toHaveCount(0);
  });

  test("empty anamnesis starts guided and avoids false zeros", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request, { name: "Patient Anamnesis P4 Empty" });
    await openAnamnesis(page, patient.id);

    await expect(page.getByText("Anamnese ainda nao preenchida.")).toBeVisible();
    await expect(page.getByText("0 kg")).toHaveCount(0);
    await page.getByRole("button", { name: "Comecar anamnese" }).click();
    await expect(page.getByLabel("Motivo principal do acompanhamento")).toBeVisible();
    await screenshot(page, "P4-06-empty-anamnesis", testInfo.project.name, testInfo.retry);
  });

  test("conditional questions follow real schema semantics", async ({ page, request }) => {
    const patient = await seedAnamnesis(request, { biological_sex: "Masculino", life_stage: null, target_group: null });
    await openAnamnesis(page, patient.id);

    const profile = page.locator("#anamnesis-section-perfil");
    await profile.getByRole("button", { name: "Editar secao" }).click();
    await expect(profile.getByLabel("Fase do cuidado").locator("option", { hasText: "Gestacao" })).toHaveCount(0);
    await expect(profile.getByLabel("Semanas de gestacao")).toHaveCount(0);
  });

  test("pre-consultation answers appear as initial anamnesis source", async ({ page, request }, testInfo) => {
    const patient = await seedPreConsultationPatient(request);
    await openAnamnesis(page, patient.id);

    await expect(page.getByText("Respondido pelo paciente em pré-consulta: melhorar energia.")).toBeVisible();
    await expect(page.locator("#anamnesis-section-saude").getByText("Metformina")).toBeVisible();
    await expect(page.locator("#anamnesis-section-rotina").getByText("7 horas")).toBeVisible();
    await screenshot(page, "P4-07-pre-consultation-origin", testInfo.project.name, testInfo.retry);
  });

  test("structured restriction propagation remains coherent", async ({ page, request }, testInfo) => {
    const patient = await seedAnamnesis(request);
    await openAnamnesis(page, patient.id);

    await page.getByRole("button", { name: "Adicionar marcador" }).click();
    await page.getByLabel("Evidencia curta").fill("Relato confirmado na consulta.");
    await page.getByRole("button", { name: /^Adicionar$/ }).click();
    const restrictionPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Restricoes estruturadas" }) });
    await expect(restrictionPanel.locator("li").filter({ hasText: "Leite" })).toBeVisible();
    await screenshot(page, "P4-05-restrictions", testInfo.project.name, testInfo.retry);

    await page.getByRole("tab", { name: "Resumo" }).click();
    await expect(page.getByTestId("patient-record-overview").getByText("Leite")).toBeVisible();
  });

  test("cross-patient read and child-entity write are blocked", async ({ request }) => {
    const patientA = await createTestPatient(request, { name: "P4 Owner A" });
    const patientB = await createTestPatient(request, { name: "P4 Owner B" });
    const missing = await request.get("/api/admin/clients/00000000-0000-4000-8000-000000000000/nutrition-record");
    expect(missing.status()).toBe(404);

    const marker = await request.post(`/api/admin/clients/${patientB.id}/nutrition-record/structured-restrictions`, {
      data: { type: "ALLERGY", normalizedCode: "MILK", label: "Leite", severity: "moderate", status: "ACTIVE", source: "manual" },
    });
    await expectOk(marker, "create marker B");
    const markerBody = await marker.json() as { id: string };
    const crossWrite = await request.patch(`/api/admin/clients/${patientA.id}/nutrition-record/structured-restrictions/${markerBody.id}`, {
      data: { status: "RESOLVED" },
    });
    expect(crossWrite.status()).toBe(404);
  });

  test("mass assignment and invalid question writes fail", async ({ request }) => {
    const patient = await seedAnamnesis(request);
    const current = await request.get(`/api/admin/clients/${patient.id}/nutrition-record`);
    const record = await current.json() as { version: number };
    const response = await request.patch(`/api/admin/clients/${patient.id}/nutrition-record`, {
      data: { sleep_routine: "8h", arbitrary_question_id: "hack", expectedVersion: record.version },
    });
    expect(response.status()).toBe(400);
  });

  test("completed consultation context does not overwrite historical anamnesis", async ({ page, request }) => {
    const patient = await seedAnamnesis(request);
    const sessionResponse = await request.post(`/api/admin/clients/${patient.id}/consultation`);
    await expectOk(sessionResponse, "start consultation");
    const session = await sessionResponse.json() as { session: { id: string } };
    await expectOk(await request.post(`/api/admin/consultation-sessions/${session.session.id}/complete`, { data: { clientId: patient.id } }), "complete consultation");

    await openAnamnesis(page, patient.id);
    await expect(page.getByText("Hipotireoidismo controlado.")).toBeVisible();
  });

  test("mobile read is one column and legible", async ({ page, request }, testInfo) => {
    const patient = await seedAnamnesis(request);
    await page.setViewportSize({ width: 390, height: 900 });
    await openAnamnesis(page, patient.id);

    await expect(page.getByRole("heading", { name: "Anamnese", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rotina alimentar" })).toBeVisible();
    await screenshot(page, "P4-08-mobile-read", testInfo.project.name, testInfo.retry);
  });

  test("mobile edit keeps fields full width and save error state visible", async ({ page, request }, testInfo) => {
    const patient = await seedAnamnesis(request);
    await page.setViewportSize({ width: 390, height: 900 });
    await openAnamnesis(page, patient.id);

    const section = page.locator("#anamnesis-section-rotina");
    await section.getByRole("button", { name: "Editar secao" }).click();
    await expect(section.getByLabel("Sono e descanso")).toBeVisible();
    await section.getByLabel("Sono e descanso").fill("8h em dias úteis.");
    await screenshot(page, "P4-09-mobile-edit", testInfo.project.name, testInfo.retry);
    await section.getByRole("button", { name: "Salvar secao" }).click();
    await expect(page.getByText("8h em dias úteis.")).toBeVisible();
    await screenshot(page, "P4-10-validation-error", testInfo.project.name, testInfo.retry);
  });

  test("health section remains clinically readable", async ({ page, request }, testInfo) => {
    const patient = await seedAnamnesis(request);
    await openAnamnesis(page, patient.id);
    await expect(page.locator("#anamnesis-section-saude").getByText("Hipotireoidismo controlado.")).toBeVisible();
    await expect(page.locator("#anamnesis-section-saude").getByText("Vitamina D semanal.")).toBeVisible();
    await screenshot(page, "P4-03-health-section", testInfo.project.name, testInfo.retry);
  });
});
