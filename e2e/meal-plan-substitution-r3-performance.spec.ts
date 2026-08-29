import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

async function createTemplatePlan(request: import("@playwright/test").APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test.describe("Meal Plan Substitution R3 — Performance", () => {
  test("desempenho: abrir drawer, calcular lote e trocar critério (amostra local)", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "R3 performance");
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();

    const drawerOpenSamples: number[] = [];
    const batchSamples: number[] = [];
    const criterionSwitchSamples: number[] = [];
    const candidateSelectSamples: number[] = [];

    for (let round = 0; round < 3; round++) {
      const openStart = Date.now();
      await page.getByRole("button", { name: /revisar trocas de Arroz integral cozido/i }).click();
      const drawer = page.getByRole("dialog", { name: /arroz integral cozido/i });
      await expect(drawer).toBeVisible();
      drawerOpenSamples.push(Date.now() - openStart);

      await drawer.getByRole("button", { name: /adicionar outra/i }).click();
      const batchStart = Date.now();
      await drawer.getByLabel("Pesquisar alimento").fill("mandioca");
      const firstResult = drawer.locator("button", { hasText: /mandioca/i }).first();
      await expect(firstResult).toBeVisible({ timeout: 10_000 });
      await expect(drawer.getByText(/de diferença em energia/i).first()).toBeVisible({ timeout: 10_000 });
      batchSamples.push(Date.now() - batchStart);

      const selectStart = Date.now();
      await firstResult.click();
      await expect(drawer.getByText("Impacto (nunca salvo automaticamente)")).toBeVisible({ timeout: 10_000 });
      candidateSelectSamples.push(Date.now() - selectStart);

      const switchStart = Date.now();
      await drawer.getByRole("button", { name: "Proteína", exact: true }).click();
      await expect(drawer.getByText(/quantidade equivalente \(proteína\)/i)).toBeVisible({ timeout: 10_000 });
      criterionSwitchSamples.push(Date.now() - switchStart);

      await page.keyboard.press("Escape");
      await expect(drawer).not.toBeVisible();
    }

    function stats(samples: number[]) {
      const sorted = [...samples].sort((a, b) => a - b);
      return { p50: sorted[Math.floor(sorted.length / 2)], p95: sorted[sorted.length - 1] };
    }
    const drawerStats = stats(drawerOpenSamples);
    const batchStats = stats(batchSamples);
    const selectStats = stats(candidateSelectSamples);
    const switchStats = stats(criterionSwitchSamples);

    await testInfo.attach("r3-performance.json", {
      body: JSON.stringify({ drawerOpenSamples, batchSamples, candidateSelectSamples, criterionSwitchSamples }, null, 2),
      contentType: "application/json",
    });
    console.log(`MEAL_PLAN_SUBSTITUTION_R3_DRAWER_OPEN_P50_MS=${drawerStats.p50}`);
    console.log(`MEAL_PLAN_SUBSTITUTION_R3_DRAWER_OPEN_P95_MS=${drawerStats.p95}`);
    console.log(`MEAL_PLAN_SUBSTITUTION_R3_BATCH_P50_MS=${batchStats.p50}`);
    console.log(`MEAL_PLAN_SUBSTITUTION_R3_BATCH_P95_MS=${batchStats.p95}`);
    console.log(`MEAL_PLAN_SUBSTITUTION_R3_CANDIDATE_SELECT_P50_MS=${selectStats.p50}`);
    console.log(`MEAL_PLAN_SUBSTITUTION_R3_CANDIDATE_SELECT_P95_MS=${selectStats.p95}`);
    console.log(`MEAL_PLAN_SUBSTITUTION_R3_CRITERION_SWITCH_P50_MS=${switchStats.p50}`);
    console.log(`MEAL_PLAN_SUBSTITUTION_R3_CRITERION_SWITCH_P95_MS=${switchStats.p95}`);
  });
});
