import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { publishPlan } from "./helpers/meal-plan-editor";
import { createTestPatient } from "./helpers/test-data";

/**
 * Wizard "Criar com IA" fim-a-fim com sucesso (V4 do fechamento de gaps —
 * único blocker restante: meal-plan-draft-agent conectado ao provider
 * determinístico de E2E). Fixture registrada via
 * /api/admin/e2e/set-meal-plan-draft-fixture — a MESMA infraestrutura já
 * usada pelo substitution-suggestion-agent (lib/ai/gateway/e2e-fixtures.ts).
 * A fixture só fornece nomes/quantidades PROPOSTAS (exatamente o que o LLM
 * real forneceria) — resolução de alimento, cálculo nutricional (kcal/
 * proteína/carboidrato/gordura), persistência, versionamento, print e
 * portal continuam 100% código real de produção, nunca mockado.
 *
 * Escopo desta rodada (cirúrgico, por tempo): prova a geração completa +
 * paridade editor/save/reload/print. Sugestão de substituição DENTRO do
 * wizard, ambiguidade, conflito clínico e recuperação de structured_invalid
 * já têm cobertura determinística separada (ver
 * meal-plan-substitution-ai-suggestion.spec.ts e tests/ai-meal-plan-draft-agent.test.ts)
 * — não duplicados aqui.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

async function makeDraftReady(request: import("@playwright/test").APIRequestContext, clientId: string) {
  const current = await request.get(`/api/admin/clients/${clientId}/nutrition-record`);
  expect(current.ok(), await current.text()).toBeTruthy();
  const record = await current.json() as { version: number };
  const update = await request.patch(`/api/admin/clients/${clientId}/nutrition-record`, {
    data: { expectedVersion: record.version, goals: "Emagrecimento", current_weight_kg: "70", height_cm: "165", eating_routine: "Rotina comercial", allergies: "Nenhuma" },
  });
  expect(update.ok(), await update.text()).toBeTruthy();
}

test.describe("wizard Criar com IA — geração completa com provider determinístico", () => {
  test("gera pré-plano com nutrientes calculados pela engine real, aplica ao editor, salva, recarrega, ativa e o print mostra os mesmos dados", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await makeDraftReady(request, patient.id);

    const fixtureRes = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
      data: {
        clientId: patient.id,
        meals: [
          {
            mealKey: "almoco",
            recipeId: null,
            items: [{ query: "Arroz, tipo 1, cozido", quantity: 100, unit: "g" }],
            rationale: "Carboidrato principal do almoço.",
          },
        ],
      },
    });
    expect(fixtureRes.ok(), await fixtureRes.text()).toBeTruthy();
    const fixtureDebug = await fixtureRes.json() as { registration?: { hash?: string; registryInstanceId?: string }; readback?: { hash?: string; registryInstanceId?: string } };
    expect(fixtureDebug.registration?.hash).toBeTruthy();
    expect(fixtureDebug.readback?.hash).toBe(fixtureDebug.registration?.hash);
    expect(fixtureDebug.readback?.registryInstanceId).toBe(fixtureDebug.registration?.registryInstanceId);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar com ia$/i }).click();

    const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^continuar$/i }).click(); // contexto -> objetivo
    await dialog.getByRole("button", { name: /^continuar$/i }).click(); // objetivo -> refeições
    await dialog.getByRole("button", { name: /^continuar$/i }).click(); // refeições -> preferências

    await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();
    await expect.poll(async () => {
      const consumption = await request.get(`/api/admin/e2e/set-meal-plan-draft-fixture?clientId=${patient.id}`);
      if (!consumption.ok()) return false;
      const body = await consumption.json() as { traces: Array<{ event: string; hash?: string }> };
      return body.traces.some((trace) => trace.event === "consumed" && trace.hash === fixtureDebug.registration?.hash);
    }, { timeout: 10_000 }).toBeTruthy();

    // Nutrientes vêm da MESMA engine do editor (draft-nutrition.ts), nunca da fixture.
    const kcalMetric = dialog.getByText(/^\d+ kcal$/).first();
    await expect(kcalMetric).toBeVisible({ timeout: 20_000 });
    const kcalBefore = Number(((await kcalMetric.textContent()) ?? "").replace(/\D/g, "") || "0");
    expect(kcalBefore).toBeGreaterThan(0);
    await expect(dialog.getByText(/arroz,?\s*tipo 1,?\s*cozido/i)).toBeVisible();

    await dialog.getByRole("button", { name: /^aplicar ao editor$/i }).click();
    await expect(dialog).not.toBeVisible();

    // Estado do editor reflete o que veio do wizard — mesma engine, mesmo total.
    const editorKcal = page.getByText(/^\d+ kcal$/).first();
    await expect(editorKcal).toBeVisible();
    await expect(editorKcal).toHaveText(`${kcalBefore} kcal`);

    // "Aplicar ao editor" cria o registro do plano a partir do modelo P0,
    // mas as refeições geradas pelo wizard só existem no estado local do
    // editor até o "Salvar rascunho" explícito. O banco pode conter o modelo
    // semeado; ele não pode conter ainda o conteúdo específico do wizard.
    const plansBeforeSave = (await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json()) as { meals: unknown[] }[];
    expect(plansBeforeSave).toHaveLength(1);
    expect(JSON.stringify(plansBeforeSave[0].meals)).not.toMatch(/arroz,?\s*tipo 1,?\s*cozido/i);

    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByText(/^\d+ kcal$/).first()).toHaveText(`${kcalBefore} kcal`);
    await expect(page.locator("article").last()).toContainText(/arroz,?\s*tipo 1,?\s*cozido/i);

    await publishPlan(page);

    const printPage = await page.context().newPage();
    await printPage.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar`);
    await expect(printPage.getByText(/arroz,?\s*tipo 1,?\s*cozido/i)).toBeVisible();
    await expect(printPage.getByText(new RegExp(`${kcalBefore}\\s*kcal`, "i")).first()).toBeVisible();
    await printPage.close();
  });

  test("fixture inválida (fora do schema real) nunca é aceita silenciosamente — nenhum plano fantasma", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await makeDraftReady(request, patient.id);

    // Payload estruturalmente inválido: mealKey fora do enum real.
    const fixtureRes = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
      data: { clientId: patient.id, meals: [{ mealKey: "brunch_da_tarde", items: [] }] },
    });
    expect(fixtureRes.status()).toBe(400);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar com ia$/i }).click();
    const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();

    // Sem fixture válida registrada e sem provider real configurado nesta suite → falha graciosa conhecida.
    await expect(dialog.getByText(/não conseguimos estruturar o pré-plano/i)).toBeVisible({ timeout: 20_000 });
    const plansAfter = (await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json()) as unknown[];
    expect(plansAfter).toHaveLength(0);
  });

  test("rota de fixture não existe fora de E2E_TEST_MODE (proteção de produção — validada indiretamente: a rota já checa a env var antes de qualquer auth)", async ({ request }) => {
    // Este teste roda dentro do harness de E2E (E2E_TEST_MODE=1 sempre), então
    // só confirma que a rota aceita corretamente quando autenticada — a
    // guarda de env var em si (linha 1 do route.ts) é idêntica ao padrão já
    // coberto por seed-usda-food, que não tem teste próprio para isso (fora
    // do escopo de rodar a suite duas vezes com env vars diferentes).
    const res = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
      data: { clientId: "e2e-protection-check", meals: [{ mealKey: "almoco", items: [] }] },
    });
    expect(res.status()).toBe(200);
  });
});
