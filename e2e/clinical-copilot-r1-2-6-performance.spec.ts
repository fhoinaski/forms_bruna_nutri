import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });
test.describe.configure({ timeout: 180_000 });

// Amostra representativa, não 20+/estrutura: a rota real
// (/api/admin/clients/[id]/meal-plans/draft) tem rate limit de produção de
// 20 requisições/hora por scope "ai-meal-plan-draft" (lib/security/rate-limit.ts),
// por IP — o teste roda como um único "IP" (localhost), então o limite é
// compartilhado por TODAS as amostras da execução inteira, não por
// estrutura. Este teste nunca contorna ou afrouxa esse limite (é um
// controle de segurança de produção real) — 6/estrutura x 3 estruturas =
// 18 requisições fica com folga sob o teto de 20. Ver seção 47/59 do
// pedido: baseline apenas, amostra representativa, sem invenção de SLA.
const SAMPLES_PER_STRUCTURE = 6;

type Fixture = { mealKey: string; recipeId: null; structureType: "SIMPLE" | "OPTIONS" | "COMBINATION" } & Record<string, unknown>;

const FIXTURES: Record<"SIMPLE" | "OPTIONS" | "COMBINATION", Fixture> = {
  SIMPLE: {
    mealKey: "almoco", recipeId: null, structureType: "SIMPLE",
    items: [{ query: "Arroz, tipo 1, cozido", quantity: 100, unit: "g", preparation: "cozido" }],
  },
  OPTIONS: {
    mealKey: "almoco", recipeId: null, structureType: "OPTIONS",
    options: [
      { label: "Opção arroz", items: [{ query: "Arroz, tipo 1, cozido", quantity: 100, unit: "g", preparation: "cozido" }] },
      { label: "Opção banana", items: [{ query: "Banana, prata, crua", quantity: 100, unit: "g", optional: true }] },
    ],
  },
  COMBINATION: {
    mealKey: "almoco", recipeId: null, structureType: "COMBINATION",
    fixedItems: [{ query: "Alface, crua", quantity: 80, unit: "g", preparation: "crua" }],
    choiceGroups: [{
      label: "Escolha uma proteína", minSelections: 1, maxSelections: 1,
      items: [
        { query: "Frango, peito, sem pele, grelhado", quantity: 100, unit: "g" },
        { query: "Ovo, de galinha, inteiro, cozido", quantity: 100, unit: "g", optional: true },
      ],
    }],
  },
};

function itemCount(structureType: "SIMPLE" | "OPTIONS" | "COMBINATION"): number {
  if (structureType === "SIMPLE") return 1;
  if (structureType === "OPTIONS") return 2;
  return 3;
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}
function stats(values: number[]) {
  return { count: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: values.length ? Math.max(...values) : 0 };
}

async function ready(request: import("@playwright/test").APIRequestContext, clientId: string) {
  const current = await request.get(`/api/admin/clients/${clientId}/nutrition-record`);
  const record = (await current.json()) as { version: number };
  const update = await request.patch(`/api/admin/clients/${clientId}/nutrition-record`, {
    data: { expectedVersion: record.version, goals: "Flexibilidade alimentar", current_weight_kg: "70", height_cm: "165", eating_routine: "Rotina comercial", allergies: "Nenhuma" },
  });
  expect(update.ok(), await update.text()).toBeTruthy();
}

