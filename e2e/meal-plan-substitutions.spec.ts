import { test, expect } from "./fixtures";
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
  test("adiciona arroz, busca e adiciona uma substituição manual, salva, recarrega e a substituição persiste", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const foodInput = page.getByPlaceholder("Buscar alimento").last();
    await foodInput.fill("Arroz, tipo 1, cozido");
    const suggestion = page.locator("button", { hasText: /arroz[,\s]+tipo\s*1[,\s]+cozido/i }).first();
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await page.getByPlaceholder("Qtd.").last().fill("100");
    await page.locator('select[title*="Medida"]').last().selectOption("__grams__");

    // Abre o painel de substituições do item recém-adicionado.
    const newMealCard = page.locator("article").last();
    await newMealCard.getByRole("button", { name: /substituições equivalentes/i }).click();

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
    const reloadedMealCard = page.locator("article").last();
    await reloadedMealCard.getByRole("button", { name: /substituições equivalentes/i }).click();
    await expect(reloadedMealCard.getByText(/batata inglesa cozida/i)).toBeVisible();
  });

  test("item com quantidade bloqueada (🔒) persiste o lock após salvar e recarregar", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const foodInput = page.getByPlaceholder("Buscar alimento").last();
    await foodInput.fill("Arroz, tipo 1, cozido");
    await page.locator("button", { hasText: /arroz[,\s]+tipo\s*1[,\s]+cozido/i }).first().click();
    await page.getByPlaceholder("Qtd.").last().fill("100");
    await page.locator('select[title*="Medida"]').last().selectOption("__grams__");

    const newMealCard = page.locator("article").last();
    const lockButton = newMealCard.getByRole("button", { name: /manter quantidade/i });
    await lockButton.click();
    await expect(newMealCard.getByRole("button", { name: /desbloquear quantidade/i })).toBeVisible();

    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    const reloadedMealCard = page.locator("article").last();
    await expect(reloadedMealCard.getByRole("button", { name: /desbloquear quantidade/i })).toBeVisible();
  });

  test("print mostra 'Opções de substituição' e o total do plano não soma a alternativa", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const foodInput = page.getByPlaceholder("Buscar alimento").last();
    await foodInput.fill("Arroz, tipo 1, cozido");
    await page.locator("button", { hasText: /arroz[,\s]+tipo\s*1[,\s]+cozido/i }).first().click();
    await page.getByPlaceholder("Qtd.").last().fill("100");
    await page.locator('select[title*="Medida"]').last().selectOption("__grams__");

    const newMealCard = page.locator("article").last();
    const kcalMetric = page.getByText(/^\d+ kcal$/).first();
    await expect(kcalMetric).toBeVisible();
    const totalBefore = Number(((await kcalMetric.textContent()) ?? "").replace(/\D/g, "") || "0");

    await newMealCard.getByRole("button", { name: /substituições equivalentes/i }).click();
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
    await expect(printPage.getByText(/opções de substituição/i)).toBeVisible();
    await expect(printPage.getByText(/pode substituir por uma das opções/i)).toBeVisible();
    await expect(printPage.getByText(/batata inglesa cozida/i)).toBeVisible();
    await printPage.close();
  });

  test("portal mostra a substituição aprovada", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const foodInput = page.getByPlaceholder("Buscar alimento").last();
    await foodInput.fill("Arroz, tipo 1, cozido");
    await page.locator("button", { hasText: /arroz[,\s]+tipo\s*1[,\s]+cozido/i }).first().click();
    await page.getByPlaceholder("Qtd.").last().fill("100");
    await page.locator('select[title*="Medida"]').last().selectOption("__grams__");

    const newMealCard = page.locator("article").last();
    await newMealCard.getByRole("button", { name: /substituições equivalentes/i }).click();
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

    await expect(page.getByRole("heading", { name: /opções de substituição/i })).toBeVisible();
    await expect(page.getByText(/batata inglesa cozida/i)).toBeVisible();
  });

  test("mobile (390px): painel de substituições não gera overflow horizontal", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const patient = await createTestPatient(request);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const foodInput = page.getByPlaceholder("Buscar alimento").last();
    await foodInput.fill("Arroz, tipo 1, cozido");
    await page.locator("button", { hasText: /arroz[,\s]+tipo\s*1[,\s]+cozido/i }).first().click();
    await page.getByPlaceholder("Qtd.").last().fill("100");
    await page.locator('select[title*="Medida"]').last().selectOption("__grams__");

    const newMealCard = page.locator("article").last();
    await newMealCard.getByRole("button", { name: /substituições equivalentes/i }).click();
    await expect(newMealCard.getByPlaceholder(/nome do alimento/i)).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
