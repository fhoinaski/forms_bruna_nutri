import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient, seedNutritionRecordForReadiness } from "./helpers/test-data";
import { openMealPlanTab } from "./helpers/meal-plan-editor";

test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * R6.5.2B — fecha os gaps deixados NOT_TESTED/FAIL pela R6.5.2:
 * compatibilidade R5 (Copilot flexível) explícita, compatibilidade R6
 * (item de receita), rótulo "Itens fixos" em COMBINATION, e verificação
 * de que quantidade/unidade inline e a entrada de sugestões R3 já
 * funcionam sem modal (comportamento pré-existente, apenas confirmado
 * aqui, não reconstruído).
 */

async function setFixture(request: APIRequestContext, clientId: string, meal: Record<string, unknown>) {
  const response = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", { data: { clientId, meals: [meal] } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function openWizardAndGenerate(page: Page, patientId: string, { flexible }: { flexible: boolean }) {
  await page.goto(`/dashboard/clients/${patientId}`);
  await page.getByRole("tab", { name: "Plano alimentar" }).click();
  await page.getByRole("button", { name: /^criar com ia$/i }).click();
  const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /^continuar$/i }).click();
  await dialog.getByRole("button", { name: /^continuar$/i }).click();
  await dialog.getByRole("button", { name: /^continuar$/i }).click();
  if (flexible) await dialog.getByRole("checkbox", { name: /permitir estrutura flexível/i }).check();
  await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();
  return dialog;
}

