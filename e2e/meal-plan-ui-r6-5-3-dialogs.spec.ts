import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";
import { addMeal, openMealPlanTab, selectFood, setLastQuantity } from "./helpers/meal-plan-editor";

test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * R6.5.3 — prova real do hook de teclado compartilhado (`useDialogKeyboard`)
 * extraído do drawer de trocas/biblioteca de reuso, e RETROFITADO no
 * Assistente de IA e no modal "Inserir receita" (nenhum dos dois tinha
 * Escape/Tab-trap antes desta fase — achado real da auditoria). Também
 * prova que o botão "Inserir receita" não mostra mais o "x" literal.
 */

test.describe("Meal Plan Composer R6.5.3 — teclado unificado nos diálogos", () => {
  test("Assistente de IA: Escape fecha o wizard (antes não fechava por teclado)", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();

    await page.getByRole("button", { name: /^criar com ia$/i }).click();
    const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("Assistente de IA: Tab não escapa do wizard (focus trap)", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();

    await page.getByRole("button", { name: /^criar com ia$/i }).click();
    const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    await expect(dialog).toBeVisible();

    // Foca o último elemento focável do diálogo e confirma que Tab
    // devolve o foco pro primeiro (nunca escapa pro resto da página).
    const focusable = dialog.locator('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const count = await focusable.count();
    expect(count).toBeGreaterThan(0);
    await focusable.nth(count - 1).focus();
    await page.keyboard.press("Tab");
    const activeInsideDialog = await dialog.evaluate((node) => node.contains(document.activeElement));
    expect(activeInsideDialog).toBe(true);
  });

  test("Inserir receita: fecha com ícone real (não mais o 'x' literal), Escape fecha o modal", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    await page.getByRole("button", { name: /^inserir receita$/i }).click();
    const dialog = page.getByRole("dialog", { name: /inserir receita/i });
    await expect(dialog).toBeVisible();

    // O botão de fechar continua com aria-label "Fechar", mas agora renderiza
    // um ícone svg real — não mais o texto literal "x".
    const closeButton = dialog.getByRole("button", { name: "Fechar" });
    await expect(closeButton).toBeVisible();
    await expect(closeButton.locator("svg")).toHaveCount(1);
    await expect(closeButton).not.toHaveText("x");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("drawer de trocas e biblioteca de reuso continuam com Escape/foco funcionando (regressão do hook compartilhado)", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    const meal = await addMeal(page, "Jantar R6.5.3");
    await selectFood(page, meal, "Arroz, tipo 1, cozido", /arroz/i);
    await setLastQuantity(meal, "100");
    await meal.locator('input[aria-label="Quantidade"]:visible').last().blur();

    // Drawer de trocas — o item recém-adicionado ainda está em modo de edição
    // (botão "Trocas"), não colapsado ("Revisar trocas de ..."); qualquer um
    // dos dois abre o mesmo drawer.
    await meal.getByRole("button", { name: /trocas/i }).last().click();
    const exchangeDialog = page.getByRole("dialog", { name: /arroz/i });
    await expect(exchangeDialog).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await expect(exchangeDialog).toBeHidden();

    // Biblioteca de reuso.
    await page.getByRole("button", { name: "Usar modelo" }).click();
    const reuseDialog = page.getByRole("dialog", { name: "Biblioteca de reuso" });
    await expect(reuseDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(reuseDialog).toBeHidden();
  });
});
