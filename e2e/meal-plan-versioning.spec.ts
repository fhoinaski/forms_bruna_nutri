import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

/**
 * E2E do versionamento imutavel do plano alimentar (P1-A). Usa a sessao admin
 * pronta (storageState); cria/edita via API (deterministica) e valida a UI
 * quando relevante. Nao usa API real de IA.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

async function createPlan(request: APIRequestContext, patientId: string, title = "Plano E2E") {
  const res = await request.post(`/api/admin/clients/${patientId}/meal-plans`, {
    data: { targetGroup: "ADULTO_SAUDAVEL", title },
  });
  expect(res.ok()).toBe(true);
  return res.json();
}

function planUpdatePayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Plano E2E editado",
    status: "draft",
    meals: [{ name: "Cafe", items: [{ food: "Arroz", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "3" }] }],
    substitutions: [],
    supplements: [],
    ...overrides,
  };
}

test.describe("versionamento do plano alimentar (P1-A)", () => {
  test("CENARIO A: editar cria V2 e V1 permanece imutavel", async ({ request }) => {
    const patient = await createTestPatient(request);
    const plan = await createPlan(request, patient.id, "Plano E2E original");
    expect(plan.version).toBe(1);

    const update = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: planUpdatePayload({ expectedVersion: 1 }),
    });
    expect(update.ok()).toBe(true);
    expect((await update.json()).version).toBe(2);

    const versions = await request.get(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}/versions`);
    const hist = await versions.json();
    expect(hist.items.length).toBe(2);
    expect(hist.items[0].version).toBe(2);
    expect(hist.items[1].version).toBe(1);

    // V1 imutavel: snapshot da v1 tem o titulo original, sem a edicao da v2.
    const v1 = await request.get(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}/versions/1`);
    const v1body = await v1.json();
    expect(v1body.version).toBe(1);
    expect(v1body.snapshot.title).toBe("Plano E2E original");
    expect(v1body.snapshot.version).toBe(1);
  });

  test("CENARIO B: expectedVersion obsoleto retorna 409 sem lost update e sem versao fantasma", async ({ request }) => {
    const patient = await createTestPatient(request);
    const plan = await createPlan(request, patient.id);

    // Sessao A salva -> v2.
    const a = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: planUpdatePayload({ title: "Conteudo da sessao A", expectedVersion: 1 }),
    });
    expect(a.ok()).toBe(true);

    // Sessao B tenta salvar com expectedVersion antigo -> 409.
    const b = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: planUpdatePayload({ title: "Conteudo da sessao B", expectedVersion: 1 }),
    });
    expect(b.status()).toBe(409);

    // Sem lost update: o titulo da sessao A permanece; sem versao fantasma: 2 versoes apenas.
    const versions = await request.get(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}/versions`);
    const hist = await versions.json();
    expect(hist.items.length).toBe(2);
    expect(hist.items[0].version).toBe(2);
    expect(hist.items[1].version).toBe(1);
    const v2 = await request.get(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}/versions/2`);
    const v2body = await v2.json();
    expect(v2body.snapshot.title).toBe("Conteudo da sessao A");
  });

  test("CENARIO C: snapshot nutricional e congelado na prescricao", async ({ request }) => {
    const patient = await createTestPatient(request);
    const plan = await createPlan(request, patient.id);

    const update = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: planUpdatePayload({ expectedVersion: 1 }),
    });
    expect(update.ok()).toBe(true);
    const updated = await update.json();

    const item = updated.meals[0].items[0];
    // Vinculo estruturado + snapshot congelado no momento do save.
    expect(item.food_ref_id).toBe("3");
    expect(item.food_source).toBe("TACO");
    expect(item.food_name_snapshot).toBeTruthy();
    const snapshot = JSON.parse(item.nutrition_snapshot);
    expect(typeof snapshot.energia_kcal).toBe("number");
    expect(snapshot.energia_kcal).toBeGreaterThan(0);
    expect(typeof snapshot.proteina_g).toBe("number");
  });

  test("CENARIO D: item legado sem snapshot usa fallback e ganha snapshot ao salvar vinculado", async ({ request }) => {
    const patient = await createTestPatient(request);
    const plan = await createPlan(request, patient.id);

    // Item digitado livremente (sem vinculo) -> legado, sem snapshot (fallback).
    const legado = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: {
        title: "Plano legado",
        status: "draft",
        meals: [{ name: "Lanche", items: [{ food: "Petisco caseiro", quantity: "1", unit: "unidade" }] }],
        substitutions: [],
        supplements: [],
        expectedVersion: 1,
      },
    });
    expect(legado.ok()).toBe(true);
    const legadoBody = await legado.json();
    const legadoItem = legadoBody.meals[0].items[0];
    expect(legadoItem.food_source).toBeNull();
    expect(legadoItem.nutrition_snapshot).toBeNull();

    // Salva com vinculo -> snapshot gerado.
    const vinculado = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: {
        title: "Plano vinculado",
        status: "draft",
        meals: [{ name: "Almoco", items: [{ food: "Arroz", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "3" }] }],
        substitutions: [],
        supplements: [],
        expectedVersion: 2,
      },
    });
    expect(vinculado.ok()).toBe(true);
    const vincBody = await vinculado.json();
    const vincItem = vincBody.meals[0].items[0];
    expect(vincItem.food_ref_id).toBe("3");
    expect(vincItem.nutrition_snapshot).toBeTruthy();
    expect(vincItem.food_name_snapshot).toBeTruthy();
  });

  test("CENARIO E: fluxo mobile abre o plano e o versionamento nao quebra a UX", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const plan = await createPlan(request, patient.id, "Plano mobile E2E");

    // UI: abre a ficha e a aba Plano alimentar; plano e versao aparecem.
    await suppressDailyBriefingPopup(page);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    // Editor carregou o plano (botao de salvar visivel).
    await expect(page.getByRole("button", { name: /salvar rascunho/i })).toBeVisible();

    // Edita via API (v2) e recarrega -> editor continua carregando (sem quebrar UX).
    const update = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: planUpdatePayload({ expectedVersion: 1 }),
    });
    expect(update.ok()).toBe(true);
    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByRole("button", { name: /salvar rascunho/i })).toBeVisible();
  });
});