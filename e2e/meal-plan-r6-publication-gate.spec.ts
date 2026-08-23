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
  target_group: string | null;
  notes: string | null;
  meals: Array<{
    name: string;
    suggested_time?: string | null;
    notes?: string | null;
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

async function createTemplatePlan(request: APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, {
    data: { targetGroup: "ADULTO_SAUDAVEL", title },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<PlanResponse>;
}

function itemForSave(item: PlanResponse["meals"][number]["items"][number]) {
  return {
    food: item.food,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    notes: item.notes ?? null,
    food_source: item.food_source ?? null,
    food_ref_id: item.food_ref_id ?? null,
    canonical_food_id: item.canonical_food_id ?? null,
    household_measure_id: item.household_measure_id ?? null,
    quantity_locked: item.quantity_locked ?? false,
    substitutions_locked: item.substitutions_locked ?? false,
    slot_food_group: item.slot_food_group ?? null,
    slot_food_subgroup: item.slot_food_subgroup ?? null,
    slot_nutritional_role: item.slot_nutritional_role ?? null,
    template_slot_id: item.template_slot_id ?? null,
    slot_exchange_eligible: item.slot_exchange_eligible ?? null,
  };
}

function savePayload(plan: PlanResponse, status: "draft" | "active", patch?: (item: ReturnType<typeof itemForSave>) => ReturnType<typeof itemForSave>, extra: Record<string, unknown> = {}) {
  return {
    title: plan.title,
    status,
    notes: plan.notes,
    meals: plan.meals.map((meal) => ({
      name: meal.name,
      suggested_time: meal.suggested_time ?? null,
      notes: meal.notes ?? null,
      items: meal.items.map((item) => {
        const clean = itemForSave(item);
        return patch ? patch(clean) : clean;
      }),
    })),
    weekly_slots: [],
    substitutions: [],
    supplements: [],
    expectedVersion: plan.version,
    ...extra,
  };
}

async function openReview(page: import("@playwright/test").Page, patientId: string) {
  await page.goto(`/dashboard/clients/${patientId}`);
  await page.getByRole("tab", { name: "Plano alimentar" }).click();
  await page.getByRole("button", { name: /^Revisar$/i }).click();
}

async function ensureRiceStaleExchange(request: APIRequestContext, patientId: string, plan: PlanResponse) {
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
  const group = await generate.json() as { group: { id: string }; alternatives: Array<{ id: string; state: string }> };
  const suggested = group.alternatives.find((item) => item.state === "SUGGESTED");
  expect(suggested).toBeTruthy();
  const approve = await request.patch(`/api/admin/clients/${patientId}/meal-plans/exchange-groups/${group.group.id}`, {
    data: { action: "approve", alternativeIds: [suggested!.id] },
  });
  expect(approve.ok(), await approve.text()).toBeTruthy();
  const staleSave = await request.put(`/api/admin/clients/${patientId}/meal-plans/${plan.id}`, {
    data: savePayload(plan, "draft", (item) => /Arroz integral/i.test(item.food) ? { ...item, quantity: "150" } : item),
  });
  expect(staleSave.ok(), await staleSave.text()).toBeTruthy();
}

test.describe("R6 publication gate", () => {
  test("review all-good publica e portal passa a receber o novo active", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);
    await page.goto("/portal");
    await page.getByPlaceholder("seunome@email.com").fill(patient.email);
    await page.getByPlaceholder("BF-0000-0000").fill(code);
    await page.getByRole("button", { name: /acessar meu portal/i }).click();
    await expect(page.getByText("Seu plano alimentar ainda não foi publicado.")).toBeVisible();

    const plan = await createTemplatePlan(request, patient.id, "R6 all good");
    await openReview(page, patient.id);
    await expect(page.getByRole("dialog", { name: /revisão do plano/i })).toBeVisible();
    await expect(page.getByText("Plano pronto para publicação.")).toBeVisible();
    await page.screenshot({ path: `reports/screenshots/meal-plan-r6-review-all-good-${testInfo.project.name}-r${testInfo.retry}.png`, fullPage: true });
    await page.getByRole("button", { name: /Publicar plano/i }).click();
    await expect(page.getByRole("button", { name: /^Ativo - v2$/i })).toBeVisible();
    await page.screenshot({ path: `reports/screenshots/meal-plan-r6-successful-publish-${testInfo.project.name}-r${testInfo.retry}.png`, fullPage: true });

    await page.goto("/portal");
    await expect(page.locator("#portal-meal-plan")).toHaveAttribute("data-version-id", `${plan.id}:v2`);
    await page.screenshot({ path: `reports/screenshots/meal-plan-r6-active-after-publish-${testInfo.project.name}-r${testInfo.retry}.png`, fullPage: true });
  });

  test("API bloqueia publish direto com quantidade inválida", async ({ request }) => {
    const patient = await createTestPatient(request);
    const plan = await createTemplatePlan(request, patient.id, "R6 invalid api");
    const response = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: savePayload(plan, "active", (item) => /Arroz integral/i.test(item.food) ? { ...item, quantity: "0" } : item),
    });
    expect(response.status()).toBe(422);
    const body = await response.json() as { code: string; blockers: Array<{ code: string }> };
    expect(body.code).toBe("MEAL_PLAN_PUBLICATION_BLOCKED");
    expect(body.blockers.map((item) => item.code)).toContain("INVALID_QUANTITY");
  });

  test("review mostra blockers para alimento não confirmado e stale exchange", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    const unresolved = await createTemplatePlan(request, patient.id, "R6 unresolved");
    const unresolvedSave = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${unresolved.id}`, {
      data: savePayload(unresolved, "draft", (item) => /Pao de forma/i.test(item.food) ? { ...item, food_source: null, food_ref_id: null } : item),
    });
    expect(unresolvedSave.ok(), await unresolvedSave.text()).toBeTruthy();
    await openReview(page, patient.id);
    await expect(page.getByText("Este plano ainda não pode ser publicado.")).toBeVisible();
    await expect(page.getByText(/confirme o alimento/i)).toBeVisible();
    await page.screenshot({ path: `reports/screenshots/meal-plan-r6-unresolved-food-${testInfo.project.name}-r${testInfo.retry}.png`, fullPage: true });

    const stale = await createTemplatePlan(request, patient.id, "R6 stale");
    await ensureRiceStaleExchange(request, patient.id, stale);
    await openReview(page, patient.id);
    await expect(page.getByText(/trocas precisam ser atualizadas/i)).toBeVisible();
    await page.screenshot({ path: `reports/screenshots/meal-plan-r6-stale-exchange-${testInfo.project.name}-r${testInfo.retry}.png`, fullPage: true });
  });

  test("warning de meta exige confirmação na UI, mas não bloqueia publicação", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    const plan = await createTemplatePlan(request, patient.id, "R6 warning");
    const warningSave = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: savePayload(plan, "draft", undefined, { target_energy_kcal: 9999 }),
    });
    expect(warningSave.ok(), await warningSave.text()).toBeTruthy();
    await openReview(page, patient.id);
    await expect(page.getByText("Plano pronto para publicação.")).toBeVisible();
    await expect(page.getByText(/Energia do plano difere da meta/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Publicar plano/i })).toBeDisabled();
    await page.screenshot({ path: `reports/screenshots/meal-plan-r6-review-warning-${testInfo.project.name}-r${testInfo.retry}.png`, fullPage: true });
    await page.getByLabel("Revisei os avisos.").check();
    await expect(page.getByRole("button", { name: /Publicar plano/i })).toBeEnabled();
  });

  test("conflito de versão após review exige revisar novamente", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    const plan = await createTemplatePlan(request, patient.id, "R6 concurrency");
    await openReview(page, patient.id);
    await expect(page.getByText("Plano pronto para publicação.")).toBeVisible();

    const concurrentSave = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: savePayload(plan, "draft", undefined, { notes: "Alterado em outra sessão." }),
    });
    expect(concurrentSave.ok(), await concurrentSave.text()).toBeTruthy();

    await page.getByRole("button", { name: /Publicar plano/i }).click();
    await expect(page.getByText(/atualizado em outra sessao/i)).toBeVisible();
    await page.screenshot({ path: `reports/screenshots/meal-plan-r6-version-conflict-${testInfo.project.name}-r${testInfo.retry}.png`, fullPage: true });
  });
});
