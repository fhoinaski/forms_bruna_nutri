import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient, enablePortalAccess } from "./helpers/test-data";

/**
 * Substituições nutricionais equivalentes — fluxo manual completo, print,
 * portal, locks e mobile (seção 1 do pedido de fechamento de gaps).
 *
 * Fora de escopo aqui (documentado no relatório, não fingido): sugestão via
 * IA/wizard e proposal via Assistente real dependem de um provider de IA
 * configurado e são fluxos mais longos/instáveis para E2E — cobertos por
 * testes unitários determinísticos (tests/meal-plan-change-substitutions.test.ts)
 * em vez de aqui.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("substituições nutricionais equivalentes", () => {
  async function openTemplateItemAlternatives(page: Page, foodName: string) {
    const input = page.locator(`input[title="${foodName}"]`).first();
    await expect(input).toBeVisible({ timeout: 30_000 });
    const row = input.locator("xpath=ancestor::div[contains(@class, 'relative') and contains(@class, 'grid')][1]");
    await row.getByRole("button", { name: /^alternativas$/i }).click();
    return row;
  }

  async function expectGeneratedAlternatives(row: Locator) {
    const generateButton = row.getByRole("button", { name: /gerar|gerar novas/i }).last();
    if (await generateButton.isVisible().catch(() => false)) {
      await generateButton.click();
    }
    await expect(row.getByText(/alternativas diretas|outras equivalências|alternativas aprovadas/i).first()).toBeVisible({ timeout: 20_000 });
  }

  async function expectNoPatientDebugWords(page: Page) {
    const text = await page.locator("body").innerText();
    expect(text.toLowerCase()).not.toMatch(/\b(pilot|curated|engine|ranking|strategy|debug)\b/);
  }

  async function openManualAlternativeSearch(card: Locator) {
    await card.getByRole("button", { name: /\+ adicionar alternativa/i }).click();
    await expect(card.getByPlaceholder(/nome do alimento/i)).toBeVisible();
  }

  test("template adulto saudável: pão, ovo e banana geram alternativas persistidas", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible({ timeout: 30_000 });

    for (const foodName of ["Pao de forma integral", "Ovo de galinha inteiro cozido", "Banana prata"]) {
      const row = await openTemplateItemAlternatives(page, foodName);
      await expectGeneratedAlternatives(row);
    }

    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    for (const foodName of ["Pao de forma integral", "Ovo de galinha inteiro cozido", "Banana prata"]) {
      const row = await openTemplateItemAlternatives(page, foodName);
      await expect(row.getByText(/alternativas diretas|outras equivalências|alternativas aprovadas/i).first()).toBeVisible({ timeout: 20_000 });
    }
  });

  test("adiciona arroz, busca e adiciona uma substituição manual, salva, recarrega e a substituição persiste", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const foodInput = page.getByPlaceholder("Buscar alimento").last();
    await foodInput.fill("Arroz, tipo 1, cozido");
    const suggestion = page.locator("button", { hasText: /arroz[,\s]+tipo\s*1[,\s]+cozido/i }).first();
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await page.getByPlaceholder("Qtd.").last().fill("100");
    await page.locator('select[title*="Medida"]').last().selectOption("__grams__");

    // Abre o painel de substituições do item recém-adicionado.
    const newMealCard = page.locator("article").filter({ has: page.getByPlaceholder("Buscar alimento") }).last();
    await newMealCard.getByRole("button", { name: /alternativas/i }).click();
    await openManualAlternativeSearch(newMealCard);

    const substQuery = newMealCard.getByPlaceholder(/nome do alimento/i);
    await substQuery.fill("Batata, inglesa, cozida");
    await newMealCard.getByRole("button", { name: /^buscar$/i }).click();

    // A quantidade calculada aparece — nunca vinda da IA, sempre da engine.
    const resultRow = newMealCard.getByText(/batata inglesa cozida — \d+ g/i);
    await expect(resultRow).toBeVisible({ timeout: 15_000 });
    await newMealCard.getByRole("button", { name: "+ adicionar", exact: true }).click();
    await expect(newMealCard.getByText(/batata inglesa cozida/i)).toBeVisible();

    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    const reloadedMealCard = page.locator("article").filter({ has: page.getByPlaceholder("Buscar alimento") }).last();
    await reloadedMealCard.getByRole("button", { name: /alternativas/i }).click();
    await expect(reloadedMealCard.getByText(/batata inglesa cozida/i)).toBeVisible();
  });

  test("item com quantidade bloqueada (🔒) persiste o lock após salvar e recarregar", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const foodInput = page.getByPlaceholder("Buscar alimento").last();
    await foodInput.fill("Arroz, tipo 1, cozido");
    await page.locator("button", { hasText: /arroz[,\s]+tipo\s*1[,\s]+cozido/i }).first().click();
    await page.getByPlaceholder("Qtd.").last().fill("100");
    await page.locator('select[title*="Medida"]').last().selectOption("__grams__");

    const newMealCard = page.locator("article").filter({ has: page.getByPlaceholder("Buscar alimento") }).last();
    await newMealCard.getByRole("button", { name: /mais ações do alimento/i }).click();
    await newMealCard.getByRole("button", { name: /bloquear quantidade/i }).click();
    await newMealCard.getByRole("button", { name: /mais ações do alimento/i }).click();
    await expect(newMealCard.getByRole("button", { name: /desbloquear quantidade/i })).toBeVisible();
    await newMealCard.getByRole("button", { name: /mais ações do alimento/i }).click();

    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    const reloadedMealCard = page.locator("article").filter({ has: page.getByPlaceholder("Buscar alimento") }).last();
    await reloadedMealCard.getByRole("button", { name: /mais ações do alimento/i }).click();
    await expect(reloadedMealCard.getByRole("button", { name: /desbloquear quantidade/i })).toBeVisible();
  });

  test("print mostra substituição aprovada inline e o total do plano não soma a alternativa", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const foodInput = page.getByPlaceholder("Buscar alimento").last();
    await foodInput.fill("Arroz, tipo 1, cozido");
    await page.locator("button", { hasText: /arroz[,\s]+tipo\s*1[,\s]+cozido/i }).first().click();
    await page.getByPlaceholder("Qtd.").last().fill("100");
    await page.locator('select[title*="Medida"]').last().selectOption("__grams__");

    const newMealCard = page.locator("article").filter({ has: page.getByPlaceholder("Buscar alimento") }).last();
    const kcalMetric = page.getByText(/^\d+ kcal$/).first();
    await expect(kcalMetric).toBeVisible();
    const totalBefore = Number(((await kcalMetric.textContent()) ?? "").replace(/\D/g, "") || "0");

    await newMealCard.getByRole("button", { name: /alternativas/i }).click();
    await openManualAlternativeSearch(newMealCard);
    await newMealCard.getByPlaceholder(/nome do alimento/i).fill("Batata, inglesa, cozida");
    await newMealCard.getByRole("button", { name: /^buscar$/i }).click();
    await expect(newMealCard.getByText(/batata inglesa cozida — \d+ g/i)).toBeVisible({ timeout: 15_000 });
    await newMealCard.getByRole("button", { name: "+ adicionar", exact: true }).click();

    // Total do plano continua igual — a alternativa nunca é somada (seção 16/33).
    await expect(kcalMetric).toHaveText(`${totalBefore} kcal`);

    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();
    await page.getByRole("button", { name: /^ativar no portal$/i }).click();
    await expect(page.getByText(/^plano ativado no portal do cliente\.$/i)).toBeVisible();

    const printPage = await page.context().newPage();
    await printPage.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar`);
    await expect(printPage.getByText(/pode substituir por/i).first()).toBeVisible();
    await expect(printPage.getByText(/batata inglesa cozida/i).first()).toBeVisible();
    await printPage.close();
  });

  test("portal mostra a substituição aprovada", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const foodInput = page.getByPlaceholder("Buscar alimento").last();
    await foodInput.fill("Arroz, tipo 1, cozido");
    await page.locator("button", { hasText: /arroz[,\s]+tipo\s*1[,\s]+cozido/i }).first().click();
    await page.getByPlaceholder("Qtd.").last().fill("100");
    await page.locator('select[title*="Medida"]').last().selectOption("__grams__");

    const newMealCard = page.locator("article").filter({ has: page.getByPlaceholder("Buscar alimento") }).last();
    await newMealCard.getByRole("button", { name: /alternativas/i }).click();
    await openManualAlternativeSearch(newMealCard);
    await newMealCard.getByPlaceholder(/nome do alimento/i).fill("Batata, inglesa, cozida");
    await newMealCard.getByRole("button", { name: /^buscar$/i }).click();
    await expect(newMealCard.getByText(/batata inglesa cozida — \d+ g/i)).toBeVisible({ timeout: 15_000 });
    await newMealCard.getByRole("button", { name: "+ adicionar", exact: true }).click();

    await page.getByRole("button", { name: /^ativar no portal$/i }).click();
    await expect(page.getByText(/^plano ativado no portal do cliente\.$/i)).toBeVisible();

    await page.goto("/portal");
    await page.getByPlaceholder("seunome@email.com").fill(patient.email);
    await page.getByPlaceholder("BF-0000-0000").fill(code);
    await page.getByRole("button", { name: /acessar meu portal/i }).click();

    await expect(page.getByRole("heading", { name: /grupos de troca aprovados/i })).toBeVisible();
    await expect(page.getByText(/batata inglesa cozida/i).first()).toBeVisible();
  });

  test("pilot crítico: template, gera, aprova, salva, recarrega, publica, portal e print sem termos internos", async ({ page, request }) => {
    test.setTimeout(60_000);
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible({ timeout: 30_000 });

    const row = await openTemplateItemAlternatives(page, "Pao de forma integral");
    await expectGeneratedAlternatives(row);
    const mealCard = row.locator("xpath=ancestor::article[1]");
    if (!await mealCard.getByText(/alternativas aprovadas/i).isVisible().catch(() => false)) {
      await mealCard.locator('input[type="checkbox"]').first().check();
      await mealCard.getByRole("button", { name: /aprovar selecionadas/i }).click();
    }
    await expect(mealCard.getByText(/alternativas aprovadas/i)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^ativar no portal$/i }).click();
    await expect(page.getByText(/^plano ativado no portal do cliente\.$/i)).toBeVisible();

    await page.goto("/portal");
    await page.getByPlaceholder("seunome@email.com").fill(patient.email);
    await page.getByPlaceholder("BF-0000-0000").fill(code);
    await page.getByRole("button", { name: /acessar meu portal/i }).click();
    await expect(page.getByRole("heading", { name: /grupos de troca aprovados/i })).toBeVisible();
    await expectNoPatientDebugWords(page);

    const printPage = await page.context().newPage();
    await printPage.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar`);
    await expect(printPage.getByText(/pode substituir por/i).first()).toBeVisible();
    await expectNoPatientDebugWords(printPage);
    await printPage.close();
  });

  test("mobile (390px): painel de substituições não gera overflow horizontal", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const patient = await createTestPatient(request);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const foodInput = page.getByPlaceholder("Buscar alimento").last();
    await foodInput.fill("Arroz, tipo 1, cozido");
    await page.locator("button", { hasText: /arroz[,\s]+tipo\s*1[,\s]+cozido/i }).first().click();
    await page.getByPlaceholder("Qtd.").last().fill("100");
    await page.locator('select[title*="Medida"]').last().selectOption("__grams__");

    const newMealCard = page.locator("article").filter({ has: page.getByPlaceholder("Buscar alimento") }).last();
    await newMealCard.getByRole("button", { name: /alternativas/i }).click();
    await openManualAlternativeSearch(newMealCard);
    await expect(newMealCard.getByPlaceholder(/nome do alimento/i)).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
