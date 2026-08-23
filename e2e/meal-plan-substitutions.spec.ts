import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { addMeal, saveDraft, selectFood, selectLastGrams, setLastQuantity } from "./helpers/meal-plan-editor";
import { createTestPatient, enablePortalAccess } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

type FoodSource = "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF";
type PlanResponse = {
  id: string;
  version: number;
  title: string;
  status: "draft" | "active";
  meals: Array<{
    name: string;
    suggested_time?: string | null;
    notes?: string | null;
    source_recipe_id?: string | null;
    items: Array<{
      food: string;
      quantity?: string | null;
      unit?: string | null;
      food_source?: FoodSource | null;
      food_ref_id?: string | null;
      canonical_food_id?: string | null;
    }>;
  }>;
  substitutions: [];
  supplements: [];
};
type ExchangeGroupEntry = {
  group: { id: string; primary_food_name: string };
  alternatives: Array<{ id: string; food_name: string; state: "SUGGESTED" | "APPROVED" | "EDITED" | "REJECTED"; quantity_grams: number }>;
};

function mealForSave(meal: PlanResponse["meals"][number]) {
  return {
    name: meal.name,
    suggested_time: meal.suggested_time ?? null,
    notes: meal.notes ?? null,
    source_recipe_id: meal.source_recipe_id ?? null,
    items: meal.items.map((item) => ({
      food: item.food,
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      food_source: item.food_source ?? null,
      food_ref_id: item.food_ref_id ?? null,
      canonical_food_id: item.canonical_food_id ?? null,
    })),
  };
}

function friendlyFoodName(name: string) {
  const parts = name.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.join(" ") : name.trim();
}

