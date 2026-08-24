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

async function expectOk(response: { ok(): boolean; status(): number; text(): Promise<string> }, label: string) {
  if (!response.ok()) throw new Error(`${label} falhou (${response.status()}): ${await response.text()}`);
}

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
    template_slot_id: `p2-${role.toLowerCase()}`,
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
        item("Peito de frango grelhado", "120", "410", "MAIN_PROTEIN", "PROTEINS", "POULTRY"),
      ],
    },
  ];
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
      notes: "Fixture P2 da timeline.",
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

async function seedTimelinePatient(request: APIRequestContext) {
  const patient = await createTestPatient(request, { name: "Patient Record Timeline Test" });

  for (const [index, weight] of [71.3, 69.7, 68.4].entries()) {
    const measuredAt = new Date(Date.UTC(2026, 5 + index, index === 0 ? 1 : index === 1 ? 20 : 18, 12, 0, 0)).toISOString();
    await expectOk(await request.post(`/api/admin/clients/${patient.id}/evolutions`, {
      data: { measured_at: measuredAt, weight, height: 168, waist_cm: 82 - index },
    }), "create evolution");
  }

  await createTestAppointment(request, patient.id, { title: "Retorno futuro P2", startsAt: "2026-09-02T12:00:00.000Z" });
  const session = await startConsultationSession(request, patient.id);
  await expectOk(await request.post(`/api/admin/consultation-sessions/${session.id}/complete`, { data: { clientId: patient.id } }), "complete consultation");

  const firstPlan = await createTemplatePlan(request, patient.id, "P2 plan seed v2");
  await savePlan(request, patient.id, firstPlan, "active", "120", "Plano P2 v2");
  const secondPlan = await createTemplatePlan(request, patient.id, "P2 plan seed v3");
  await savePlan(request, patient.id, secondPlan, "active", "150", "Plano P2 v3");

  await expectOk(await request.post(`/api/admin/clients/${patient.id}/protocols`, {
    data: { mode: "create_personalized", title: "Protocolo Timeline P2", startedAt: "2026-07-01", createTasks: false },
  }), "create protocol");

  return patient;
}

