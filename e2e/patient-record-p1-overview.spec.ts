import { mkdirSync } from "node:fs";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestAppointment, createTestPatient, startConsultationSession } from "./helpers/test-data";

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
    items: Array<{
      food: string;
      quantity?: string | null;
      unit?: string | null;
      notes?: string | null;
      food_source?: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF" | null;
      food_ref_id?: string | null;
      canonical_food_id?: string | null;
      household_measure_id?: string | null;
      quantity_locked?: boolean | null;
      substitutions_locked?: boolean | null;
      slot_food_group?: string | null;
      slot_food_subgroup?: string | null;
      slot_nutritional_role?: string | null;
      template_slot_id?: string | null;
      slot_exchange_eligible?: boolean | null;
    }>;
  }>;
  weekly_slots: [];
  substitutions: [];
  supplements: [];
};

function item(food: string, quantity: string, foodRefId: string, role: string, group: string, subgroup: string) {
  return {
    food,
    quantity,
    unit: "g",
    notes: null,
    food_source: "TACO" as const,
    food_ref_id: foodRefId,
    canonical_food_id: null,
    household_measure_id: null,
    quantity_locked: false,
    substitutions_locked: false,
    slot_food_group: group,
    slot_food_subgroup: subgroup,
    slot_nutritional_role: role,
    template_slot_id: `p1-${role.toLowerCase()}`,
    slot_exchange_eligible: true,
  };
}

function controlledMeals(riceQuantity: "120" | "150" = "120") {
  return [
    {
      name: "Cafe da manha",
      meal_context: "BREAKFAST",
      suggested_time: "08:00",
      notes: null,
      source_recipe_id: null,
      items: [
        item("Pao de forma integral", "50", "52", "BREAKFAST_CARB", "GRAINS", "BREAD"),
        item("Ovo de galinha inteiro cozido", "100", "489", "PROTEIN", "PROTEINS", "EGGS"),
      ],
    },
    {
      name: "Almoco",
      meal_context: "LUNCH",
      suggested_time: "12:30",
      notes: null,
      source_recipe_id: null,
      items: [
        item("Arroz integral cozido", riceQuantity, "1", "MAIN_STARCH", "STARCHES", "RICE"),
        item("Feijao carioca cozido", "100", "561", "LEGUME", "LEGUMES", "BEANS"),
        item("Peito de frango grelhado", "120", "410", "MAIN_PROTEIN", "PROTEINS", "POULTRY"),
      ],
    },
  ];
}

async function expectOk(response: { ok(): boolean; status(): number; text(): Promise<string> }, label: string) {
  if (!response.ok()) throw new Error(`${label} falhou (${response.status()}): ${await response.text()}`);
}

async function createTemplatePlan(request: APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, {
    data: { targetGroup: "ADULTO_SAUDAVEL", title },
  });
  await expectOk(response, "createTemplatePlan");
  return response.json() as Promise<PlanResponse>;
}

async function savePlan(request: APIRequestContext, patientId: string, plan: PlanResponse, status: "draft" | "active", riceQuantity: "120" | "150", title: string) {
  const response = await request.put(`/api/admin/clients/${patientId}/meal-plans/${plan.id}`, {
    data: {
      title,
      status,
      notes: "Fixture P1 do prontuario.",
      meals: controlledMeals(riceQuantity),
      weekly_slots: [],
      substitutions: [],
      supplements: [],
      expectedVersion: plan.version,
    },
  });
  await expectOk(response, "savePlan");
  return response.json() as Promise<PlanResponse>;
}