test.describe("Meal Plan Composer R6.5.2B — fechamento de gaps (R5/R6/COMBINATION)", () => {
  test("R5 SIMPLE: Copilot sem estrutura flexível continua gerando e aplicando SIMPLE, sem regressão", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await seedNutritionRecordForReadiness(request, patient.id);
    await setFixture(request, patient.id, { mealKey: "almoco", recipeId: null, items: [{ query: "Arroz, tipo 1, cozido", quantity: 100, unit: "g" }], rationale: null });

    const dialog = await openWizardAndGenerate(page, patient.id, { flexible: false });
    await expect(dialog.getByText(/^\d+ kcal$/).first()).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: /^aplicar ao editor$/i }).click();
    await expect(dialog).not.toBeVisible();

    await expect(page.getByRole("article").filter({ hasText: "arroz" })).toBeVisible({ timeout: 10_000 });
  });

  test("R5 OPTIONS: Copilot gera 2 alternativas resolvidas, aplica ao Composer com badge Opções e divisor OU", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await seedNutritionRecordForReadiness(request, patient.id);
    await setFixture(request, patient.id, {
      structure: "OPTIONS",
      mealKey: "cafe_da_manha",
      options: [
        { label: "Opção A", items: [{ query: "Ovo, de galinha, inteiro, cru", quantity: 100, unit: "g" }] },
        { label: "Opção B", items: [{ query: "Iogurte, natural", quantity: 170, unit: "g" }] },
      ],
    });

    const dialog = await openWizardAndGenerate(page, patient.id, { flexible: true });
    await expect(dialog.getByText("Opção A")).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: /^aplicar ao editor$/i }).click();
    await expect(dialog).not.toBeVisible();

    // "Opção A" é o VALOR de um <input>, não texto de conteúdo — localiza pelo
    // aria-label indexado (contrato de seletor já existente) em vez do rótulo em si.
    const optionNameInput = page.getByLabel("Nome da opção 1");
    await expect(optionNameInput).toHaveValue("Opção A", { timeout: 10_000 });
    const mealCard = page.getByRole("article").filter({ has: optionNameInput });
    await expect(mealCard).toBeVisible({ timeout: 10_000 });
    // Badge de estrutura (R6.5.2) continua correto pra uma refeição gerada pelo Copilot.
    await expect(mealCard.locator("span").filter({ hasText: "Opções" })).toBeVisible();
    await expect(mealCard.getByText("ou", { exact: true })).toBeVisible();
  });

  test("R5 COMBINATION: Copilot gera item fixo + grupo de escolha resolvidos, aplica ao Composer com badge Combinação e rótulo Itens fixos", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await seedNutritionRecordForReadiness(request, patient.id);
    await setFixture(request, patient.id, {
      structure: "COMBINATION",
      mealKey: "almoco",
      fixed_items: [{ query: "Arroz, tipo 1, cozido", quantity: 100, unit: "g" }],
      choice_groups: [{
        title: "Proteína",
        min_selections: 1,
        max_selections: 1,
        items: [{ query: "Frango, peito, sem pele, grelhado", quantity: 120, unit: "g" }],
      }],
      optional_items: [],
    });

    const dialog = await openWizardAndGenerate(page, patient.id, { flexible: true });
    await expect(dialog.getByText(/^\d+(–\d+)? kcal$/).first()).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: /^aplicar ao editor$/i }).click();
    await expect(dialog).not.toBeVisible();

    const mealCard = page.getByRole("article").filter({ hasText: "arroz" });
    await expect(mealCard).toBeVisible({ timeout: 10_000 });
    await expect(mealCard.locator("span").filter({ hasText: "Combinação" })).toBeVisible();
    // Rótulo "Itens fixos" (R6.5.2B, seções 22-24) — só aparece quando há grupo de escolha.
    await expect(mealCard.getByText("Itens fixos", { exact: true })).toBeVisible();
    await expect(mealCard.getByText(/escolha de 1 a 1 item/i)).toBeVisible();
  });

  test("R6: item de receita (food_source RECIPE) renderiza no Composer sem quebrar o layout", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const planRes = await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R6.5.2B Recipe" } });
    const plan = await planRes.json() as { id: string; title: string };

    // Cria uma receita mínima real via API pra referenciar (mesmo padrão usado nos testes do R6).
    const recipeTitle = `Receita Composer R6.5.2B ${Date.now()}`;
    const recipeRes = await request.post("/api/admin/recipes", {
      data: {
        title: recipeTitle,
        meal_group: "almoco",
        servings: 2,
        yield_mode: "PORTION_COUNT",
        ingredients: [{ food: "Arroz, tipo 1, cozido", quantity: "200", unit: "g", food_source: "TACO", food_ref_id: "129" }],
      },
    });
    if (!recipeRes.ok()) {
      test.skip(true, `R6 recipes API indisponível nesta linhagem (${recipeRes.status()}: ${await recipeRes.text()}) — marcar R6_COMPATIBILITY como N-A.`);
      return;
    }
    // POST /api/admin/recipes só retorna { id } — o título é o que já enviamos.
    const recipe = await recipeRes.json() as { id: string };

    const putRes = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: {
        title: plan.title, status: "draft",
        meals: [{ name: "Almoço", items: [{ food: recipeTitle, quantity: "1", unit: "porção", food_source: "RECIPE", food_ref_id: recipe.id }] }],
        weekly_slots: [], substitutions: [], supplements: [], expectedVersion: 1,
      },
    });
    expect(putRes.ok(), await putRes.text()).toBeTruthy();

    await openMealPlanTab(page, patient.id);
    const mealCard = page.getByRole("article").filter({ hasText: "Almoço" });
    await expect(mealCard).toBeVisible({ timeout: 10_000 });
    await expect(mealCard.getByText(/kcal estimadas/)).toBeVisible();
    // Estrutura SIMPLE (padrão) continua mostrando o badge correto mesmo com item de receita.
    await expect(mealCard.locator("span").filter({ hasText: "Simples" })).toBeVisible();
  });

  test("quantidade/unidade inline (sem modal) e entrada de sugestões R3 continuam funcionando (comportamento pré-existente, verificado nesta fase)", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const planRes = await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R6.5.2B Inline" } });
    const plan = await planRes.json() as { id: string; title: string };
    const putRes = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: {
        title: plan.title, status: "draft",
        meals: [{ name: "Almoço", items: [{ food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "129" }] }],
        weekly_slots: [], substitutions: [], supplements: [], expectedVersion: 1,
      },
    });
    expect(putRes.ok(), await putRes.text()).toBeTruthy();

    await openMealPlanTab(page, patient.id);
    const mealCard = page.getByRole("article").filter({ hasText: "Almoço" });
    await expect(mealCard).toBeVisible({ timeout: 10_000 });

    // Nenhum diálogo/modal é aberto pra editar quantidade — o próprio menu "Mais ações do
    // alimento" -> "Editar" revela o input real na MESMA linha (comportamento pré-existente).
    await mealCard.getByRole("button", { name: /mais ações do alimento/i }).first().click();
    await mealCard.getByRole("button", { name: /^editar$/i }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const quantityInput = page.locator('input[aria-label="Quantidade"]:visible').first();
    await expect(quantityInput).toBeVisible({ timeout: 10_000 });
    await quantityInput.fill("150");

    const nutritionAside = page.locator("aside", { hasText: "Plano do dia" });
    await expect(async () => {
      const text = await nutritionAside.textContent();
      expect(text).toContain("kcal");
    }).toPass({ timeout: 10_000 });

    // Entrada de sugestões R3 (Trocar/Revisar trocas) continua acessível na linha, sem CTA duplicada.
    const trocasButtons = mealCard.getByRole("button", { name: /trocas/i });
    expect(await trocasButtons.count()).toBeGreaterThan(0);
  });

  test("toolbar do Composer: status Rascunho/Ativo, feedback de salvamento, e uma única ação primária já existem (verificado, não reconstruído)", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const planRes = await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R6.5.2B Toolbar" } });
    expect(planRes.ok()).toBeTruthy();

    await openMealPlanTab(page, patient.id);
    await expect(page.getByText(/^Rascunho - v1 · /)).toBeVisible({ timeout: 10_000 });

    // Uma única ação visualmente primária (brand-btn-primary) na barra sticky do plano
    // (escopado à barra, já que a página tem outros CTAs primários fora do Composer).
    const stickyBar = page.locator("div.sticky.top-2");
    const primaryButtons = stickyBar.locator(".brand-btn-primary");
    expect(await primaryButtons.count()).toBe(1);
    await expect(primaryButtons.first()).toHaveText(/revisar/i);

    // "Usar modelo" reaproveita o R4 (mesmo botão/drawer, nenhum sistema paralelo).
    await expect(page.getByRole("button", { name: "Usar modelo" })).toBeVisible();
    // "Criar com IA" reaproveita o wizard R5 (mesmo botão/fluxo, nenhuma CTA de IA paralela).
    await expect(page.getByRole("button", { name: /^criar com ia$/i })).toBeVisible();
  });
});