async function screenshot(page: Page, name: string, projectName: string, retry: number) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}-${projectName}-r${retry}.png`, fullPage: true });
}

test.describe("Patient Record P2 clinical timeline", () => {
  test("recent events in overview are canonical and limited", async ({ page, request }, testInfo) => {
    const patient = await seedTimelinePatient(request);
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}`);

    await expect(page.getByText("Atividade clínica recente")).toBeVisible();
    await expect(page.getByText("Plano alimentar publicado").first()).toBeVisible();
    await expect(page.getByText("Retorno futuro P2")).toHaveCount(1);
    await expect(page.locator('ul[aria-label="Atividade clinica recente"] > li')).toHaveCount(5);
    await screenshot(page, "P2-01-recent-activity-overview", testInfo.project.name, testInfo.retry);
  });

  test("full timeline renders clinical history and excludes future appointment", async ({ page, request }, testInfo) => {
    const patient = await seedTimelinePatient(request);
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Evolução" }).click();

    await expect(page.getByTestId("patient-clinical-timeline")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Timeline clínica" })).toBeVisible();
    await expect(page.getByText("Plano alimentar publicado").first()).toBeVisible();
    await expect(page.getByText(/Consulta/).first()).toBeVisible();
    await expect(page.getByText("Avaliacao antropometrica").first()).toBeVisible();
    await expect(page.getByTestId("patient-clinical-timeline").getByText("Retorno futuro P2")).toHaveCount(0);
    await screenshot(page, "P2-02-full-timeline-desktop", testInfo.project.name, testInfo.retry);
    await screenshot(page, "P2-04-same-day-events", testInfo.project.name, testInfo.retry);
  });

  test("filters show only meal plan publication events", async ({ page, request }, testInfo) => {
    const patient = await seedTimelinePatient(request);
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}?tab=evolucao`);
    await page.getByRole("button", { name: "Planos" }).click();

    const timeline = page.getByTestId("patient-clinical-timeline");
    await expect(timeline.getByText("Plano alimentar publicado")).toHaveCount(2);
    await expect(timeline.getByText("Avaliacao antropometrica")).toHaveCount(0);
    await expect(timeline.getByText(/Consulta de/)).toHaveCount(0);
    await screenshot(page, "P2-03-timeline-filters", testInfo.project.name, testInfo.retry);
  });

  test("event action opens the corresponding plan module", async ({ page, request }) => {
    const patient = await seedTimelinePatient(request);
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}?tab=evolucao`);
    await page.getByTestId("patient-clinical-timeline").getByRole("link", { name: "Abrir plano" }).first().click();

    await expect(page).toHaveURL(/tab=plano-alimentar/);
  });

  test("empty timeline has clinical empty state", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request, { name: "Patient Record Timeline Empty" });
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}?tab=evolucao`);

    await expect(page.getByText("Ainda não há eventos clínicos registrados.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Iniciar consulta" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar avaliação" }).first()).toBeVisible();
    await screenshot(page, "P2-05-empty-timeline", testInfo.project.name, testInfo.retry);
  });

  test("mobile baseline keeps a vertical timeline", async ({ page, request }, testInfo) => {
    const patient = await seedTimelinePatient(request);
    await suppressDailyBriefingPopup(page);
    await page.setViewportSize({ width: 390, height: 900 });

    await page.goto(`/dashboard/clients/${patient.id}?tab=evolucao`);

    await expect(page.getByTestId("patient-clinical-timeline")).toBeVisible();
    await expect(page.getByRole("button", { name: "Planos" })).toBeVisible();
    await screenshot(page, "P2-06-mobile-390", testInfo.project.name, testInfo.retry);
  });

  test("tablet baseline keeps filters and event list readable", async ({ page, request }, testInfo) => {
    const patient = await seedTimelinePatient(request);
    await suppressDailyBriefingPopup(page);
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto(`/dashboard/clients/${patient.id}?tab=evolucao`);

    await expect(page.getByTestId("patient-clinical-timeline")).toBeVisible();
    await expect(page.getByRole("button", { name: "Consultas" })).toBeVisible();
    await screenshot(page, "P2-07-tablet", testInfo.project.name, testInfo.retry);
  });

  test("timeline error state is recoverable", async ({ page, request }, testInfo) => {
    const patient = await seedTimelinePatient(request);
    await suppressDailyBriefingPopup(page);
    await page.route(`**/api/admin/clients/${patient.id}/record-timeline?**`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "forced timeline error" }),
      });
    });

    await page.goto(`/dashboard/clients/${patient.id}?tab=evolucao`);

    await expect(page.getByText("Não foi possível carregar o histórico.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
    await screenshot(page, "P2-08-error-loading", testInfo.project.name, testInfo.retry);
  });

  test("record-timeline is scoped to the requested patient id", async ({ request }) => {
    const patientA = await seedTimelinePatient(request);
    const patientB = await createTestPatient(request, { name: "Patient Record Timeline B" });
    await expectOk(await request.post(`/api/admin/clients/${patientB.id}/evolutions`, {
      data: { measured_at: "2026-08-01T12:00:00.000Z", weight: 80, height: 170 },
    }), "create patient B evolution");

    const responseA = await request.get(`/api/admin/clients/${patientA.id}/record-timeline?limit=20`);
    const responseB = await request.get(`/api/admin/clients/${patientB.id}/record-timeline?limit=20`);
    const missing = await request.get("/api/admin/clients/00000000-0000-4000-8000-000000000000/record-timeline");

    expect(responseA.ok()).toBeTruthy();
    expect(responseB.ok()).toBeTruthy();
    expect(missing.status()).toBe(404);
    expect((await responseA.json()).events.every((event: { patientId: string }) => event.patientId === patientA.id)).toBe(true);
    expect((await responseB.json()).events.every((event: { patientId: string }) => event.patientId === patientB.id)).toBe(true);
  });
});
