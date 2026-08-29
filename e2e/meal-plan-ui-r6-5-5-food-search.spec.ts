import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * R6.5.5 — Food Search: compactação visual da linha de resultado (nome +
 * "Adicionar" + preparo/fonte + porção, SEM a linha de kcal/P/C/G — busca é
 * pra escolher identidade, não fazer análise nutricional, seção 12 do
 * pedido), skeleton de carregamento (3 linhas compactas, não spinner/texto
 * solto), e mensagem de vazio em 2 linhas. Nenhuma mudança de lógica de
 * busca/debounce/resolução canônica — só JSX/CSS sobre o combobox existente.
 */

async function createDraft(request: Parameters<typeof createTestPatient>[0], patientId: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R6.5.5 Food Search" } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function openFirstFoodEditor(page: import("@playwright/test").Page, patientId: string) {
  await page.goto(`/dashboard/clients/${patientId}`);
  await page.getByRole("tab", { name: "Plano alimentar" }).click();
  await page.getByRole("button", { name: /mais ações do alimento/i }).first().click();
  await page.getByRole("button", { name: /^editar$/i }).click();
  return page.locator('input[aria-label="Alimento"]').first();
}

test.describe("Meal Plan Composer R6.5.5 — Food Search compacto", () => {
  test("linha de resultado mostra nome + 'Adicionar' + preparo/fonte + porção, sem linha de macros", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createDraft(request, patient.id);
    const input = await openFirstFoodEditor(page, patient.id);

    await input.fill("arroz");
    const option = page.locator('[role="option"]:visible').first();
    await expect(option).toBeVisible();

    // Nome + afordance "Adicionar" continuam na MESMA linha clicável (não um botão aninhado separado).
    await expect(option.getByText("Adicionar", { exact: true })).toBeVisible();
    // Fonte continua visível (contrato do teste F4 pré-existente, reconfirmado).
    await expect(option).toContainText(/TACO|IBGE|TBCA|USDA/i);
    // A linha de preview de macros (kcal/P/C/G) foi removida — nenhum texto "kcal" dentro da opção.
    await expect(option.getByText(/kcal/i)).toHaveCount(0);
  });

  test("estado de carregamento mostra skeleton (role=status), não spinner grande nem só texto 'Buscando...'", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createDraft(request, patient.id);
    const input = await openFirstFoodEditor(page, patient.id);

    // Intercepta a busca real pra manter o estado de loading visível tempo suficiente pra asserção.
    await page.route("**/api/admin/foods/search**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });

    await input.fill("arroz");
    const loading = page.getByRole("status", { name: "Buscando alimentos" });
    await expect(loading).toBeVisible();
    await expect(page.getByText("Buscando...", { exact: true })).toHaveCount(0);
  });

  test("estado vazio mostra mensagem em 2 linhas com orientação", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createDraft(request, patient.id);
    const input = await openFirstFoodEditor(page, patient.id);

    await input.fill("xyzalimentoinexistente123");
    await expect(page.getByText("Nenhum alimento encontrado.", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Tente outro nome ou preparação.", { exact: true })).toBeVisible();
  });
});
