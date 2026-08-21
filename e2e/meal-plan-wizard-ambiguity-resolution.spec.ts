import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

/**
 * UI de resolução de ambiguidade no wizard (item 8 do backlog de UX —
 * "mostrar candidatos e permitir seleção inline, sem regenerar o plano
 * inteiro"). Auditoria encontrou que a UI (pickCandidate/removeNeedsReview
 * em AiMealPlanWizard.tsx + painel "Precisa de revisão") já existia,
 * completa, de uma rodada anterior — nunca tinha E2E provando que funciona
 * fim-a-fim com o resolver real. Este arquivo fecha essa lacuna, reusando a
 * MESMA infraestrutura de fixture do meal-plan-draft-agent (fixture só
 * fornece a query PROPOSTA pela IA — "batata" sozinha, sabidamente
 * ambígua no catálogo real, ver tests/food-resolver-v2.test.ts — a
 * resolução/candidatos/cálculo nutricional são 100% código de produção).
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("wizard Criar com IA — resolução inline de ambiguidade", () => {
  test("escolher um candidato resolve o item e recalcula sem regenerar o resto do plano", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    const fixtureRes = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
      data: {
        clientId: patient.id,
        meals: [
          {
            mealKey: "almoco",
            recipeId: null,
            items: [
              { query: "Arroz, tipo 1, cozido", quantity: 100, unit: "g" },
              { query: "batata", quantity: 100, unit: "g" },
            ],
            rationale: "Carboidrato principal do almoço.",
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

    // Item resolvido sem ambiguidade entra normalmente no cálculo.
    await expect(dialog.getByText(/arroz,?\s*tipo 1,?\s*cozido/i)).toBeVisible({ timeout: 20_000 });

    // Item ambíguo ("batata" sozinha, catálogo real tem múltiplos candidatos)
    // vira "precisa de revisão", nunca é auto-resolvido/adivinhado.
    const reviewPanel = dialog.locator("text=Precisa de revisão").locator("..");
    await expect(reviewPanel).toBeVisible();
    await expect(reviewPanel.getByText(/["“]batata["”]/i).first()).toBeVisible();

    const kcalMetric = dialog.getByText(/^\d+ kcal$/).first();
    await expect(kcalMetric).toBeVisible();
    const kcalBeforePick = Number(((await kcalMetric.textContent()) ?? "").replace(/\D/g, "") || "0");

    const candidateButtons = reviewPanel.getByRole("button").filter({ hasNotText: /remover/i });
    const candidateCount = await candidateButtons.count();
    expect(candidateCount).toBeGreaterThan(1); // ambiguidade real, não um único candidato disfarçado

    const chosenCandidateName = (await candidateButtons.first().textContent()) ?? "";
    await candidateButtons.first().click();

    // Painel de revisão some (item resolvido manualmente), item escolhido
    // aparece na lista, nutrição recalculada pela engine real (nunca da fixture).
    await expect(dialog.getByText(/precisa de revisão/i)).not.toBeVisible();
    await expect(dialog.getByText(new RegExp(chosenCandidateName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))).toBeVisible();
    await expect(kcalMetric).toBeVisible();
    const kcalAfterPick = Number(((await kcalMetric.textContent()) ?? "").replace(/\D/g, "") || "0");
    expect(kcalAfterPick).toBeGreaterThan(kcalBeforePick); // batata soma calorias — não foi descartada

    // O item já resolvido (arroz) nunca foi tocado — plano não foi regerado.
    await expect(dialog.getByText(/arroz,?\s*tipo 1,?\s*cozido/i)).toBeVisible();

    await dialog.getByRole("button", { name: /^aplicar ao editor$/i }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByText(/^\d+ kcal$/).first()).toHaveText(`${kcalAfterPick} kcal`);
    await expect(page.getByPlaceholder("Buscar alimento").last()).toBeVisible();
  });

  test("remover um item ambíguo o descarta sem adivinhar — nunca entra no plano salvo", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    const fixtureRes = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
      data: {
        clientId: patient.id,
        meals: [
          {
            mealKey: "almoco",
            recipeId: null,
            items: [
              { query: "Arroz, tipo 1, cozido", quantity: 100, unit: "g" },
              { query: "batata", quantity: 100, unit: "g" },
            ],
            rationale: "Carboidrato principal do almoço.",
          },
        ],
      },
    });
    expect(fixtureRes.ok(), await fixtureRes.text()).toBeTruthy();

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar com ia$/i }).click();

    const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();

    await expect(dialog.getByText(/precisa de revisão/i)).toBeVisible({ timeout: 20_000 });

    const reviewPanel = dialog.locator("text=Precisa de revisão").locator("..");
    await reviewPanel.getByRole("button", { name: /remover/i }).click();

    await expect(dialog.getByText(/precisa de revisão/i)).not.toBeVisible();
    await expect(dialog.getByText(/arroz,?\s*tipo 1,?\s*cozido/i)).toBeVisible();

    await dialog.getByRole("button", { name: /^aplicar ao editor$/i }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();

    const saved = (await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json()) as {
      meals: { items: { food: string }[] }[];
    }[];
    const items = saved[0].meals.flatMap((meal) => meal.items.map((item) => item.food));
    expect(items.some((name) => /arroz/i.test(name))).toBe(true);
    expect(items.some((name) => /batata/i.test(name))).toBe(false); // nunca adivinhado silenciosamente
  });
});
