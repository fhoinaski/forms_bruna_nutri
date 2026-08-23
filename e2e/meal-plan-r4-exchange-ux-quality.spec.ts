import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

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

function itemForSave(item: PlanResponse["meals"][number]["items"][number]) {
  return {
    food: item.food,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    food_source: item.food_source ?? null,
    food_ref_id: item.food_ref_id ?? null,
    canonical_food_id: item.canonical_food_id ?? null,
  };
}

type ExchangeGroupsResponse = {
  groups: Array<{
    group: { id: string; primary_food_name: string; primary_food_source: string; primary_food_ref_id: string; primary_quantity_grams: number };
    alternatives: Array<{ id: string; food_name: string; state: "SUGGESTED" | "APPROVED" | "EDITED" | "REJECTED"; quantity_grams: number }>;
  }>;
};

async function createTemplatePlan(request: APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, {
    data: { targetGroup: "ADULTO_SAUDAVEL", title },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<PlanResponse>;
}

async function listGroups(request: APIRequestContext, patientId: string, planId: string) {
  const response = await request.get(`/api/admin/clients/${patientId}/meal-plans/exchange-groups?mealPlanId=${planId}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<ExchangeGroupsResponse>;
}

async function ensureRiceGroup(request: APIRequestContext, patientId: string, plan: PlanResponse) {
  const riceItem = plan.meals.flatMap((meal) => meal.items).find((item) => /Arroz integral/i.test(item.food));
  expect(riceItem, "item de arroz não encontrado no plano").toBeTruthy();
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans/exchange-groups`, {
    data: {
      mealPlanId: plan.id,
      primaryFoodSource: riceItem!.food_source,
      primaryFoodRefId: riceItem!.food_ref_id,
      primaryCanonicalFoodId: riceItem!.canonical_food_id ?? null,
      primaryQuantityGrams: 120,
      mealName: "Almoco",
      limit: 5,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const groups = await listGroups(request, patientId, plan.id);
  const group = [...groups.groups].reverse().find((entry) =>
    entry.group.primary_food_source === riceItem!.food_source && entry.group.primary_food_ref_id === riceItem!.food_ref_id
  );
  expect(group, "grupo de arroz não encontrado por identidade").toBeTruthy();
  return group!;
}

function findGroup(groups: ExchangeGroupsResponse, food: RegExp) {
  const group = groups.groups.find((entry) => food.test(entry.group.primary_food_name));
  expect(group, `grupo não encontrado: ${food}`).toBeTruthy();
  return group!;
}

test.describe("R4 exchange UX and clinical quality", () => {
  test("drawer mostra Trocas, aprovadas primeiro, sugestões enxutas e golden de arroz", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "R4 drawer");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /revisar trocas de Arroz integral cozido/i }).click();

    const drawer = page.getByRole("dialog", { name: /arroz integral cozido/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Trocas", { exact: true }).first()).toBeVisible();
    await expect(drawer.getByText("Alimento principal", { exact: true })).toBeVisible();
    await expect(drawer.getByText(/Arroz integral cozido - 120 g/i)).toBeVisible();
    await expect(drawer.getByText("Aprovadas", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Sugestões", { exact: true })).toBeVisible();
    await expect(drawer.getByText(/farinha|mingau|cereal infantil|pão/i)).toHaveCount(0);
    await expect(drawer.locator("input[type='checkbox']")).toHaveCount(3);
    await page.screenshot({ path: `reports/screenshots/meal-plan-r4-arroz-drawer-${testInfo.project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: /fechar trocas/i }).click();

    const visualCases = [
      { button: /revisar trocas de Pao de forma integral/i, dialog: /pao de forma integral/i, file: "pao" },
      { button: /revisar trocas de Feijao carioca cozido/i, dialog: /feijao carioca cozido/i, file: "feijao" },
      { button: /revisar trocas de Peito de frango grelhado/i, dialog: /peito de frango grelhado/i, file: "frango" },
      { button: /revisar trocas de Ovo de galinha inteiro cozido/i, dialog: /ovo de galinha inteiro cozido/i, file: "empty" },
    ];
    for (const item of visualCases) {
      await page.getByRole("button", { name: item.button }).click();
      await expect(page.getByRole("dialog", { name: item.dialog })).toBeVisible();
      await page.screenshot({ path: `reports/screenshots/meal-plan-r4-${item.file}-drawer-${testInfo.project.name}-r${testInfo.retry}.png`, fullPage: true });
      await page.getByRole("button", { name: /fechar trocas/i }).click();
    }
  });

  test("aprova, rejeita, adiciona manualmente e persiste após reload", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    const plan = await createTemplatePlan(request, patient.id, "R4 persistência");
    const rice = await ensureRiceGroup(request, patient.id, plan);
    const suggested = rice.alternatives.filter((alt) => alt.state === "SUGGESTED").slice(0, 4);
    expect(suggested.length).toBeGreaterThanOrEqual(4);

    const approve = await request.patch(`/api/admin/clients/${patient.id}/meal-plans/exchange-groups/${rice.group.id}`, {
      data: { action: "approve", alternativeIds: suggested.slice(0, 3).map((alt) => alt.id) },
    });
    expect(approve.ok(), await approve.text()).toBeTruthy();
    const reject = await request.patch(`/api/admin/clients/${patient.id}/meal-plans/exchange-groups/${rice.group.id}`, {
      data: { action: "reject", alternativeId: suggested[3].id },
    });
    expect(reject.ok(), await reject.text()).toBeTruthy();

    const search = await request.get(`/api/admin/foods/search?q=${encodeURIComponent("mandioca")}&limit=5`);
    expect(search.ok(), await search.text()).toBeTruthy();
    const searchData = await search.json() as { items: Array<{ ref?: { source: string; sourceId: string; canonicalId?: string | null } }> };
    const manual = searchData.items.find((item) => item.ref);
    expect(manual?.ref).toBeTruthy();
    const addManual = await request.patch(`/api/admin/clients/${patient.id}/meal-plans/exchange-groups/${rice.group.id}`, {
      data: { action: "add_manual", source: manual!.ref!.source, sourceId: manual!.ref!.sourceId, canonicalId: manual!.ref!.canonicalId ?? null },
    });
    expect(addManual.ok(), await addManual.text()).toBeTruthy();

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /revisar trocas de Arroz integral cozido/i }).click();
    const drawer = page.getByRole("dialog", { name: /arroz integral cozido/i });
    await expect(drawer.getByText("Aprovadas", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Sugestões", { exact: true })).toBeVisible();
    await expect(drawer.locator("text=/^Remover$/")).toHaveCount(3);
    await expect(drawer.getByText(suggested[3].food_name)).toHaveCount(0);
    await page.screenshot({ path: `reports/screenshots/meal-plan-r4-approved-suggested-${testInfo.project.name}.png`, fullPage: true });
  });

  test("mudança de quantidade do principal marca trocas como stale", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    const plan = await createTemplatePlan(request, patient.id, "R4 stale");
    const rice = await ensureRiceGroup(request, patient.id, plan);
    const first = rice.alternatives.find((alt) => alt.state === "SUGGESTED");
    expect(first).toBeTruthy();
    const approve = await request.patch(`/api/admin/clients/${patient.id}/meal-plans/exchange-groups/${rice.group.id}`, {
      data: { action: "approve", alternativeIds: [first!.id] },
    });
    expect(approve.ok(), await approve.text()).toBeTruthy();

    const updatedMeals = plan.meals.map((meal) => ({
      name: meal.name,
      suggested_time: meal.suggested_time ?? null,
      notes: meal.notes ?? null,
      items: meal.items.map((item) => /Arroz integral/i.test(item.food) ? { ...itemForSave(item), quantity: "150", unit: "g" } : itemForSave(item)),
    }));
    const save = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: { title: plan.title, status: "draft", meals: updatedMeals, substitutions: [], supplements: [], expectedVersion: plan.version },
    });
    expect(save.ok(), await save.text()).toBeTruthy();

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByRole("button", { name: /revisar trocas de Arroz integral cozido/i })).toContainText(/Atualizar trocas/i);
    await page.getByRole("button", { name: /revisar trocas de Arroz integral cozido/i }).click();
    const drawer = page.getByRole("dialog", { name: /arroz integral cozido/i });
    await expect(drawer.getByText(/Trocas precisam ser atualizadas/i)).toBeVisible();
    await page.screenshot({ path: `reports/screenshots/meal-plan-r4-stale-${testInfo.project.name}.png`, fullPage: true });
  });
});
