import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient, enablePortalAccess } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

type FoodSource = "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF";

type PlanResponse = {
  id: string;
  version: number;
  title: string;
  status: "draft" | "active" | "archived";
  notes: string | null;
  target_group: string | null;
  meals: Array<{
    id?: string | null;
    name: string;
    meal_context?: string | null;
    suggested_time?: string | null;
    notes?: string | null;
    items: Array<{
      id?: string | null;
      food: string;
      quantity?: string | null;
      unit?: string | null;
      notes?: string | null;
      food_source?: FoodSource | null;
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

type ExchangeGroupsResponse = {
  groups: Array<{
    group: { id: string; primary_food_name: string; primary_food_source: string; primary_food_ref_id: string; primary_quantity_grams: number };
    alternatives: Array<{ id: string; food_name: string; state: "SUGGESTED" | "APPROVED" | "EDITED" | "REJECTED"; quantity_grams: number }>;
  }>;
};

const GOLDEN_ITEMS = [
  { food: "Pao de forma integral", quantity: "50", role: "BREAKFAST_CARB" },
  { food: "Ovo de galinha inteiro cozido", quantity: "100", role: "PROTEIN" },
  { food: "Banana prata", quantity: "80", role: "FRUIT" },
  { food: "Arroz integral cozido", quantity: "120", role: "MAIN_STARCH" },
  { food: "Feijao carioca cozido", quantity: "100", role: "LEGUME" },
  { food: "Peito de frango grelhado", quantity: "120", role: "MAIN_PROTEIN" },
  { food: "Brocolis cozido", quantity: "100", role: "VEGETABLE" },
  { food: "Batata doce cozida", quantity: "150", role: "MAIN_STARCH" },
  { food: "File de tilapia grelhado", quantity: "130", role: "MAIN_PROTEIN" },
  { food: "Abobrinha cozida", quantity: "120", role: "VEGETABLE" },
] as const;

const CONTROLLED_MEALS = [
  {
    name: "Cafe da manha",
    meal_context: "BREAKFAST",
    suggested_time: "08:00",
    notes: "Orientacao simples para o cafe.",
    items: [
      item("Pao de forma integral", "50", "52", "BREAKFAST_CARB", "GRAINS", "BREAD"),
      item("Ovo de galinha inteiro cozido", "100", "489", "PROTEIN", "PROTEINS", "EGGS"),
      item("Banana prata", "80", "182", "FRUIT", "FRUITS", "BANANA"),
    ],
  },
  {
    name: "Almoco",
    meal_context: "LUNCH",
    suggested_time: "12:30",
    notes: null,
    items: [
      item("Arroz integral cozido", "120", "1", "MAIN_STARCH", "STARCHES", "RICE"),
      item("Feijao carioca cozido", "100", "561", "LEGUME", "LEGUMES", "BEANS"),
      item("Peito de frango grelhado", "120", "410", "MAIN_PROTEIN", "PROTEINS", "POULTRY"),
      item("Brocolis cozido", "100", "100", "VEGETABLE", "VEGETABLES", "CRUCIFEROUS"),
    ],
  },
  {
    name: "Jantar",
    meal_context: "DINNER",
    suggested_time: "19:30",
    notes: null,
    items: [
      item("Batata doce cozida", "150", "88", "MAIN_STARCH", "STARCHES", "TUBERS"),
      item("File de tilapia grelhado", "130", "312", "MAIN_PROTEIN", "PROTEINS", "FISH"),
      item("Abobrinha cozida", "120", "86", "VEGETABLE", "VEGETABLES", "SQUASH"),
    ],
  },
] as const;

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
    template_slot_id: `r7-${role.toLowerCase()}`,
    slot_exchange_eligible: true,
  };
}

function controlledMeals(riceQuantity: "120" | "150" = "120") {
  return CONTROLLED_MEALS.map((meal) => ({
    ...meal,
    items: meal.items.map((row) => /Arroz integral/i.test(row.food) ? { ...row, quantity: riceQuantity } : row),
  }));
}

async function createTemplatePlan(request: APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, {
    data: { targetGroup: "ADULTO_SAUDAVEL", title },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<PlanResponse>;
}

async function savePlan(request: APIRequestContext, patientId: string, plan: PlanResponse, status: "draft" | "active", riceQuantity: "120" | "150", title: string) {
  const response = await request.put(`/api/admin/clients/${patientId}/meal-plans/${plan.id}`, {
    data: {
      title,
      status,
      notes: "Plano golden R7 aprovado para o paciente.",
      meals: controlledMeals(riceQuantity),
      weekly_slots: [],
      substitutions: [],
      supplements: [],
      expectedVersion: plan.version,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<PlanResponse>;
}

async function listPlans(request: APIRequestContext, patientId: string) {
  const response = await request.get(`/api/admin/clients/${patientId}/meal-plans`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<PlanResponse[]>;
}

async function generateGroup(request: APIRequestContext, patientId: string, plan: PlanResponse, food: RegExp, grams: number, limit = 5) {
  const primary = plan.meals.flatMap((meal) => meal.items).find((candidate) => food.test(candidate.food));
  expect(primary, `primary not found: ${food}`).toBeTruthy();
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans/exchange-groups`, {
    data: {
      mealPlanId: plan.id,
      primaryFoodSource: primary!.food_source,
      primaryFoodRefId: primary!.food_ref_id,
      primaryCanonicalFoodId: primary!.canonical_food_id ?? null,
      primaryQuantityGrams: grams,
      mealName: "Almoco",
      limit,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<ExchangeGroupsResponse["groups"][number]>;
}

async function getGroup(request: APIRequestContext, patientId: string, planId: string, food: RegExp) {
  const response = await request.get(`/api/admin/clients/${patientId}/meal-plans/exchange-groups?mealPlanId=${planId}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  const payload = await response.json() as ExchangeGroupsResponse;
  const group = payload.groups.find((entry) => food.test(entry.group.primary_food_name));
  expect(group, `group not found: ${food}`).toBeTruthy();
  return group!;
}

async function loginPortal(page: Page, email: string, code: string) {
  await page.goto("/portal");
  await page.getByPlaceholder("seunome@email.com").fill(email);
  await page.getByPlaceholder("BF-0000-0000").fill(code);
  await page.getByRole("button", { name: /acessar meu portal/i }).click();
  await expect(page.getByRole("button", { name: /^Sair$/i })).toBeVisible();
}

async function openMealPlanTab(page: Page, patientId: string) {
  await page.goto(`/dashboard/clients/${patientId}`);
  await page.getByRole("tab", { name: "Plano alimentar" }).click();
}

function expectQuantitiesInPayload(plan: PlanResponse, riceQuantity: "120" | "150") {
  const rows = plan.meals.flatMap((meal) => meal.items);
  for (const expected of GOLDEN_ITEMS) {
    const row = rows.find((candidate) => candidate.food === expected.food);
    expect(row, expected.food).toBeTruthy();
    expect(row!.quantity).toBe(expected.food === "Arroz integral cozido" ? riceQuantity : expected.quantity);
    expect(row!.unit).toBe("g");
    expect(row!.food_source).toBe("TACO");
    expect(row!.food_ref_id).toBeTruthy();
    expect(row!.slot_nutritional_role).toBe(expected.role);
  }
}

test.describe("R7 final meal plan QA", () => {
  test("golden plan: draft, review, publish, portal, print, exchanges and security", async ({ page, request }, testInfo) => {
    test.setTimeout(120_000);

    const patient = await createTestPatient(request);
    const otherPatient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);

    const activeSeed = await createTemplatePlan(request, patient.id, "R7 active seed");
    const active = await savePlan(request, patient.id, activeSeed, "active", "120", "R7 active golden 120");
    expectQuantitiesInPayload(active, "120");

    await openMealPlanTab(page, patient.id);
    await page.screenshot({ path: `reports/screenshots/meal-plan-r7-01-active-desktop-${testInfo.project.name}.png`, fullPage: true });
    await expect(page.getByRole("button", { name: /^Ativo - v2$/i })).toBeVisible();
    await expect(page.locator('input[aria-label="Quantidade"]')).toHaveCount(0);
    await page.getByRole("button", { name: /^Editar$/i }).click();
    await expect(page.getByRole("button", { name: /^Rascunho - v1$/i })).toBeVisible();
    await page.screenshot({ path: `reports/screenshots/meal-plan-r7-02-draft-desktop-${testInfo.project.name}.png`, fullPage: true });

    const draftSeed = await createTemplatePlan(request, patient.id, "R7 draft seed");
    const draft = await savePlan(request, patient.id, draftSeed, "draft", "150", "R7 draft golden 150");
    expectQuantitiesInPayload(draft, "150");

    await openMealPlanTab(page, patient.id);
    await page.getByRole("button", { name: /^Rascunho - v2$/i }).first().click();
    await expect(page.getByRole("button", { name: /^Rascunho - v2$/i }).first()).toBeVisible();
    await expect(async () => {
      const values = await page.locator('input[aria-label="Quantidade"]').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
      expect(values).toContain("150");
      expect(values).toContain("50");
      expect(values).toContain("130");
    }).toPass();
    await page.screenshot({ path: `reports/screenshots/meal-plan-r7-03-edit-item-${testInfo.project.name}.png`, fullPage: true });

    await page.getByRole("button", { name: /^Salvar rascunho$/i }).click();
    await expect(page.getByText(/^Plano alimentar salvo\.$/i)).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^Rascunho - v[23]$/i }).first().click();
    await expect(async () => {
      const values = await page.locator('input[aria-label="Quantidade"]').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
      expect(values).toContain("150");
    }).toPass();

    await loginPortal(page, patient.email, code);
    await expect(page.locator("#portal-meal-plan")).toHaveAttribute("data-version-id", `${active.id}:v${active.version}`);
    await expect(page.locator("#portal-meal-plan").getByText("120 g", { exact: true }).first()).toBeVisible();
    await expect(page.locator("#portal-meal-plan").getByText("150 g", { exact: true })).toHaveCount(1);
    await page.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar`);
    await expect(page.locator("[data-version-id]").first()).toHaveAttribute("data-version-id", `${active.id}:v${active.version}`);
    await expect(page.getByText("120 g", { exact: true }).first()).toBeVisible();
    await page.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar&planId=${draft.id}`);
    await expect(page.getByText(/Prévia do rascunho do plano alimentar/i)).toBeVisible();
    await expect(page.getByText("150 g", { exact: true }).first()).toBeVisible();

    await openMealPlanTab(page, patient.id);
    await page.getByRole("button", { name: /revisar trocas de Arroz integral cozido/i }).click();
    const drawer = page.getByRole("dialog", { name: /arroz integral cozido/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/farinha|mingau|cereal infantil|bolo|biscoito/i)).toHaveCount(0);
    await page.screenshot({ path: `reports/screenshots/meal-plan-r7-04-exchange-drawer-${testInfo.project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: /fechar trocas/i }).click();

    await openMealPlanTab(page, patient.id);
    await page.getByRole("button", { name: /^Rascunho - v[23]$/i }).first().click();
    await page.getByRole("button", { name: /^Revisar$/i }).click();
    await expect(page.getByRole("dialog", { name: /revisão do plano/i })).toBeVisible();
    await expect(page.getByText("Plano pronto para publicação.")).toBeVisible();
    await expect(page.getByText(/Problemas que impedem publicação/i)).toHaveCount(0);
    await page.screenshot({ path: `reports/screenshots/meal-plan-r7-05-review-all-good-${testInfo.project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: /Publicar plano/i }).click();
    await expect(page.getByText(/^Plano ativado no portal do cliente\.$/i)).toBeVisible();

    const publishedPlans = await listPlans(request, patient.id);
    const published = publishedPlans.find((plan) => plan.id === draft.id);
    expect(published).toBeTruthy();
    expect(published!.status).toBe("active");
    expect(publishedPlans.find((plan) => plan.id === active.id)?.status).toBe("archived");

    await page.goto("/portal");
    await expect(page.locator("#portal-meal-plan")).toHaveAttribute("data-version-id", `${draft.id}:v${published!.version}`);
    await expect(page.locator("#portal-meal-plan").getByText("150 g", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: `reports/screenshots/meal-plan-r7-08-portal-desktop-${testInfo.project.name}.png`, fullPage: true });
    for (const width of [375, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/portal");
      await expect(page.locator("#portal-meal-plan")).toBeVisible();
      await page.screenshot({ path: `reports/screenshots/meal-plan-r7-07-portal-mobile-${width}-${testInfo.project.name}.png`, fullPage: true });
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar`);
    await expect(page.locator("[data-version-id]").first()).toHaveAttribute("data-version-id", `${draft.id}:v${published!.version}`);
    await expect(page.getByText("150 g", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/canonical|resolver|curated|engine|score|APPROVED|SUGGESTED|stale|stack|error code/i)).toHaveCount(0);
    await page.screenshot({ path: `reports/screenshots/meal-plan-r7-09-print-a4-${testInfo.project.name}.png`, fullPage: true });

    const current = published!;
    const riceGroup = await generateGroup(request, patient.id, current, /Arroz integral/i, 150, 5);
    const suggested = riceGroup.alternatives.filter((alt) => alt.state === "SUGGESTED");
    expect(suggested.length).toBeGreaterThanOrEqual(4);
    await request.patch(`/api/admin/clients/${patient.id}/meal-plans/exchange-groups/${riceGroup.group.id}`, {
      data: { action: "approve", alternativeIds: suggested.slice(0, 3).map((alt) => alt.id) },
    });
    await request.patch(`/api/admin/clients/${patient.id}/meal-plans/exchange-groups/${riceGroup.group.id}`, {
      data: { action: "reject", alternativeId: suggested[3].id },
    });
    const search = await request.get(`/api/admin/foods/search?q=${encodeURIComponent("mandioca")}&limit=5`);
    expect(search.ok(), await search.text()).toBeTruthy();
    const manualRef = ((await search.json()) as { items: Array<{ ref?: { source: FoodSource; sourceId: string; canonicalId?: string | null } }> }).items.find((entry) => entry.ref)?.ref;
    expect(manualRef).toBeTruthy();
    const manual = await request.patch(`/api/admin/clients/${patient.id}/meal-plans/exchange-groups/${riceGroup.group.id}`, {
      data: { action: "add_manual", source: manualRef!.source, sourceId: manualRef!.sourceId, canonicalId: manualRef!.canonicalId ?? null },
    });
    expect(manual.ok(), await manual.text()).toBeTruthy();
    const withManual = await manual.json() as ExchangeGroupsResponse["groups"][number];
    const manualAlt = withManual.alternatives.find((alt) => /mandioca/i.test(alt.food_name) && alt.state === "SUGGESTED");
    expect(manualAlt).toBeTruthy();
    const approveManual = await request.patch(`/api/admin/clients/${patient.id}/meal-plans/exchange-groups/${riceGroup.group.id}`, {
      data: { action: "approve", alternativeIds: [manualAlt!.id] },
    });
    expect(approveManual.ok(), await approveManual.text()).toBeTruthy();

    await page.goto("/portal");
    const portalPlan = page.locator("#portal-meal-plan");
    await expect(portalPlan.getByText("Trocas disponíveis")).toBeVisible();
    await expect(portalPlan.getByText(suggested[3].food_name)).toHaveCount(0);
    await expect(portalPlan.getByText(/SUGGESTED|REJECTED|APPROVED|curated|engine|score|stale|resolver|canonical/i)).toHaveCount(0);
    await page.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar`);
    await expect(page.getByText(suggested[3].food_name)).toHaveCount(0);
    await page.screenshot({ path: `reports/screenshots/meal-plan-r7-10-multi-page-print-${testInfo.project.name}.png`, fullPage: true });

    const staleSeed = await createTemplatePlan(request, patient.id, "R7 stale seed");
    const staleDraft = await savePlan(request, patient.id, staleSeed, "draft", "120", "R7 stale draft");
    const staleGroup = await generateGroup(request, patient.id, staleDraft, /Arroz integral/i, 120, 5);
    const staleFirst = staleGroup.alternatives.find((alt) => alt.state === "SUGGESTED");
    expect(staleFirst).toBeTruthy();
    await request.patch(`/api/admin/clients/${patient.id}/meal-plans/exchange-groups/${staleGroup.group.id}`, {
      data: { action: "approve", alternativeIds: [staleFirst!.id] },
    });
    const staleChanged = await savePlan(request, patient.id, staleDraft, "draft", "150", "R7 stale changed");
    const staleReview = await request.get(`/api/admin/clients/${patient.id}/meal-plans/${staleChanged.id}/publication-review`);
    expect(staleReview.ok(), await staleReview.text()).toBeTruthy();
    const staleBody = await staleReview.json() as { valid: boolean; blockers: Array<{ code: string }> };
    expect(staleBody.valid).toBe(false);
    expect(staleBody.blockers.map((blocker) => blocker.code)).toContain("STALE_APPROVED_EXCHANGE");

    const unresolvedSeed = await createTemplatePlan(request, patient.id, "R7 unresolved seed");
    const unresolved = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${unresolvedSeed.id}`, {
      data: {
        title: "R7 unresolved",
        status: "draft",
        notes: null,
        meals: controlledMeals("120").map((meal) => ({
          ...meal,
          items: meal.items.map((row) => /Pao de forma/i.test(row.food) ? { ...row, food_source: null, food_ref_id: null } : row),
        })),
        weekly_slots: [],
        substitutions: [],
        supplements: [],
        expectedVersion: unresolvedSeed.version,
      },
    });
    expect(unresolved.ok(), await unresolved.text()).toBeTruthy();
    await openMealPlanTab(page, patient.id);
    await page.getByRole("button", { name: /^Rascunho - v2$/i }).first().click();
    await page.getByRole("button", { name: /^Revisar$/i }).click();
    await expect(page.getByText("Este plano ainda não pode ser publicado.")).toBeVisible();
    await expect(page.getByText(/confirme o alimento/i)).toBeVisible();
    await page.screenshot({ path: `reports/screenshots/meal-plan-r7-06-review-blocker-${testInfo.project.name}.png`, fullPage: true });

    const otherPlan = await createTemplatePlan(request, otherPatient.id, "R7 other plan");
    const otherGroup = await generateGroup(request, otherPatient.id, otherPlan, /Arroz integral/i, 120, 5);
    const crossList = await request.get(`/api/admin/clients/${patient.id}/meal-plans/exchange-groups?mealPlanId=${otherPlan.id}`);
    expect(crossList.status()).toBe(404);
    const crossGenerate = await request.post(`/api/admin/clients/${patient.id}/meal-plans/exchange-groups`, {
      data: {
        mealPlanId: otherPlan.id,
        primaryFoodSource: "TACO",
        primaryFoodRefId: "1",
        primaryQuantityGrams: 120,
        mealName: "Almoco",
      },
    });
    expect(crossGenerate.status()).toBe(404);
    const crossPatch = await request.patch(`/api/admin/clients/${patient.id}/meal-plans/exchange-groups/${otherGroup.group.id}`, {
      data: { action: "approve", alternativeIds: otherGroup.alternatives.slice(0, 1).map((alt) => alt.id) },
    });
    expect(crossPatch.status()).toBe(404);
  });
});
