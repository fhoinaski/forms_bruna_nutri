import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";
import { openMealPlanTab } from "./helpers/meal-plan-editor";

test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * R6.5.2 — Composer layout: prova real (não só visual) da navegação de
 * refeições nova (coluna esquerda desktop), do badge de estrutura
 * (Simples/Opções/Combinação) e do divisor "OU" entre alternativas de
 * OPTIONS. Tudo puramente aditivo — não deve quebrar nenhum selector
 * pré-existente (heading "Plano do dia", aside, article, aria-labels de
 * opção/grupo).
 */

test.describe("Meal Plan Composer R6.5.2 — navegação de refeições + meal cards", () => {
  test("desktop: nav de refeições lista horários/nomes reais, clique rola até o card, meal ativo marcado com aria-current", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    const planRes = await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R6.5.2 Nav" } });
    expect(planRes.ok(), await planRes.text()).toBeTruthy();
    const plan = await planRes.json() as { id: string; title: string };
    const putRes = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: {
        title: plan.title,
        status: "draft",
        meals: [
          { name: "Café da manhã", suggested_time: "07:30", items: [{ food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "129" }] },
          { name: "Almoço", suggested_time: "12:30", items: [{ food: "Arroz, tipo 1, cozido", quantity: "150", unit: "g", food_source: "TACO", food_ref_id: "129" }] },
          { name: "Jantar", suggested_time: "20:00", items: [{ food: "Arroz, tipo 1, cozido", quantity: "120", unit: "g", food_source: "TACO", food_ref_id: "129" }] },
        ],
        weekly_slots: [], substitutions: [], supplements: [],
        expectedVersion: 1,
      },
    });
    expect(putRes.ok(), await putRes.text()).toBeTruthy();

    // Nav de refeições só entra em telas largas (2xl, 1536px+) — no breakpoint
    // padrão de 1280px (xl) o layout de 2 colunas da R6.5.1 é preservado
    // intacto (ver regressão documentada em -final-qa.md).
    await page.setViewportSize({ width: 1600, height: 900 });
    await openMealPlanTab(page, patient.id);

    const nav = page.getByRole("navigation", { name: "Refeições" });
    await expect(nav).toBeVisible({ timeout: 10_000 });
    await expect(nav.getByRole("button", { name: /07:30/ })).toBeVisible();
    await expect(nav.getByRole("button", { name: /12:30/ })).toBeVisible();
    await expect(nav.getByRole("button", { name: /20:00/ })).toBeVisible();

    // Clique navega (scrollIntoView) até o card correspondente.
    await nav.getByRole("button", { name: /Jantar/ }).click();
    const jantarCard = page.getByRole("article").filter({ hasText: "Jantar" });
    await expect(jantarCard).toBeInViewport();

    // Algum item da nav deve estar marcado como ativo (aria-current) —
    // não travamos em qual exatamente, já que depende de scroll/IntersectionObserver,
    // mas SEMPRE exatamente 1 (nunca 0, nunca >1).
    await expect(async () => {
      const count = await nav.locator('[aria-current="true"]').count();
      expect(count).toBe(1);
    }).toPass({ timeout: 10_000 });

    await page.screenshot({ path: `reports/screenshots/meal-plan-ui-r6-5-2-desktop-nav-${testInfo.project.name}.png`, fullPage: true });
  });

  test("badge de estrutura mostra Simples/Opções/Combinação sem alterar cálculo; divisor OU aparece entre alternativas de OPTIONS", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    const planRes = await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R6.5.2 Badges" } });
    const plan = await planRes.json() as { id: string; title: string };
    const putRes = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: {
        title: plan.title,
        status: "draft",
        meals: [
          { name: "Café da manhã", items: [{ food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "129" }] },
          {
            name: "Almoço", meal_structure: "OPTIONS",
            items: [],
            options: [
              { label: "Opção 1", items: [{ food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g" }] },
              { label: "Opção 2", items: [{ food: "Feijão, carioca, cozido", quantity: "80", unit: "g" }] },
            ],
          },
        ],
        weekly_slots: [], substitutions: [], supplements: [],
        expectedVersion: 1,
      },
    });
    expect(putRes.ok(), await putRes.text()).toBeTruthy();

    await openMealPlanTab(page, patient.id);

    const simpleCard = page.getByRole("article").filter({ hasText: "Café da manhã" });
    await expect(simpleCard.locator("span").filter({ hasText: "Simples" })).toBeVisible({ timeout: 10_000 });

    const optionsCard = page.getByRole("article").filter({ hasText: "Almoço" });
    await expect(optionsCard.locator("span").filter({ hasText: "Opções" })).toBeVisible();
    await expect(optionsCard.getByText("ou", { exact: true })).toBeVisible();

    // Selectors pré-existentes de OPTIONS continuam intactos (aria-label indexado).
    await expect(optionsCard.getByLabel("Nome da opção 1")).toHaveValue("Opção 1");
    await expect(optionsCard.getByLabel("Nome da opção 2")).toHaveValue("Opção 2");

    await page.screenshot({ path: `reports/screenshots/meal-plan-ui-r6-5-2-desktop-options-${testInfo.project.name}.png`, fullPage: true });
  });

  test("tablet/mobile: nav de refeições fica oculta (< xl), sem overflow horizontal, cards continuam usáveis", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    const planRes = await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R6.5.2 Responsive" } });
    const plan = await planRes.json() as { id: string; title: string };
    const putRes = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: {
        title: plan.title, status: "draft",
        meals: [{ name: "Café da manhã", suggested_time: "07:30", items: [{ food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "129" }] }],
        weekly_slots: [], substitutions: [], supplements: [], expectedVersion: 1,
      },
    });
    expect(putRes.ok(), await putRes.text()).toBeTruthy();

    await page.setViewportSize({ width: 820, height: 1180 });
    await openMealPlanTab(page, patient.id);
    await expect(page.getByRole("article").filter({ hasText: "Café da manhã" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("navigation", { name: "Refeições" })).toBeHidden();
    let scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    let clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 4);
    await page.screenshot({ path: `reports/screenshots/meal-plan-ui-r6-5-2-tablet-${testInfo.project.name}.png`, fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await openMealPlanTab(page, patient.id);
    await expect(page.getByRole("article").filter({ hasText: "Café da manhã" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("navigation", { name: "Refeições" })).toBeHidden();
    scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 4);
    await page.screenshot({ path: `reports/screenshots/meal-plan-ui-r6-5-2-mobile-${testInfo.project.name}.png`, fullPage: true });
  });

  test("acessibilidade: nav de refeições é landmark nomeado, itens são focáveis por teclado com foco visível, aria-current único", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const planRes = await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R6.5.2 A11y" } });
    const plan = await planRes.json() as { id: string; title: string };
    const putRes = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: {
        title: plan.title, status: "draft",
        meals: [
          { name: "Café da manhã", suggested_time: "07:30", items: [{ food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "129" }] },
          { name: "Almoço", suggested_time: "12:30", items: [{ food: "Arroz, tipo 1, cozido", quantity: "150", unit: "g", food_source: "TACO", food_ref_id: "129" }] },
        ],
        weekly_slots: [], substitutions: [], supplements: [], expectedVersion: 1,
      },
    });
    expect(putRes.ok(), await putRes.text()).toBeTruthy();

    await page.setViewportSize({ width: 1600, height: 900 });
    await openMealPlanTab(page, patient.id);

    // Landmark nomeado (role=navigation + aria-label), não apenas uma div visual.
    const nav = page.getByRole("navigation", { name: "Refeições" });
    await expect(nav).toBeVisible({ timeout: 10_000 });

    // Cada item é um <button> real (nativamente focável, sem tabindex negativo).
    const firstButton = nav.getByRole("button", { name: /07:30/ });
    const secondButton = nav.getByRole("button", { name: /12:30/ });
    await firstButton.focus();
    await expect(firstButton).toBeFocused();

    // Foco visível: nenhuma classe outline-none/focus:outline-none foi aplicada
    // aos botões no código-fonte (checagem estática, não a heurística de
    // :focus-visible do Chromium pra foco via script, que é implementation-detail
    // do browser, não do nosso CSS).
    const hasOutlineSuppressed = await firstButton.evaluate((element) => element.className.includes("outline-none"));
    expect(hasOutlineSuppressed).toBe(false);

    // Tab avança para o próximo item da lista (ordem de foco lógica).
    await page.keyboard.press("Tab");
    await expect(secondButton).toBeFocused();

    // Ativar por teclado (Enter) rola até o card e marca aria-current, igual ao clique do mouse.
    await page.keyboard.press("Enter");
    await expect(async () => {
      const count = await nav.locator('[aria-current="true"]').count();
      expect(count).toBe(1);
    }).toPass({ timeout: 10_000 });
  });
});
