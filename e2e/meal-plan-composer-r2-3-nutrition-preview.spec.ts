import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

type PlanResponse = {
  id: string;
  meals: Array<{ name: string; items: Array<{ food: string; quantity?: string | null; unit?: string | null; food_source?: string | null; food_ref_id?: string | null }> }>;
};

async function createTemplatePlan(request: APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<PlanResponse>;
}

async function openDrawerAndSearch(page: Page) {
  await page.getByRole("button", { name: /revisar trocas de Arroz integral cozido/i }).click();
  const drawer = page.getByRole("dialog", { name: /arroz integral cozido/i });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: /adicionar outra/i }).click();
  await drawer.getByLabel("Pesquisar alimento").fill("mandioca");
  const firstResult = drawer.locator("button", { hasText: /mandioca/i }).first();
  await expect(firstResult).toBeVisible({ timeout: 10_000 });
  return { drawer, firstResult };
}

test.describe("Meal Plan Composer R2.3 — Dynamic Nutrition Preview", () => {
  test("selecionar um candidato mostra impacto na refeição e no dia; cancelar restaura sem persistir nada", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const plan = await createTemplatePlan(request, patient.id, "R2.3 preview");
    const originalItems = JSON.stringify(plan.meals);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    const { drawer, firstResult } = await openDrawerAndSearch(page);
    await firstResult.click();

    // Impacto na refeição e no dia aparece — nunca chama save (seção 7/13).
    await expect(drawer.getByText("Impacto (nunca salvo automaticamente)")).toBeVisible({ timeout: 10_000 });
    const mealImpact = drawer.getByText("Refeição", { exact: true }).locator("..");
    const dayImpact = drawer.getByText("Dia", { exact: true }).locator("..");
    await expect(mealImpact.getByText("→")).toBeVisible();
    await expect(dayImpact.getByText("→")).toBeVisible();
    // Seta explícita de sinal (+/-), nunca só cor (seção 26).
    await expect(mealImpact.getByText(/^[+-]/)).toBeVisible({ timeout: 10_000 });

    // Nenhuma chamada de save/publish ocorreu — o plano no servidor continua idêntico.
    const stillOriginal = await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json() as PlanResponse[];
    expect(JSON.stringify(stillOriginal[0]?.meals)).toBe(originalItems);

    // Cancelar (voltar à busca) — nutritionPreview volta a null, impacto some.
    await drawer.getByRole("button", { name: /voltar à busca/i }).click();
    await expect(drawer.getByText("Impacto (nunca salvo automaticamente)")).toHaveCount(0);
  });

  test("confirmar adiciona a troca ao draft (exchange group) sem alterar o item prescrito", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const plan = await createTemplatePlan(request, patient.id, "R2.3 apply");
    const riceItem = plan.meals.flatMap((meal) => meal.items).find((item) => /Arroz integral/i.test(item.food));
    expect(riceItem).toBeTruthy();

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    const { drawer, firstResult } = await openDrawerAndSearch(page);
    await firstResult.click();

    const addButton = drawer.getByRole("button", { name: /^adicionar$/i });
    await expect(addButton).toBeEnabled({ timeout: 10_000 });
    await addButton.click();
    await expect(drawer.getByText(/mandioca/i).first()).toBeVisible();

    // O item prescrito (arroz) continua exatamente o mesmo — "Adicionar"
    // aqui persiste uma ALTERNATIVA sugerida, nunca substitui o item.
    const after = await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json() as PlanResponse[];
    const riceAfter = after[0]?.meals.flatMap((meal) => meal.items).find((item) => /Arroz integral/i.test(item.food));
    expect(riceAfter?.food_ref_id).toBe(riceItem?.food_ref_id);
    expect(riceAfter?.quantity).toBe(riceItem?.quantity);
  });

  test("desempenho: candidato selecionado até impacto renderizado (amostra local)", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "R2.3 performance");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();

    const samples: number[] = [];
    for (let round = 0; round < 3; round++) {
      const { drawer, firstResult } = await openDrawerAndSearch(page);
      const started = Date.now();
      await firstResult.click();
      await expect(drawer.getByText("Impacto (nunca salvo automaticamente)")).toBeVisible({ timeout: 10_000 });
      samples.push(Date.now() - started);
      await page.keyboard.press("Escape");
      await expect(drawer).not.toBeVisible();
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length / 2)];
    const p95 = sorted[sorted.length - 1];
    await testInfo.attach("r2-3-preview-performance.json", { body: JSON.stringify({ samples, p50, p95 }, null, 2), contentType: "application/json" });
    console.log(`MEAL_PLAN_COMPOSER_R2_3_PREVIEW_P50_MS=${p50}`);
    console.log(`MEAL_PLAN_COMPOSER_R2_3_PREVIEW_P95_MS=${p95}`);
  });
});