async function createTemplatePlan(request: APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, {
    data: { targetGroup: "ADULTO_SAUDAVEL", title },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<PlanResponse>;
}

async function generateGroup(request: APIRequestContext, patientId: string, plan: PlanResponse, food: RegExp, limit = 5) {
  const item = plan.meals.flatMap((meal) => meal.items).find((entry) => food.test(entry.food));
  expect(item, `item não encontrado: ${food}`).toBeTruthy();
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans/exchange-groups`, {
    data: {
      mealPlanId: plan.id,
      primaryFoodSource: item!.food_source,
      primaryFoodRefId: item!.food_ref_id,
      primaryCanonicalFoodId: item!.canonical_food_id ?? null,
      primaryQuantityGrams: Number(item!.quantity ?? 100),
      mealName: "Almoco",
      limit,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<ExchangeGroupEntry>;
}

async function approveFirstSuggestion(request: APIRequestContext, patientId: string, group: ExchangeGroupEntry) {
  const first = group.alternatives.find((alt) => alt.state === "SUGGESTED");
  expect(first).toBeTruthy();
  const response = await request.patch(`/api/admin/clients/${patientId}/meal-plans/exchange-groups/${group.group.id}`, {
    data: { action: "approve", alternativeIds: [first!.id] },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return first!;
}

async function addAndApproveManual(request: APIRequestContext, patientId: string, group: ExchangeGroupEntry, query = "mandioca") {
  const search = await request.get(`/api/admin/foods/search?q=${encodeURIComponent(query)}&limit=5`);
  expect(search.ok(), await search.text()).toBeTruthy();
  const ref = ((await search.json()) as { items: Array<{ ref?: { source: FoodSource; sourceId: string; canonicalId?: string | null } }> }).items.find((entry) => entry.ref)?.ref;
  expect(ref).toBeTruthy();
  const manual = await request.patch(`/api/admin/clients/${patientId}/meal-plans/exchange-groups/${group.group.id}`, {
    data: { action: "add_manual", source: ref!.source, sourceId: ref!.sourceId, canonicalId: ref!.canonicalId ?? null },
  });
  expect(manual.ok(), await manual.text()).toBeTruthy();
  const updated = await manual.json() as ExchangeGroupEntry;
  const manualAlt = updated.alternatives.find((alt) => alt.state === "SUGGESTED" && new RegExp(query, "i").test(alt.food_name));
  expect(manualAlt).toBeTruthy();
  const approve = await request.patch(`/api/admin/clients/${patientId}/meal-plans/exchange-groups/${group.group.id}`, {
    data: { action: "approve", alternativeIds: [manualAlt!.id] },
  });
  expect(approve.ok(), await approve.text()).toBeTruthy();
  return manualAlt!;
}

async function publishPlanByApi(request: APIRequestContext, patientId: string, plan: PlanResponse) {
  const response = await request.put(`/api/admin/clients/${patientId}/meal-plans/${plan.id}`, {
    data: {
      title: plan.title,
      status: "active",
      meals: plan.meals.map(mealForSave),
      substitutions: [],
      supplements: [],
      weekly_slots: [],
      expectedVersion: plan.version,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<PlanResponse>;
}

async function loginPatient(page: Page, email: string, code: string) {
  await page.goto("/portal");
  await page.getByPlaceholder("seunome@email.com").fill(email);
  await page.getByPlaceholder("BF-0000-0000").fill(code);
  await page.getByRole("button", { name: /acessar meu portal/i }).click();
  await expect(page.getByText(/ola,/i)).toBeVisible();
}

async function expectNoPatientDebugWords(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text.toLowerCase()).not.toMatch(/\b(pilot|curated|engine|ranking|strategy|debug|suggested|approved|rejected|stale|resolver|canonical)\b/);
}

test.describe("substituições nutricionais equivalentes", () => {
  test("template adulto saudável: pão, ovo e banana expõem drawer de trocas persistente", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "Substituições template");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();

    for (const foodName of ["Pao de forma integral", "Ovo de galinha inteiro cozido", "Banana prata"]) {
      await page.getByRole("button", { name: new RegExp(`revisar trocas de ${foodName}`, "i") }).click();
      const drawer = page.getByRole("dialog", { name: new RegExp(foodName, "i") });
      await expect(drawer.getByText("Trocas", { exact: true }).first()).toBeVisible();
      await expect(drawer.getByText("Alimento principal", { exact: true })).toBeVisible();
      await expect(drawer.getByText(/Aprovadas|Sugestões|Nenhuma troca cadastrada/i).first()).toBeVisible();
      await page.getByRole("button", { name: /fechar trocas/i }).click();
    }
  });

  test("adiciona uma troca manual, aprova, recarrega e a troca persiste", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const plan = await createTemplatePlan(request, patient.id, "Substituição manual");
    const group = await generateGroup(request, patient.id, plan, /Arroz integral/i);
    const manual = await addAndApproveManual(request, patient.id, group, "mandioca");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /revisar trocas de Arroz integral cozido/i }).click();
    const drawer = page.getByRole("dialog", { name: /arroz integral cozido/i });
    await expect(drawer.getByText("Aprovadas", { exact: true })).toBeVisible();
    await expect(drawer.getByText(friendlyFoodName(manual.food_name))).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /revisar trocas de Arroz integral cozido/i }).click();
    await expect(page.getByRole("dialog", { name: /arroz integral cozido/i }).getByText(friendlyFoodName(manual.food_name))).toBeVisible();
  });

  test("item com quantidade bloqueada persiste o lock após salvar e recarregar", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible({ timeout: 30_000 });

    const meal = await addMeal(page);
    await selectFood(page, meal, "Arroz", /arroz/i);
    await setLastQuantity(meal, "100");
    await selectLastGrams(meal);

    await meal.getByRole("button", { name: /mais ações do alimento/i }).last().click();
    await meal.getByRole("button", { name: /bloquear quantidade/i }).click();
    await meal.getByRole("button", { name: /mais ações do alimento/i }).last().click();
    await expect(meal.getByRole("button", { name: /desbloquear quantidade/i })).toBeVisible();
    await meal.getByRole("button", { name: /mais ações do alimento/i }).last().click();

    await saveDraft(page);
    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    const reloaded = page.locator("article").last();
    await reloaded.getByRole("button", { name: /mais ações do alimento/i }).last().click();
    await expect(reloaded.getByRole("button", { name: /desbloquear quantidade/i })).toBeVisible();
  });

  test("print mostra troca aprovada e o plano não expõe termos internos", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const plan = await createTemplatePlan(request, patient.id, "Substituição print");
    const group = await generateGroup(request, patient.id, plan, /Arroz integral/i);
    const approved = await approveFirstSuggestion(request, patient.id, group);
    const active = await publishPlanByApi(request, patient.id, plan);

    await page.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar`);
    await expect(page.locator("[data-version-id]").first()).toHaveAttribute("data-version-id", `${active.id}:v${active.version}`);
    await expect(page.getByText(friendlyFoodName(approved.food_name))).toBeVisible();
    await expectNoPatientDebugWords(page);
  });

  test("portal mostra a troca aprovada", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);
    const plan = await createTemplatePlan(request, patient.id, "Substituição portal");
    const group = await generateGroup(request, patient.id, plan, /Arroz integral/i);
    const approved = await approveFirstSuggestion(request, patient.id, group);
    const active = await publishPlanByApi(request, patient.id, plan);

    await loginPatient(page, patient.email, code);
    const portalPlan = page.locator("#portal-meal-plan");
    await expect(portalPlan).toHaveAttribute("data-version-id", `${active.id}:v${active.version}`);
    await expect(portalPlan.getByText("Trocas disponíveis")).toBeVisible();
    await expect(portalPlan.getByText(friendlyFoodName(approved.food_name))).toBeVisible();
  });

  test("pilot crítico: template, gera, aprova, publica, portal e print sem termos internos", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);
    const plan = await createTemplatePlan(request, patient.id, "Substituição validação");
    const group = await generateGroup(request, patient.id, plan, /Arroz integral/i);
    const approved = await approveFirstSuggestion(request, patient.id, group);
    await publishPlanByApi(request, patient.id, plan);

    await loginPatient(page, patient.email, code);
    await expect(page.locator("#portal-meal-plan").getByText(friendlyFoodName(approved.food_name))).toBeVisible();
    await expectNoPatientDebugWords(page);

    await page.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar`);
    await expect(page.getByText(friendlyFoodName(approved.food_name))).toBeVisible();
    await expectNoPatientDebugWords(page);
  });

  test("mobile (390px): drawer de trocas não gera overflow horizontal", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "Substituição mobile");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /revisar trocas de Arroz integral cozido/i }).click();
    await expect(page.getByRole("dialog", { name: /arroz integral cozido/i })).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
