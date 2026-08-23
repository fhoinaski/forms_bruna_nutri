import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient, enablePortalAccess } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

type PlanResponse = {
  id: string;
  version: number;
  title: string;
  status: "draft" | "active";
  meals: Array<{
    name: string;
    suggested_time?: string | null;
    notes?: string | null;
    items: Array<{
      food: string;
      quantity?: string | null;
      unit?: string | null;
      food_source?: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF" | null;
      food_ref_id?: string | null;
      canonical_food_id?: string | null;
    }>;
  }>;
  substitutions: [];
  supplements: [];
};

const GOLDEN_MEALS = [
  {
    name: "Cafe da manha",
    suggested_time: "08:00",
    notes: "Mastigar devagar e beber agua ao longo da manha.",
    items: [
      { food: "Pao de forma integral", quantity: "50", unit: "g", food_source: "TACO", food_ref_id: "52" },
      { food: "Ovo de galinha inteiro cozido", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "489" },
      { food: "Banana prata", quantity: "80", unit: "g", food_source: "TACO", food_ref_id: "182" },
    ],
  },
  {
    name: "Almoco",
    suggested_time: "12:30",
    notes: null,
    items: [
      { food: "Arroz integral cozido", quantity: "120", unit: "g", food_source: "TACO", food_ref_id: "1" },
      { food: "Feijao carioca cozido", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "561" },
      { food: "Peito de frango grelhado", quantity: "120", unit: "g", food_source: "TACO", food_ref_id: "410" },
      { food: "Brocolis cozido", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "100" },
    ],
  },
  {
    name: "Jantar",
    suggested_time: "19:30",
    notes: null,
    items: [
      { food: "Batata doce cozida", quantity: "150", unit: "g", food_source: "TACO", food_ref_id: "88" },
      { food: "File de tilapia grelhado", quantity: "130", unit: "g", food_source: "TACO", food_ref_id: "312" },
      { food: "Abobrinha cozida", quantity: "120", unit: "g", food_source: "TACO", food_ref_id: "86" },
    ],
  },
] as const;