test("R1.2.6 performance: geração, resolução e nutrição medidas separadamente por estrutura", async ({ request }, testInfo) => {
  const generationMs: number[] = [];
  const resolutionMs: number[] = [];
  const nutritionMs: number[] = [];
  let errors = 0;
  let timeouts = 0;

  const resolutionCounts = { total: 0, AUTO_MATCH: 0, REVIEW_REQUIRED: 0, NOT_FOUND: 0 };
  const byStructure: Record<string, ReturnType<typeof stats>> = {};

  for (const structureType of ["SIMPLE", "OPTIONS", "COMBINATION"] as const) {
    const structureGenerationMs: number[] = [];
    for (let sample = 0; sample < SAMPLES_PER_STRUCTURE; sample++) {
      const patient = await createTestPatient(request);
      await ready(request, patient.id);
      const fixture = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", { data: { clientId: patient.id, meals: [FIXTURES[structureType]] } });
      expect(fixture.ok(), await fixture.text()).toBeTruthy();

      const started = Date.now();
      const response = await request.post(`/api/admin/clients/${patient.id}/meal-plans/draft`, {
        data: {
          objectiveLabel: "Manutenção", targetEnergyKcal: null, targetProteinG: null, targetCarbohydrateG: null, targetFatG: null,
          requestedMeals: [{ key: "almoco", suggestedTime: null }],
          prioritizeFoods: null, avoidFoods: null, useRecipes: false, forceMealByMeal: false,
        },
        timeout: 30_000,
      }).catch((cause) => {
        if (String(cause).includes("Timeout")) timeouts++;
        return null;
      });
      const elapsed = Date.now() - started;

      if (!response || !response.ok()) {
        errors++;
        continue;
      }
      const body = (await response.json()) as {
        stageTimingsMs?: { generationMs?: number; resolutionMs?: number; nutritionMs?: number };
        meals: Array<{ needsReview: Array<{ status: string }> }>;
      };
      const timings = body.stageTimingsMs;
      // O gateway pula a etapa de geração estruturada em si quando falta
      // instrumentação (não deveria acontecer sob E2E_TEST_MODE=1 — reportado
      // como erro funcional, nunca silenciosamente ignorado).
      expect(timings, "resposta sem stageTimingsMs — instrumentação test-only ausente").toBeTruthy();
      if (timings?.generationMs !== undefined) { generationMs.push(timings.generationMs); structureGenerationMs.push(timings.generationMs); }
      if (timings?.resolutionMs !== undefined) resolutionMs.push(timings.resolutionMs);
      if (timings?.nutritionMs !== undefined) nutritionMs.push(timings.nutritionMs);
      void elapsed;

      const itemsResolved = itemCount(structureType) - (body.meals[0]?.needsReview.length ?? 0);
      resolutionCounts.total += itemCount(structureType);
      resolutionCounts.AUTO_MATCH += itemsResolved;
      for (const review of body.meals[0]?.needsReview ?? []) {
        if (review.status === "NOT_FOUND") resolutionCounts.NOT_FOUND++;
        else resolutionCounts.REVIEW_REQUIRED++;
      }
    }
    byStructure[structureType] = stats(structureGenerationMs);
  }

  const report = {
    generationMode: "mock",
    samplesPerStructure: SAMPLES_PER_STRUCTURE,
    generation: { ...stats(generationMs), byStructure },
    resolution: { ...stats(resolutionMs), counts: resolutionCounts },
    nutrition: { ...stats(nutritionMs) },
    errors,
    timeouts,
  };
  await testInfo.attach("clinical-copilot-r1-2-6-performance.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" });

  // Nomeação explícita (seção 45): estas são latências do harness
  // determinístico (fixture -> validação -> resolução real -> nutrição
  // real), NÃO de um provedor de IA ao vivo.
  console.log(`CLINICAL_COPILOT_R1_2_6_HARNESS_ORCHESTRATOR_LATENCY=${JSON.stringify(report)}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_GENERATION_MODE=mock`);
  console.log(`CLINICAL_COPILOT_R1_2_6_GENERATION_SAMPLES=${generationMs.length}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_GENERATION_ERRORS=${errors}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_GENERATION_P50_MS=${report.generation.p50}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_GENERATION_P95_MS=${report.generation.p95}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_GENERATION_MAX_MS=${report.generation.max}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_RESOLUTION_ITEMS=${resolutionCounts.total}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_RESOLUTION_AUTO_MATCH=${resolutionCounts.AUTO_MATCH}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_RESOLUTION_REVIEW_REQUIRED=${resolutionCounts.REVIEW_REQUIRED}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_RESOLUTION_NOT_FOUND=${resolutionCounts.NOT_FOUND}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_RESOLUTION_P50_MS=${report.resolution.p50}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_RESOLUTION_P95_MS=${report.resolution.p95}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_RESOLUTION_MAX_MS=${report.resolution.max}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_NUTRITION_SAMPLES=${nutritionMs.length}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_NUTRITION_ERRORS=${errors}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_NUTRITION_P50_MS=${report.nutrition.p50}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_NUTRITION_P95_MS=${report.nutrition.p95}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_NUTRITION_MAX_MS=${report.nutrition.max}`);
  console.log(`CLINICAL_COPILOT_R1_2_6_TIMEOUTS=${timeouts}`);

  expect(errors, "amostras com erro funcional durante a medição de performance").toBe(0);
});
