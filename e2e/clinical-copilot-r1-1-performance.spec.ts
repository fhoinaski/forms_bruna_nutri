import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestPatient, uniquePhone, uniqueSuffix } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });
test.describe.configure({ timeout: 120_000 });

const WARMUP = 5;
const SAMPLES = 30;

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}
function metrics(values: number[]) {
  return { count: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: Math.max(...values) };
}

async function updateRecord(request: import("@playwright/test").APIRequestContext, clientId: string, fields: Record<string, string>) {
  const current = await request.get(`/api/admin/clients/${clientId}/nutrition-record`);
  expect(current.ok()).toBe(true);
  const record = await current.json();
  const updated = await request.patch(`/api/admin/clients/${clientId}/nutrition-record`, { data: { expectedVersion: record.version, ...fields } });
  expect(updated.ok()).toBe(true);
}

async function openConsultation(page: import("@playwright/test").Page, id: string) {
  await suppressDailyBriefingPopup(page);
  await page.goto(`/dashboard/clients/${id}`);
  await page.getByRole("button", { name: "Iniciar primeira consulta" }).click();
  await expect(page.getByRole("heading", { name: "Pré-análise para o plano" })).toBeVisible();
}

test("R1.1.1 baseline: endpoint and panel render", async ({ page, request }, testInfo) => {
  const small = await createTestPatient(request);
  const medium = await createTestPatient(request);
  await updateRecord(request, medium.id, {
    goals: "Emagrecimento", current_weight_kg: "70", height_cm: "165", eating_routine: "Trabalha das 9h às 18h e almoça fora", allergies: "Nenhuma", food_preferences: "Frutas e ovos", food_aversions: "Coentro", medications: "Metformina", physical_activity: "Caminhada 3x/semana", restrictions: "Sem restrições",
  });

  const suffix = uniqueSuffix();
  const submissionResponse = await request.post("/api/form-submissions", { data: { nome: `E2E Conflito ${suffix}`, email: `conflict-${suffix}@test.local`, whatsapp: uniquePhone(), objetivo: "Ganho de massa", privacyAccepted: true, companyWebsite: "" } });
  expect(submissionResponse.ok()).toBe(true);
  const submission = await submissionResponse.json() as { id: string };
  const conversion = await request.post(`/api/admin/submissions/${submission.id}/convert-to-client`);
  expect(conversion.ok()).toBe(true);
  const conflict = await conversion.json() as { clientId: string };
  await updateRecord(request, conflict.clientId, { goals: "Emagrecimento", current_weight_kg: "71", height_cm: "165", eating_routine: "Rotina registrada", allergies: "Nenhuma" });

  const endpointScenarios = { small: small.id, medium: medium.id, conflict: conflict.clientId };
  const endpoint: Record<string, { durations: number[]; payloadBytes: number[]; errors: number }> = {};
  for (const [name, clientId] of Object.entries(endpointScenarios)) {
    const path = `/api/admin/clients/${clientId}/meal-plans/clinical-copilot`;
    for (let index = 0; index < WARMUP; index++) await request.get(path);
    const durations: number[] = []; const payloadBytes: number[] = []; let errors = 0;
    for (let index = 0; index < SAMPLES; index++) {
      const start = performance.now();
      const response = await request.get(path);
      const body = await response.text();
      durations.push(Math.round((performance.now() - start) * 100) / 100);
      payloadBytes.push(Buffer.byteLength(body));
      if (!response.ok()) errors++;
    }
    endpoint[name] = { durations, payloadBytes, errors };
  }

  const renderCases: Record<string, { facts: unknown[]; questions: unknown[] }> = {
    complete: { facts: [{ key: "objective", label: "Objetivo", state: "KNOWN", value: "Emagrecimento", source: "nutrition_record", sourcePath: "nutrition_record.goals" }], questions: [] },
    missing: { facts: [{ key: "routine", label: "Rotina", state: "MISSING", value: null, source: null, sourcePath: null }], questions: [{ key: "routine", question: "Como são seus horários de acordar?", input: "short_text", reason: "define a rotina" }] },
    conflict: { facts: [{ key: "objective", label: "Objetivo", state: "CONFLICTING", value: "Emagrecimento", source: "nutrition_record", sourcePath: "nutrition_record.goals", conflictingValue: "Ganho de massa" }], questions: [] },
  };
  const render: Record<string, number[]> = {};
  let renderWorkspaceOpened = false;
  for (const [name, data] of Object.entries(renderCases)) {
    await page.route(`**/api/admin/clients/${small.id}/meal-plans/clinical-copilot`, async (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...data, completion: { known: 0, required: 1, percent: 0 }, canGenerateDraft: false, brief: {} }) }));
    if (!renderWorkspaceOpened) {
      await openConsultation(page, small.id);
      renderWorkspaceOpened = true;
    } else {
      await page.reload();
      await expect(page.getByRole("heading", { name: "Pré-análise para o plano" })).toBeVisible();
    }
    const durations: number[] = [];
    for (let index = 0; index < WARMUP + SAMPLES; index++) {
      const start = await page.evaluate(() => performance.now());
      await page.getByRole("button", { name: "Revisar pré-análise" }).click();
      await expect(page.getByRole("dialog", { name: "Revisar pré-análise" })).toBeVisible();
      const elapsed = await page.evaluate((started) => performance.now() - started, start);
      await page.getByRole("button", { name: "Fechar pré-análise" }).click();
      if (index >= WARMUP) durations.push(Math.round(elapsed * 100) / 100);
    }
    render[name] = durations;
    await page.unroute(`**/api/admin/clients/${small.id}/meal-plans/clinical-copilot`);
  }

  const report = {
    warmup: WARMUP, samplesPerScenario: SAMPLES,
    endpoint: Object.fromEntries(Object.entries(endpoint).map(([name, value]) => [name, { ...metrics(value.durations), payloadBytes: Math.max(...value.payloadBytes), errors: value.errors }])),
    render: Object.fromEntries(Object.entries(render).map(([name, values]) => [name, metrics(values)])),
  };
  await testInfo.attach("clinical-copilot-r1-1-performance.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
  console.log(`CLINICAL_COPILOT_PERFORMANCE=${JSON.stringify(report)}`);
  expect(Object.values(endpoint).every((value) => value.errors === 0)).toBe(true);
});
