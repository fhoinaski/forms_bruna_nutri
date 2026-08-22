import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

/**
 * Food Preparation Engine V1 — prova fim-a-fim que um preparo composto sem
 * referência direta no catálogo ("ovo mexido") NUNCA cai de volta pra "ovo
 * cru"/"ovo cozido" sozinho: vira PREPARATION_NEEDS_REVIEW, e só é
 * calculado quando a nutricionista escolhe uma receita REAL cadastrada
 * (mesmo Recipe Engine já usado em todo o resto do sistema — nunca um
 * mecanismo paralelo). A fixture só fornece a query PROPOSTA pela IA;
 * resolução/receita/cálculo nutricional são 100% código de produção.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("wizard Criar com IA — revisão de preparo composto (ovo mexido)", () => {
  test('"ovo mexido" sem referência direta pede revisão; escolher a receita real expande os ingredientes e calcula pela engine real', async ({ page, request }) => {
    const recipeRes = await request.post("/api/admin/recipes", {
      data: {
        title: "Ovo mexido padrão",
        meal_group: "cafe_da_manha",
        servings: 1,
        ingredients: [
          { taco_number: 489, food_name: "Ovo, de galinha, inteiro, cru", grams: 100 },
          { taco_number: 261, food_name: "Manteiga, com sal", grams: 5 },
        ],
      },
    });
    expect(recipeRes.ok(), await recipeRes.text()).toBeTruthy();

    const patient = await createTestPatient(request);
    const fixtureRes = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
      data: {
        clientId: patient.id,
        meals: [
          {
            mealKey: "cafe_da_manha",
            recipeId: null,
            items: [{ query: "ovo mexido", quantity: 2, unit: "unidade" }],
            rationale: "Proteína do café da manhã.",
          },
        ],
      },
    });
    expect(fixtureRes.ok(), await fixtureRes.text()).toBeTruthy();

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar com ia$/i }).click();

    const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();

    // Preparo composto sem referência direta -> "precisa de revisão", NUNCA
    // vira "ovo cru"/"ovo cozido" sozinho.
    await expect(dialog.getByText(/precisa de revisão/i)).toBeVisible({ timeout: 20_000 });
    const reviewPanel = dialog.locator("text=Precisa de revisão").locator("..");
    await expect(reviewPanel.getByText(/["“]ovo mexido["”]/i).first()).toBeVisible();

    const useRecipeButton = reviewPanel.getByRole("button", { name: /^usar receita$/i }).first();
    await expect(useRecipeButton).toBeVisible();
    await useRecipeButton.click();

    // Painel some, ingredientes reais (ovo + manteiga) entram no cálculo —
    // nunca a preparação "fornecendo" kcal por si só.
    await expect(dialog.getByText(/precisa de revisão/i)).not.toBeVisible();
    const kcalMetric = dialog.getByText(/^\d+ kcal$/).first();
    await expect(kcalMetric).toBeVisible();
    const kcalAfter = Number(((await kcalMetric.textContent()) ?? "").replace(/\D/g, "") || "0");
    expect(kcalAfter).toBeGreaterThan(0);
    await expect(dialog.getByText(/ovo,?\s*de galinha,?\s*inteiro,?\s*cru/i)).toBeVisible();
    await expect(dialog.getByText(/manteiga,?\s*com sal/i)).toBeVisible();

    await dialog.getByRole("button", { name: /^aplicar ao editor$/i }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();

    // Paridade: reload/print mostram exatamente o que foi calculado no wizard.
    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByText(/^\d+ kcal$/).first()).toHaveText(`${kcalAfter} kcal`);

    await page.getByRole("button", { name: /^ativar no portal$/i }).click();
    await expect(page.getByText(/^plano ativado no portal do cliente\.$/i)).toBeVisible();

    const printPage = await page.context().newPage();
    await printPage.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar`);
    await expect(printPage.getByText(/ovo,?\s*de galinha,?\s*inteiro,?\s*cru/i)).toBeVisible();
    await expect(printPage.getByText(new RegExp(`${kcalAfter}\\s*kcal`, "i")).first()).toBeVisible();
    await printPage.close();
  });
});