async function seedCompletePatient(request: APIRequestContext) {
  const patient = await createTestPatient(request, { name: "Patient Record P1 Test" });
  const nutritionRecordResponse = await request.get(`/api/admin/clients/${patient.id}/nutrition-record`);
  await expectOk(nutritionRecordResponse, "load nutrition record");
  const nutritionRecord = (await nutritionRecordResponse.json()) as { version: number };
  await expectOk(await request.patch(`/api/admin/clients/${patient.id}/nutrition-record`, {
    data: { goals: "Emagrecimento", expectedVersion: nutritionRecord.version },
  }), "update nutrition record");
  await expectOk(await request.post(`/api/admin/clients/${patient.id}/nutrition-record/structured-restrictions`, {
    data: { type: "ALLERGY", normalizedCode: "MILK", label: "Alergia ao leite", severity: "severe", status: "ACTIVE", source: "manual" },
  }), "create structured restriction");

  await expectOk(await request.post(`/api/admin/clients/${patient.id}/protocols`, {
    data: { mode: "create_personalized", title: "Reeducação alimentar P1", startedAt: "2026-08-10", createTasks: false },
  }), "create personalized protocol");

  return seedPatientProgress(request, patient);
}

async function seedPatientProgress(request: APIRequestContext, patient: { id: string; name: string }) {
  for (const [index, weight] of [72.1, 70.0, 69.2, 68.4].entries()) {
    const measuredAt = new Date(Date.UTC(2026, 7, 1 + index * 5, 12, 0, 0)).toISOString();
    const response = await request.post(`/api/admin/clients/${patient.id}/evolutions`, {
      data: { measured_at: measuredAt, weight, height: 168, waist_cm: 78 - index, body_fat_percentage: 30 - index },
    });
    await expectOk(response, "create evolution");
  }

  await createTestAppointment(request, patient.id, { title: "Retorno P1", startsAt: "2026-09-02T12:00:00.000Z" });
  const session = await startConsultationSession(request, patient.id);
  await expectOk(await request.post(`/api/admin/consultation-sessions/${session.id}/complete`, { data: { clientId: patient.id } }), "complete consultation");

  const activeSeed = await createTemplatePlan(request, patient.id, "P1 active seed");
  await savePlan(request, patient.id, activeSeed, "active", "120", "Plano P1 ativo");
  const draftSeed = await createTemplatePlan(request, patient.id, "P1 draft seed");
  await savePlan(request, patient.id, draftSeed, "draft", "150", "Plano P1 rascunho");

  return patient;
}

async function seedArchivedPatient(request: APIRequestContext) {
  const patient = await createTestPatient(request, { name: "Patient Record P1 Archived" });
  await expectOk(await request.patch(`/api/admin/clients/${patient.id}`, {
    data: { status: "arquivado" },
  }), "archive patient");
  return patient;
}

