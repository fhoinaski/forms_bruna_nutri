import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";
import { openMealPlanTab } from "./helpers/meal-plan-editor";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Meal Plan Reuse R4 — Performance", () => {
  test("desempenho: abrir biblioteca, trocar de aba e buscar (amostra local)", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R4 performance" } });
    await openMealPlanTab(page, patient.id);

    const openSamples: number[] = [];
    const tabSwitchSamples: number[] = [];
    const searchSamples: number[] = [];

    for (let round = 0; round < 3; round++) {
      const openStart = Date.now();
      await page.getByRole("button", { name: "Usar modelo" }).click();
      const drawer = page.getByRole("dialog", { name: "Biblioteca de reuso" });
      await expect(drawer).toBeVisible();
      openSamples.push(Date.now() - openStart);

      const tabStart = Date.now();
      await drawer.getByRole("tab", { name: "Modelos" }).click();
      await expect(drawer.getByRole("tablist")).toBeVisible();
      tabSwitchSamples.push(Date.now() - tabStart);

      const searchStart = Date.now();
      await drawer.getByLabel("Buscar na biblioteca").fill("adulto");
      await page.waitForTimeout(50);
      searchSamples.push(Date.now() - searchStart);

      await page.keyboard.press("Escape");
      await expect(drawer).not.toBeVisible();
    }

    function stats(samples: number[]) {
      const sorted = [...samples].sort((a, b) => a - b);
      return { p50: sorted[Math.floor(sorted.length / 2)], p95: sorted[sorted.length - 1], max: sorted[sorted.length - 1] };
    }
    const openStats = stats(openSamples);
    const tabStats = stats(tabSwitchSamples);
    const searchStats = stats(searchSamples);

    await testInfo.attach("r4-performance.json", { body: JSON.stringify({ openSamples, tabSwitchSamples, searchSamples }, null, 2), contentType: "application/json" });
    console.log(`MEAL_PLAN_REUSE_R4_LIBRARY_OPEN_P50_MS=${openStats.p50}`);
    console.log(`MEAL_PLAN_REUSE_R4_LIBRARY_OPEN_P95_MS=${openStats.p95}`);
    console.log(`MEAL_PLAN_REUSE_R4_TAB_SWITCH_P50_MS=${tabStats.p50}`);
    console.log(`MEAL_PLAN_REUSE_R4_TAB_SWITCH_P95_MS=${tabStats.p95}`);
    console.log(`MEAL_PLAN_REUSE_R4_SEARCH_P50_MS=${searchStats.p50}`);
    console.log(`MEAL_PLAN_REUSE_R4_SEARCH_P95_MS=${searchStats.p95}`);
  });

  test("N+1: abrir a biblioteca (Recentes) dispara UMA chamada, nunca uma por item", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R4 n+1" } });
    await openMealPlanTab(page, patient.id);

    const recentRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/admin/foods/recent") && req.method() === "GET") recentRequests.push(req.url());
    });

    await page.getByRole("button", { name: "Usar modelo" }).click();
    const drawer = page.getByRole("dialog", { name: "Biblioteca de reuso" });
    await expect(drawer).toBeVisible();
    await page.waitForTimeout(300);
    expect(recentRequests.length).toBeLessThanOrEqual(1);
  });
});