async function createTemplatePlan(request: APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, {
    data: { targetGroup: "ADULTO_SAUDAVEL", title },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<PlanResponse>;
}

async function saveGoldenPlan(request: APIRequestContext, patientId: string, plan: PlanResponse, status: "draft" | "active", riceQuantity = "120") {
  const meals = GOLDEN_MEALS.map((meal) => ({
    ...meal,
    items: meal.items.map((item) => /Arroz integral/i.test(item.food) ? { ...item, quantity: riceQuantity } : item),
  }));
  const response = await request.put(`/api/admin/clients/${patientId}/meal-plans/${plan.id}`, {
    data: {
      title: status === "active" ? "Plano alimentar R5 ativo" : "Plano alimentar R5 rascunho",
      status,
      notes: "Orientacoes do plano ativo para o paciente.",
      meals,
      weekly_slots: [],
      substitutions: [],
      supplements: [],
      expectedVersion: plan.version,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<PlanResponse>;
}

async function exchangeGroupFor(request: APIRequestContext, patientId: string, planId: string, food: RegExp) {
  const groupsResponse = await request.get(`/api/admin/clients/${patientId}/meal-plans/exchange-groups?mealPlanId=${planId}`);
  expect(groupsResponse.ok(), await groupsResponse.text()).toBeTruthy();
  const groups = await groupsResponse.json() as {
    groups: Array<{
      group: { id: string; primary_food_name: string };
      alternatives: Array<{ id: string; food_name: string; state: "SUGGESTED" | "APPROVED" | "REJECTED"; quantity_grams: number }>;
    }>;
  };
  const group = groups.groups.find((entry) => food.test(entry.group.primary_food_name));
  expect(group, `grupo nao encontrado para ${food}`).toBeTruthy();
  return group!;
}

async function generateAndApproveRiceExchange(request: APIRequestContext, patientId: string, plan: PlanResponse) {
  const rice = plan.meals.flatMap((meal) => meal.items).find((item) => /Arroz integral/i.test(item.food));
  expect(rice).toBeTruthy();
  const generate = await request.post(`/api/admin/clients/${patientId}/meal-plans/exchange-groups`, {
    data: {
      mealPlanId: plan.id,
      primaryFoodSource: rice!.food_source,
      primaryFoodRefId: rice!.food_ref_id,
      primaryCanonicalFoodId: rice!.canonical_food_id ?? null,
      primaryQuantityGrams: 120,
      mealName: "Almoco",
      limit: 5,
    },
  });
  expect(generate.ok(), await generate.text()).toBeTruthy();
  const group = await generate.json() as Awaited<ReturnType<typeof exchangeGroupFor>>;
  const suggested = group.alternatives.filter((alt) => alt.state === "SUGGESTED");
  expect(suggested.length).toBeGreaterThanOrEqual(2);
  const approve = await request.patch(`/api/admin/clients/${patientId}/meal-plans/exchange-groups/${group.group.id}`, {
    data: { action: "approve", alternativeIds: [suggested[0].id] },
  });
  expect(approve.ok(), await approve.text()).toBeTruthy();
  const reject = await request.patch(`/api/admin/clients/${patientId}/meal-plans/exchange-groups/${group.group.id}`, {
    data: { action: "reject", alternativeId: suggested[1].id },
  });
  expect(reject.ok(), await reject.text()).toBeTruthy();
  return { approvedName: suggested[0].food_name, rejectedName: suggested[1].food_name };
}

async function loginPatient(page: import("@playwright/test").Page, email: string, code: string) {
  await page.goto("/portal");
  if (await page.getByText(/ola,/i).isVisible().catch(() => false)) return;
  await page.getByPlaceholder("seunome@email.com").fill(email);
  await page.getByPlaceholder("BF-0000-0000").fill(code);
  await page.getByRole("button", { name: /acessar meu portal/i }).click();
  await expect(page.getByText(/ola,/i)).toBeVisible();
}

function friendlyFoodName(technicalName: string) {
  const parts = technicalName.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.join(" ") : technicalName.trim();
}

test.describe("R5 active plan delivery", () => {
  test("portal e print entregam o mesmo active plan, com quantidades exatas e trocas aprovadas", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);
    const draft = await createTemplatePlan(request, patient.id, "R5 golden");
    const active = await saveGoldenPlan(request, patient.id, draft, "active");
    const exchange = await generateAndApproveRiceExchange(request, patient.id, active);

    await loginPatient(page, patient.email, code);
    await page.setViewportSize(testInfo.project.name.includes("mobile") ? { width: 390, height: 900 } : { width: 1280, height: 900 });
    const portalPlan = page.locator("#portal-meal-plan");
    await expect(portalPlan).toBeVisible();
    await expect(portalPlan).toHaveAttribute("data-version-id", `${active.id}:v${active.version}`);
    await expect(portalPlan).toHaveAttribute("data-active-version-id", `${active.id}:v${active.version}`);
    for (const quantity of ["50 g", "100 g", "80 g", "120 g", "150 g", "130 g"]) {
      await expect(portalPlan.getByText(quantity, { exact: true }).first()).toBeVisible();
    }
    await expect(portalPlan.getByText("Trocas disponíveis")).toBeVisible();
    await expect(portalPlan.getByText(friendlyFoodName(exchange.approvedName))).toBeVisible();
    await expect(portalPlan.getByText(friendlyFoodName(exchange.rejectedName))).toHaveCount(0);
    await expect(portalPlan.getByText(/SUGGESTED|REJECTED|exchange group|curated|engine|canonical|score|stale|resolver/i)).toHaveCount(0);
    await page.screenshot({ path: `reports/screenshots/meal-plan-r5-portal-${testInfo.project.name}.png`, fullPage: true });

    await page.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar`);
    const printPlan = page.locator("[data-version-id]").first();
    await expect(printPlan).toHaveAttribute("data-version-id", `${active.id}:v${active.version}`);
    await expect(page.getByText(/Plano alimentar ativo/i)).toBeVisible();
    for (const quantity of ["50 g", "100 g", "80 g", "120 g", "150 g", "130 g"]) {
      await expect(page.getByText(quantity, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(friendlyFoodName(exchange.approvedName))).toBeVisible();
    await expect(page.getByText(friendlyFoodName(exchange.rejectedName))).toHaveCount(0);
    await page.screenshot({ path: `reports/screenshots/meal-plan-r5-print-page1-${testInfo.project.name}.png`, fullPage: true });
  });

  test("draft não vaza antes da publicação e passa a ser entregue depois de publicar", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);
    const baseDraft = await createTemplatePlan(request, patient.id, "R5 active isolation");
    const active = await saveGoldenPlan(request, patient.id, baseDraft, "active", "120");
    const newDraft = await createTemplatePlan(request, patient.id, "R5 draft isolation");
    const draft = await saveGoldenPlan(request, patient.id, newDraft, "draft", "150");

    await loginPatient(page, patient.email, code);
    await expect(page.locator("#portal-meal-plan")).toHaveAttribute("data-version-id", `${active.id}:v${active.version}`);
    await expect(page.locator("#portal-meal-plan").getByText("120 g", { exact: true }).first()).toBeVisible();
    await expect(page.locator("#portal-meal-plan").getByText("150 g", { exact: true })).toHaveCount(1);
    await page.screenshot({ path: `reports/screenshots/meal-plan-r5-draft-vs-active-${testInfo.project.name}.png`, fullPage: true });

    await page.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar&planId=${draft.id}`);
    await expect(page.getByText(/Prévia do rascunho do plano alimentar/i)).toBeVisible();
    await expect(page.getByText("150 g", { exact: true }).first()).toBeVisible();

    const publish = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${draft.id}`, {
      data: {
        title: "Plano alimentar R5 publicado",
        status: "active",
        notes: "Orientacoes do plano ativo para o paciente.",
        meals: GOLDEN_MEALS.map((meal) => ({
          ...meal,
          items: meal.items.map((item) => /Arroz integral/i.test(item.food) ? { ...item, quantity: "150" } : item),
        })),
        weekly_slots: [],
        substitutions: [],
        supplements: [],
        expectedVersion: draft.version,
      },
    });
    expect(publish.ok(), await publish.text()).toBeTruthy();
    const published = await publish.json() as PlanResponse;

    const portalAfterPublish = await page.request.get("/api/portal/me");
    expect(portalAfterPublish.ok(), await portalAfterPublish.text()).toBeTruthy();
    const portalPayload = await portalAfterPublish.json() as { mealPlan: { id: string; version: number; versionId: string; meals: Array<{ items: Array<{ food: string; quantity: string | null; unit: string | null }> }> } };
    expect(portalPayload.mealPlan.id).toBe(published.id);
    expect(portalPayload.mealPlan.versionId).toBe(`${published.id}:v${published.version}`);
    expect(portalPayload.mealPlan.meals.flatMap((meal) => meal.items).filter((item) => item.quantity === "150" && item.unit === "g")).toHaveLength(2);
  });

  test("sem plano ativo mostra estado vazio no portal", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);
    await loginPatient(page, patient.email, code);
    await expect(page.getByText("Seu plano alimentar ainda não foi publicado.")).toBeVisible();
    await page.screenshot({ path: `reports/screenshots/meal-plan-r5-no-active-${testInfo.project.name}.png`, fullPage: true });
  });
});
