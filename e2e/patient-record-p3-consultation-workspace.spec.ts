import { mkdirSync } from "node:fs";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestPatient, createTestSubmission, startConsultationSession, uniqueSuffix } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

const SCREENSHOT_DIR = "reports/screenshots/patient-record";

type PlanResponse = {
  id: string;
  version: number;
  title: string;
  status: "draft" | "active" | "archived";
  notes: string | null;
  meals: Array<{
    name: string;
    meal_context?: string | null;
    suggested_time?: string | null;
    notes?: string | null;
    source_recipe_id?: string | null;
    items: Array<Record<string, unknown>>;
  }>;
  weekly_slots: [];
  substitutions: [];
  supplements: [];
};

async function expectOk(response: { ok(): boolean; status(): number; text(): Promise<string> }, label: string) {
  if (!response.ok()) throw new Error(`${label} falhou (${response.status()}): ${await response.text()}`);
}

async function screenshot(page: Page, name: string, projectName: string, retry: number) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}-${projectName}-r${retry}.png`, fullPage: true });
}

function mealPlanItem(food: string, quantity: string, foodRefId: string) {
  return {
    food,
    quantity,
    unit: "g",
    notes: null,
    food_source: "TACO",
    food_ref_id: foodRefId,
    canonical_food_id: null,
    household_measure_id: null,
    quantity_locked: false,
    substitutions_locked: false,
    slot_food_group: "STARCHES",
    slot_food_subgroup: "RICE",
    slot_nutritional_role: "MAIN_STARCH",
    template_slot_id: `p3-${foodRefId}`,
    slot_exchange_eligible: true,
  };
}

async function createTemplatePlan(request: APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, {
    data: { targetGroup: "ADULTO_SAUDAVEL", title },
  });
  await expectOk(response, "createTemplatePlan");
  return response.json() as Promise<PlanResponse>;
}

async function savePlan(request: APIRequestContext, patientId: string, plan: PlanResponse, status: "draft" | "active", title: string) {
  const response = await request.put(`/api/admin/clients/${patientId}/meal-plans/${plan.id}`, {
    data: {
      title,
      status,
      notes: "Fixture P3 do workspace de consulta.",
      meals: [{
        name: "Almoco",
        meal_context: "LUNCH",
        suggested_time: "12:30",
        notes: null,
        source_recipe_id: null,
        items: [mealPlanItem("Arroz integral cozido", "120", "1"), mealPlanItem("Peito de frango grelhado", "120", "410")],
      }],
      weekly_slots: [],
      substitutions: [],
      supplements: [],
      expectedVersion: plan.version,
    },
  });
  await expectOk(response, "savePlan");
  return response.json() as Promise<PlanResponse>;
}

async function createPatientFromSubmission(request: APIRequestContext) {
  const submission = await createTestSubmission(request, {
    nome: `Patient Consultation P3 Test ${uniqueSuffix()}`,
  });
  const convert = await request.post(`/api/admin/submissions/${submission.id}/convert-to-client`);
  await expectOk(convert, "convert submission");
  const body = (await convert.json()) as { clientId: string };
  return { id: body.clientId, name: submission.patientName, submissionId: submission.id };
}

async function updateGoal(request: APIRequestContext, patientId: string) {
  const recordResponse = await request.get(`/api/admin/clients/${patientId}/nutrition-record`);
  await expectOk(recordResponse, "load nutrition record");
  const record = (await recordResponse.json()) as { version: number };
  await expectOk(await request.patch(`/api/admin/clients/${patientId}/nutrition-record`, {
    data: { goals: "Reduzir gordura corporal", expectedVersion: record.version },
  }), "update goal");
}

async function seedCompleteWorkspacePatient(request: APIRequestContext, options: { withSubmission?: boolean } = {}) {
  const patient = options.withSubmission
    ? await createPatientFromSubmission(request)
    : await createTestPatient(request, { name: `Patient Consultation P3 Test ${uniqueSuffix()}` });
  await updateGoal(request, patient.id);
  await expectOk(await request.post(`/api/admin/clients/${patient.id}/nutrition-record/structured-restrictions`, {
    data: { type: "INTOLERANCE", normalizedCode: "LACTOSE", label: "Intolerância à lactose", severity: "moderate", status: "ACTIVE", source: "manual" },
  }), "create restriction");
  await expectOk(await request.post(`/api/admin/clients/${patient.id}/protocols`, {
    data: { mode: "create_personalized", title: "Protocolo P3 ativo", startedAt: "2026-08-01", createTasks: false },
  }), "create protocol");

  for (const [index, weight] of [69.8, 68.4].entries()) {
    await expectOk(await request.post(`/api/admin/clients/${patient.id}/evolutions`, {
      data: { measured_at: new Date(Date.UTC(2026, 6 + index, 18, 12, 0, 0)).toISOString(), weight, height: 168, waist_cm: 80 - index },
    }), "create evolution");
  }

  const previous = await startConsultationSession(request, patient.id);
  await expectOk(await request.post(`/api/admin/consultation-sessions/${previous.id}/complete`, {
    data: { clientId: patient.id },
  }), "complete previous consultation");

  const activeSeed = await createTemplatePlan(request, patient.id, "P3 active seed");
  await savePlan(request, patient.id, activeSeed, "active", "Plano P3 ativo");
  const draftSeed = await createTemplatePlan(request, patient.id, "P3 draft seed");
  await savePlan(request, patient.id, draftSeed, "draft", "Plano P3 rascunho");

  const current = await startConsultationSession(request, patient.id);
  return { ...patient, sessionId: current.id };
}

async function fillConsultationDraft(page: Page) {
  await page.getByRole("navigation", { name: "Etapas da consulta" }).getByRole("button", { name: /Mudanças$/ }).click();
  await page.getByLabel("Evolução desde a última consulta").fill("Evoluiu bem desde julho.");
  await page.getByLabel("Adesão").fill("Boa adesão ao plano, dificuldade no jantar.");
  await page.getByLabel("Sintomas e queixas").fill("Sem queixas gastrointestinais.");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("navigation", { name: "Etapas da consulta" }).getByRole("button", { name: /Recomendações$/ }).click();
  await page.getByLabel("Conduta").fill("Ajustar distribuição proteica.");
  await page.getByLabel("Metas").fill("Planejar lanches por 7 dias.");
}

test.describe("Patient Record P3 consultation workspace", () => {
  test("opens the consolidated consultation workspace", async ({ page, request }, testInfo) => {
    const patient = await seedCompleteWorkspacePatient(request);
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}/consulta?sessionId=${patient.sessionId}`);

    await expect(page.getByRole("heading", { level: 1, name: /Patient Consultation P3 Test/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Visão clínica" })).toBeVisible();
    await expect(page.getByText("Contexto do paciente")).toHaveCount(0);
    await screenshot(page, "P3-01-workspace-desktop-complete", testInfo.project.name, testInfo.retry);
  });

  test("shows golden patient context", async ({ page, request }, testInfo) => {
    const patient = await seedCompleteWorkspacePatient(request, { withSubmission: true });
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}/consulta?sessionId=${patient.sessionId}`);

    const context = page.getByLabel("Contexto do paciente");
    await expect(context.getByText("Reduzir gordura corporal")).toBeVisible();
    await expect(context.getByText("68,4 kg")).toBeVisible();
    await expect(context.getByText("-1,4 kg")).toBeVisible();
    await expect(context.getByText("Ativo v2")).toBeVisible();
    await expect(context.getByText("Rascunho v2 em andamento")).toBeVisible();
    await expect(context.getByText("Intolerância à lactose")).toBeVisible();
    await expect(context.getByText("Respondida em")).toBeVisible();
    await expect(context.getByText("Protocolo P3 ativo")).toBeVisible();
    await screenshot(page, "P3-03-patient-context", testInfo.project.name, testInfo.retry);
    await screenshot(page, "P3-04-pre-consultation-summary", testInfo.project.name, testInfo.retry);
  });

  test("saves and reloads exact consultation fields", async ({ page, request }, testInfo) => {
    const patient = await seedCompleteWorkspacePatient(request);
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}/consulta?sessionId=${patient.sessionId}`);
    await fillConsultationDraft(page);
    await expect(page.getByText("Alterações não salvas").first()).toBeVisible();
    await page.getByRole("button", { name: "Salvar" }).first().click();
    await expect(page.getByText("Salvo").first()).toBeVisible();
    await page.reload();

    await page.getByRole("navigation", { name: "Etapas da consulta" }).getByRole("button", { name: /Mudanças$/ }).click();
    await expect(page.getByLabel("Evolução desde a última consulta")).toHaveValue("Evoluiu bem desde julho.");
    await page.getByRole("navigation", { name: "Etapas da consulta" }).getByRole("button", { name: /Recomendações$/ }).click();
    await expect(page.getByLabel("Conduta")).toHaveValue("Ajustar distribuição proteica.");
    await expect(page.getByLabel("Metas")).toHaveValue("Planejar lanches por 7 dias.");
    await screenshot(page, "P3-02-consultation-editing", testInfo.project.name, testInfo.retry);
  });

  test("protects unsaved navigation", async ({ page, request }, testInfo) => {
    const patient = await seedCompleteWorkspacePatient(request);
    await suppressDailyBriefingPopup(page);
    await page.goto(`/dashboard/clients/${patient.id}/consulta?sessionId=${patient.sessionId}`);

    await page.getByRole("navigation", { name: "Etapas da consulta" }).getByRole("button", { name: /Recomendações$/ }).click();
    await page.getByLabel("Conduta").fill("Texto não salvo.");
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("alterações não salvas");
      await dialog.dismiss();
    });
    await page.getByRole("button", { name: "Abrir plano alimentar" }).click();

    await expect(page).toHaveURL(/consulta/);
    await expect(page.getByText("Alterações não salvas").first()).toBeVisible();
    await screenshot(page, "P3-10-error-unsaved-state", testInfo.project.name, testInfo.retry);
  });

  test("finalizes and syncs overview and timeline", async ({ page, request }) => {
    const patient = await seedCompleteWorkspacePatient(request);
    await suppressDailyBriefingPopup(page);
    await page.goto(`/dashboard/clients/${patient.id}/consulta?sessionId=${patient.sessionId}`);

    await page.getByRole("navigation", { name: "Etapas da consulta" }).getByRole("button", { name: /Mudanças$/ }).click();
    await page.getByLabel("Evolução desde a última consulta").fill("Fechamento da consulta P3.");
    await page.getByRole("button", { name: "Finalizar consulta" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Finalizar consulta" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Finalizar consulta" }).click();
    await expect(page.getByText("Consulta finalizada")).toBeVisible();

    await page.goto(`/dashboard/clients/${patient.id}`);
    await expect(page.getByTestId("patient-record-overview").getByText("Última consulta")).toBeVisible();
    await page.getByRole("tab", { name: "Evolução" }).click();
    await expect(page.getByTestId("patient-clinical-timeline").getByText(/Consulta/).first()).toBeVisible();
  });

  test("completed consultation is read-only and cannot be finalized again", async ({ page, request }, testInfo) => {
    const patient = await seedCompleteWorkspacePatient(request);
    await expectOk(await request.post(`/api/admin/consultation-sessions/${patient.sessionId}/complete`, {
      data: { clientId: patient.id },
    }), "complete current consultation");
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}/consulta?sessionId=${patient.sessionId}`);

    await expect(page.getByText("Consulta finalizada. Os dados ficam disponíveis apenas para leitura.")).toBeVisible();
    await page.getByRole("navigation", { name: "Etapas da consulta" }).getByRole("button", { name: /Recomendações$/ }).click();
    await expect(page.getByLabel("Conduta")).toBeDisabled();
    await expect(page.getByText("Modo histórico")).toBeVisible();
    await expect(page.getByRole("button", { name: "Finalizar consulta" })).toHaveCount(0);
    await screenshot(page, "P3-07-completed-consultation-read-only", testInfo.project.name, testInfo.retry);
  });

  test("cross-patient GET and mutation are scoped", async ({ request }) => {
    const patientA = await seedCompleteWorkspacePatient(request);
    const patientB = await createTestPatient(request, { name: "Patient Consultation P3 B" });
    const sessionB = await startConsultationSession(request, patientB.id);

    const getResponse = await request.get(`/api/admin/clients/${patientA.id}/consultation?sessionId=${sessionB.id}`);
    const patchResponse = await request.patch(`/api/admin/consultation-sessions/${sessionB.id}`, {
      data: {
        clientId: patientA.id,
        draft: {
          evolution: "x",
          adherence: "",
          symptoms: "",
          conduct: "",
          goals: "",
          observations: "",
        },
      },
    });
    const completeResponse = await request.post(`/api/admin/consultation-sessions/${sessionB.id}/complete`, {
      data: { clientId: patientA.id },
    });

    expect(getResponse.status()).toBe(404);
    expect(patchResponse.status()).toBe(404);
    expect(completeResponse.status()).toBe(404);
  });

  test("empty context avoids false zeroes", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request, { name: "Patient Consultation P3 Empty" });
    const session = await startConsultationSession(request, patient.id);
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}/consulta?sessionId=${session.id}`);

    const context = page.getByLabel("Contexto do paciente");
    await expect(context.getByText("Sem avaliação registrada")).toBeVisible();
    await expect(context.getByText("Nenhum plano ativo")).toBeVisible();
    await expect(context.getByText("Anamnese ainda não preenchida")).toBeVisible();
    await expect(page.getByText("0 kg")).toHaveCount(0);
    await screenshot(page, "P3-05-no-anthropometry", testInfo.project.name, testInfo.retry);
    await screenshot(page, "P3-06-no-meal-plan", testInfo.project.name, testInfo.retry);
  });

  test("invalid consultation id returns safe error", async ({ page, request }) => {
    const patient = await createTestPatient(request, { name: "Patient Consultation P3 Invalid" });
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}/consulta?sessionId=00000000-0000-4000-8000-000000000000`);

    await expect(page.getByText("Não foi possível carregar a consulta.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  });

  test("mobile baseline keeps a single column workspace", async ({ page, request }, testInfo) => {
    const patient = await seedCompleteWorkspacePatient(request);
    await suppressDailyBriefingPopup(page);
    await page.setViewportSize({ width: 390, height: 900 });

    await page.goto(`/dashboard/clients/${patient.id}/consulta?sessionId=${patient.sessionId}`);

    await expect(page.getByRole("heading", { level: 1, name: /Patient Consultation P3 Test/ })).toBeVisible();
    await page.getByRole("navigation", { name: "Etapas da consulta" }).getByRole("button", { name: /Mudanças$/ }).click();
    await expect(page.getByLabel("Evolução desde a última consulta")).toBeVisible();
    await screenshot(page, "P3-08-mobile-390", testInfo.project.name, testInfo.retry);
  });

  test("tablet baseline keeps context and form readable", async ({ page, request }, testInfo) => {
    const patient = await seedCompleteWorkspacePatient(request);
    await suppressDailyBriefingPopup(page);
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto(`/dashboard/clients/${patient.id}/consulta?sessionId=${patient.sessionId}`);

    await expect(page.getByRole("heading", { name: "Visão clínica" })).toBeVisible();
    await expect(page.getByText("Plano alimentar", { exact: true }).first()).toBeVisible();
    await screenshot(page, "P3-09-tablet", testInfo.project.name, testInfo.retry);
  });
});
