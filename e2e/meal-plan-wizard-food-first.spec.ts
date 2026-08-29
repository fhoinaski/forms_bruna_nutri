import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { publishPlan } from "./helpers/meal-plan-editor";
import { createTestPatient, enablePortalAccess } from "./helpers/test-data";

/**
 * Food-First Meal Plan V1 — Fases 2-8: "✨ Sugerir receita" (opcional, nunca
 * automática), comparação antes da aprovação, semântica determinística de
 * "Usar receita" (substitui os itens da refeição pelos ingredientes reais
 * da receita, nunca soma — elimina dupla contagem por construção), e
 * "✨ Sugerir substituições" já integrado na revisão do wizard (nunca entra
 * no total principal). Cobre os Cenários B/C/D do pedido — o Cenário A
 * (plano só com itens simples, gerar → revisar → salvar → reload → print)
 * já está coberto por e2e/meal-plan-ai-wizard-complete.spec.ts, não
 * duplicado aqui.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

async function createOmeleteRecipe(request: import("@playwright/test").APIRequestContext) {
  const recipeRes = await request.post("/api/admin/recipes", {
    data: {
      title: "Omelete simples",
      meal_group: "cafe_da_manha",
      servings: 1,
      ingredients: [{ taco_number: 489, food_name: "Ovo, de galinha, inteiro, cru", grams: 150 }],
    },
  });
  expect(recipeRes.ok(), await recipeRes.text()).toBeTruthy();
}

/**
 * Preenche o prontuário mínimo exigido pelo gate determinístico de
 * pré-análise (generationReadiness) — adicionado depois deste arquivo, sem
 * o qual "Gerar pré-plano" nunca habilita. Nunca muda o que os testes
 * verificam (Food-First), só permite alcançar essa etapa.
 */
async function ready(request: import("@playwright/test").APIRequestContext, clientId: string) {
  const current = await request.get(`/api/admin/clients/${clientId}/nutrition-record`);
  const record = (await current.json()) as { version: number };
  const update = await request.patch(`/api/admin/clients/${clientId}/nutrition-record`, {
    data: { expectedVersion: record.version, goals: "Manutenção", current_weight_kg: "70", height_cm: "165", eating_routine: "Rotina comercial", allergies: "Nenhuma" },
  });
  expect(update.ok(), await update.text()).toBeTruthy();
}

async function generateSimpleBreakfastDraft(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext, clientId: string) {
  await ready(request, clientId);
  const fixtureRes = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
    data: {
      clientId,
      meals: [{ mealKey: "cafe_da_manha", recipeId: null, items: [{ query: "ovo cozido", quantity: 100, unit: "g" }], rationale: "Proteína simples." }],
    },
  });
  expect(fixtureRes.ok(), await fixtureRes.text()).toBeTruthy();

  await page.goto(`/dashboard/clients/${clientId}`);
  await page.getByRole("tab", { name: "Plano alimentar" }).click();
  await page.getByRole("button", { name: /^criar com ia$/i }).click();
  const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /^continuar$/i }).click();
  await dialog.getByRole("button", { name: /^continuar$/i }).click();
  await dialog.getByRole("button", { name: /^continuar$/i }).click();
  await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();
  await expect(dialog.getByText(/ovo,?\s*de galinha,?\s*inteiro,?\s*cozido/i)).toBeVisible({ timeout: 20_000 });
  return dialog;
}