async function screenshot(page: Page, name: string, projectName: string, retry: number) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}-${projectName}-r${retry}.png`, fullPage: true });
}

test.describe("Patient Record P1 overview", () => {
  test("open complete patient: shell, clinical cards, active/draft and restrictions", async ({ page, request }, testInfo) => {
    const patient = await seedCompletePatient(request);
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}`);

    await expect(page.getByRole("heading", { level: 1, name: "Patient Record P1 Test" })).toBeVisible();
    await expect(page.locator("header").getByText("Acompanhamento ativo")).toBeVisible();
    await expect(page.getByText(/Objetivo:\s*Emagrecimento/i)).toBeVisible();
    await expect(page.getByTestId("patient-record-overview")).toBeVisible();
    await expect(page.getByText("68,4 kg", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/0,?8 kg desde a última avaliação/i)).toBeVisible();
    await expect(page.getByText("Ativo · v2")).toBeVisible();
    await expect(page.getByText("Rascunho v2 em andamento")).toBeVisible();
    await expect(page.getByText("Alergia ao leite")).toBeVisible();
    await expect(page.getByText("Reeducação alimentar P1").first()).toBeVisible();
    await screenshot(page, "P1-01-patient-overview-complete-desktop", testInfo.project.name, testInfo.retry);
    await screenshot(page, "P1-03-active-draft-meal-plan", testInfo.project.name, testInfo.retry);
    await screenshot(page, "P1-04-restrictions-important-info", testInfo.project.name, testInfo.retry);
  });

  test("empty patient keeps useful empty states without zeros", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request, { name: "Patient Record P1 Empty" });
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}`);

    await expect(page.getByRole("heading", { level: 1, name: "Patient Record P1 Empty" })).toBeVisible();
    await expect(page.getByText("Nenhuma consulta registrada")).toBeVisible();
    await expect(page.getByText("Nenhuma avaliação registrada")).toBeVisible();
    await expect(page.getByText("Nenhum plano ativo")).toBeVisible();
    await expect(page.getByText("0 kg")).toHaveCount(0);
    await screenshot(page, "P1-02-patient-overview-empty-desktop", testInfo.project.name, testInfo.retry);
  });

  test("quick navigation opens current modules without creating parallel record", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("button", { name: "Nova avaliação" }).first().click();
    await expect(page.getByRole("heading", { name: /Antropometria e progresso/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Registrar primeira avaliação/i })).toBeVisible();

    await page.getByRole("tab", { name: "Resumo" }).click();
    await page.getByRole("button", { name: "Abrir plano" }).first().click();
    await expect(page.getByRole("button", { name: /criar por modelo/i })).toBeVisible();
  });

  test("mobile baseline keeps overview in one column", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request, { name: "Patient Record P1 Mobile" });
    await suppressDailyBriefingPopup(page);
    await page.setViewportSize({ width: 390, height: 900 });

    await page.goto(`/dashboard/clients/${patient.id}`);

    await expect(page.getByRole("heading", { level: 1, name: "Patient Record P1 Mobile" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Resumo" })).toBeVisible();
    await expect(page.getByTestId("patient-record-overview")).toBeVisible();
    await screenshot(page, "P1-07-mobile-390", testInfo.project.name, testInfo.retry);
  });

  test("archived patient shell disables clinical start actions", async ({ page, request }, testInfo) => {
    const patient = await seedArchivedPatient(request);
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}`);

    await expect(page.getByRole("heading", { level: 1, name: "Patient Record P1 Archived" })).toBeVisible();
    await expect(page.getByText("Arquivado")).toBeVisible();
    await expect(page.getByRole("button", { name: /Iniciar consulta/i }).first()).toBeDisabled();
    await expect(page.getByRole("button", { name: "Nova avaliação" }).first()).toBeDisabled();
    await screenshot(page, "P1-05-archived-patient-shell", testInfo.project.name, testInfo.retry);
  });

  test("tablet baseline keeps navigation and summary readable", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request, { name: "Patient Record P1 Tablet" });
    await suppressDailyBriefingPopup(page);
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto(`/dashboard/clients/${patient.id}`);

    await expect(page.getByRole("heading", { level: 1, name: "Patient Record P1 Tablet" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Resumo" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Mais" })).toBeVisible();
    await expect(page.getByTestId("patient-record-overview")).toBeVisible();
    await screenshot(page, "P1-06-tablet-768", testInfo.project.name, testInfo.retry);
  });

  test("record-summary is scoped to the requested patient id", async ({ request }) => {
    const patientA = await createTestPatient(request, { name: "Patient Record P1 A" });
    const patientB = await createTestPatient(request, { name: "Patient Record P1 B" });

    const responseA = await request.get(`/api/admin/clients/${patientA.id}/record-summary`);
    const responseB = await request.get(`/api/admin/clients/${patientB.id}/record-summary`);
    const missing = await request.get("/api/admin/clients/00000000-0000-4000-8000-000000000000/record-summary");

    expect(responseA.ok()).toBeTruthy();
    expect(responseB.ok()).toBeTruthy();
    expect(missing.status()).toBe(404);
    expect((await responseA.json()).patient.id).toBe(patientA.id);
    expect((await responseB.json()).patient.id).toBe(patientB.id);
  });
});
