import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Clinical Copilot R5 — Performance", () => {
  test("desempenho: montagem de contexto e geração completa (amostra local)", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);

    const contextSamples: number[] = [];
    const generationSamples: number[] = [];

    for (let round = 0; round < 3; round++) {
      // A fixture é one-shot (consumida na primeira geração) — registrada de novo a cada rodada.
      await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
        data: { clientId: patient.id, meals: [{ mealKey: "almoco", recipeId: null, items: [{ query: "Arroz, tipo 1, cozido", quantity: 100, unit: "g" }], rationale: null }] },
      });
      await page.goto(`/dashboard/clients/${patient.id}`);
      await page.getByRole("tab", { name: "Plano alimentar" }).click();

      const contextStart = Date.now();
      const contextResponsePromise = page.waitForResponse((res) => res.url().includes("/meal-plans/draft/context") && res.request().method() === "GET");
      await page.getByRole("button", { name: /^criar com ia$/i }).click();
      await contextResponsePromise;
      contextSamples.push(Date.now() - contextStart);

      const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: /^continuar$/i }).click();
      await dialog.getByRole("button", { name: /^continuar$/i }).click();
      await dialog.getByRole("button", { name: /^continuar$/i }).click();

      const generationStart = Date.now();
      await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();
      await expect(dialog.getByText(/^\d+ kcal$/).first()).toBeVisible({ timeout: 20_000 });
      generationSamples.push(Date.now() - generationStart);

      await page.getByRole("button", { name: "Fechar" }).click();
    }

    function stats(samples: number[]) {
      const sorted = [...samples].sort((a, b) => a - b);
      return { p50: sorted[Math.floor(sorted.length / 2)], p95: sorted[sorted.length - 1], max: sorted[sorted.length - 1] };
    }
    const contextStats = stats(contextSamples);
    const generationStats = stats(generationSamples);

    await testInfo.attach("r5-performance.json", { body: JSON.stringify({ contextSamples, generationSamples }, null, 2), contentType: "application/json" });
    console.log(`CLINICAL_COPILOT_R5_CONTEXT_ASSEMBLY_P50_MS=${contextStats.p50}`);
    console.log(`CLINICAL_COPILOT_R5_CONTEXT_ASSEMBLY_P95_MS=${contextStats.p95}`);
    console.log(`CLINICAL_COPILOT_R5_GENERATION_ROUNDTRIP_P50_MS=${generationStats.p50}`);
    console.log(`CLINICAL_COPILOT_R5_GENERATION_ROUNDTRIP_P95_MS=${generationStats.p95}`);
  });
});