test.describe("wizard Criar com IA — Food-First V1: receita opcional e substituições na revisão", () => {
  test("Cenário B — sugerir receita, comparar, rejeitar: alimentos originais permanecem intactos", async ({ page, request }) => {
    await createOmeleteRecipe(request);
    const patient = await createTestPatient(request);
    const dialog = await generateSimpleBreakfastDraft(page, request, patient.id);

    const mealCard = dialog.locator("div").filter({ hasText: "Café da manhã" }).first();
    await mealCard.getByRole("button", { name: /^sugerir receita$/i }).click();

    // Comparação real: refeição atual (engine real) vs receita sugerida
    // (nutrição precomputada real da receita) — nunca um número inventado.
    // O título capturado dinamicamente porque, na suíte completa, outras
    // receitas do mesmo grupo (ex.: "Ovo mexido padrão", de outro spec)
    // também competem no ranking por proximidade nutricional — o teste só
    // precisa provar que ALGUMA receita real foi sugerida, nunca inventada.
    await expect(dialog.getByText(/sugestão de receita \(opcional\)/i)).toBeVisible({ timeout: 10_000 });
    const suggestionCard = dialog.getByText(/sugestão de receita \(opcional\)/i).locator("..");
    const suggestedTitle = ((await suggestionCard.locator("p").nth(1).textContent()) ?? "").trim();
    expect(suggestedTitle.length).toBeGreaterThan(0);
    await expect(dialog.getByText(/refeição atual/i)).toBeVisible();
    await expect(dialog.getByText(/receita sugerida/i)).toBeVisible();
    await expect(dialog.getByText(/diferença:/i)).toBeVisible();

    const kcalBefore = await dialog.getByText(/^\d+ kcal$/).first().textContent();

    await dialog.getByRole("button", { name: /^manter alimentos$/i }).click();

    // Sugestão some, alimentos originais (ovo cozido) intactos — nunca tocados.
    await expect(dialog.getByText(/sugestão de receita \(opcional\)/i)).not.toBeVisible();
    await expect(dialog.getByText(/ovo,?\s*de galinha,?\s*inteiro,?\s*cozido/i)).toBeVisible();
    await expect(dialog.getByText(/^\d+ kcal$/).first()).toHaveText(kcalBefore ?? "");

    await dialog.getByRole("button", { name: /^aplicar ao editor$/i }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();

    // Nunca ganhou uma receita vinculada — a refeição salva continua "items only".
    const saved = (await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json()) as { meals: { source_recipe_id: string | null; items: { food: string }[] }[] }[];
    expect(saved[0].meals[0].source_recipe_id).toBeNull();
    expect(saved[0].meals[0].items.some((item) => /ovo/i.test(item.food))).toBe(true);
  });

  test("Cenário C — sugerir receita, aceitar: substitui os itens pelos ingredientes reais, persiste, print e portal mostram a receita de forma humana", async ({ page, request }) => {
    await createOmeleteRecipe(request);
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);
    const dialog = await generateSimpleBreakfastDraft(page, request, patient.id);

    const mealCard = dialog.locator("div").filter({ hasText: "Café da manhã" }).first();
    await mealCard.getByRole("button", { name: /^sugerir receita$/i }).click();
    await expect(dialog.getByText(/sugestão de receita \(opcional\)/i)).toBeVisible({ timeout: 10_000 });
    // Título capturado dinamicamente (ver Cenário B) — na suíte completa mais
    // de uma receita real do grupo café da manhã pode competir no ranking.
    const suggestionCard = dialog.getByText(/sugestão de receita \(opcional\)/i).locator("..");
    const suggestedTitle = ((await suggestionCard.locator("p").nth(1).textContent()) ?? "").trim();

    await dialog.getByRole("button", { name: /^usar receita$/i }).click();

    // Itens substituídos pelos ingredientes REAIS da receita (ovo cru, 150g
    // escalado a 1 porção) — nunca somados ao item original ("ovo cozido"
    // não aparece mais, evita dupla contagem).
    await expect(dialog.getByText(/sugestão de receita \(opcional\)/i)).not.toBeVisible();
    await expect(dialog.getByText(/ovo,?\s*de galinha,?\s*inteiro,?\s*cru/i)).toBeVisible();
    await expect(dialog.getByText(/ovo,?\s*de galinha,?\s*inteiro,?\s*cozido/i)).not.toBeVisible();
    const kcalMetric = dialog.getByText(/^\d+ kcal$/).first();
    await expect(kcalMetric).toBeVisible();
    const kcalAfter = Number(((await kcalMetric.textContent()) ?? "").replace(/\D/g, "") || "0");
    expect(kcalAfter).toBeGreaterThan(0);

    await dialog.getByRole("button", { name: /^aplicar ao editor$/i }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();

    const saved = (await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json()) as { meals: { source_recipe_id: string | null; items: { food: string }[] }[] }[];
    expect(saved[0].meals[0].source_recipe_id).toBeTruthy();

    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByText(/^\d+ kcal$/).first()).toHaveText(`${kcalAfter} kcal`);

    await publishPlan(page);

    const printPage = await page.context().newPage();
    await printPage.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar`);
    await expect(printPage.getByText(suggestedTitle)).toBeVisible();
    await expect(printPage.getByText(/ovo,?\s*de galinha,?\s*inteiro,?\s*cru/i)).toBeVisible();
    await printPage.close();

    const portalPage = await page.context().newPage();
    await portalPage.goto("/portal");
    await portalPage.getByPlaceholder("seunome@email.com").fill(patient.email);
    await portalPage.getByLabel("Senha").fill(code);
    await portalPage.getByRole("button", { name: /acessar meu portal/i }).click();
    await expect(portalPage.getByText(suggestedTitle)).toBeVisible();
    await expect(portalPage.getByText(/ovo,?\s*de galinha,?\s*inteiro,?\s*cru/i).first()).toBeVisible();
    await portalPage.close();
  });

  test("Cenário D — sugerir substituição por item na revisão: nunca entra no total principal do rascunho", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await ready(request, patient.id);
    const fixtureRes1 = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
      data: {
        clientId: patient.id,
        meals: [{ mealKey: "almoco", recipeId: null, items: [{ query: "arroz branco cozido", quantity: 100, unit: "g" }], rationale: "Carboidrato." }],
      },
    });
    expect(fixtureRes1.ok(), await fixtureRes1.text()).toBeTruthy();

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar com ia$/i }).click();
    const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();
    await expect(dialog.getByText(/arroz,?\s*tipo 1,?\s*cozido/i)).toBeVisible({ timeout: 20_000 });

    const kcalBefore = await dialog.getByText(/^\d+ kcal$/).first().textContent();

    const fixtureRes2 = await request.post("/api/admin/e2e/set-substitution-suggestion-fixture", {
      data: { clientId: patient.id, candidates: ["Batata, inglesa, cozida"] },
    });
    expect(fixtureRes2.ok(), await fixtureRes2.text()).toBeTruthy();

    const itemRow = dialog.getByText(/arroz,?\s*tipo 1,?\s*cozido/i).locator("..");
    await itemRow.getByRole("button", { name: /sugerir substituições para/i }).click();

    await expect(dialog.getByText(/sugestões de substituição/i)).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/batata/i)).toBeVisible();

    // Total do rascunho NUNCA muda só por ter uma sugestão pendente/aprovada
    // localmente — só entra no plano de verdade se salva como substituição
    // (nunca somado ao item principal).
    await expect(dialog.getByText(/^\d+ kcal$/).first()).toHaveText(kcalBefore ?? "");

    await dialog.getByRole("button", { name: /^aplicar ao editor$/i }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();

    const saved = (await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json()) as {
      target_energy_kcal: number | null;
      meals: { items: { food: string }[] }[];
      substitutions: { base_food: string; option_food: string }[];
    }[];
    // Substituição (mesmo se aprovada) fica numa lista separada — nunca vira um item novo do plano principal.
    const items = saved[0].meals[0].items;
    expect(items).toHaveLength(1);
    expect(items[0].food).toMatch(/arroz,?\s*tipo 1/i);
  });
});
