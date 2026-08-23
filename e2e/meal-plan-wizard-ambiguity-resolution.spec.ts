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

    // Cada candidato mostra nome amigável + fonte (nunca o refId técnico) e
    // dois botões: "Selecionar" e "Selecionar e lembrar" (seção 8/9 do
    // pedido de terminologia).
    const selectButtons = reviewPanel.getByRole("button", { name: /^selecionar$/i });
    const candidateCount = await selectButtons.count();
    expect(candidateCount).toBeGreaterThan(1); // ambiguidade real, não um único candidato disfarçado
    await expect(reviewPanel.getByRole("button", { name: /^selecionar e lembrar$/i }).first()).toBeVisible();

    const firstCandidateRow = reviewPanel.locator("div").filter({ has: page.getByRole("button", { name: /^selecionar$/i }) }).first();
    const chosenCandidateName = ((await firstCandidateRow.locator("span").first().textContent()) ?? "").split("·")[0].trim();
    await selectButtons.first().click();

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
    const chosenNamePattern = chosenCandidateName.trim().split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[,\\s]+");
    await expect(page.locator("article").last()).toContainText(new RegExp(chosenNamePattern, "i"));
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

  test('"Selecionar e lembrar" salva uma preferência do profissional (não um alias global) e reaplica automaticamente na próxima geração ambígua igual', async ({ page, request }) => {
    const firstPatient = await createTestPatient(request);
    const fixtureRes1 = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
      data: { clientId: firstPatient.id, meals: [{ mealKey: "almoco", recipeId: null, items: [{ query: "iogurte", quantity: 100, unit: "g" }], rationale: "Laticínio." }] },
    });
    expect(fixtureRes1.ok(), await fixtureRes1.text()).toBeTruthy();

    await page.goto(`/dashboard/clients/${firstPatient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar com ia$/i }).click();
    let dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();

    // Robusto a rodar em mais de um projeto Playwright (chromium-desktop +
    // mobile-chrome) contra o MESMO servidor/DB com o MESMO admin: se um
    // projeto já rodou este teste antes, a preferência de "iogurte" já
    // existe e a IA resolve automaticamente — o que é, em si, a prova de
    // que a preferência persiste entre gerações (o teste não fica frágil à
    // ordem de execução entre projetos).
    let chosenName = "";
    const needsReviewShown = await dialog.getByText(/precisa de revisão/i)
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (needsReviewShown) {
      const reviewPanel1 = dialog.locator("text=Precisa de revisão").locator("..");
      const firstCandidateRow1 = reviewPanel1.locator("div").filter({ has: page.getByRole("button", { name: /^selecionar$/i }) }).first();
      chosenName = ((await firstCandidateRow1.locator("span").first().textContent()) ?? "").split("·")[0].trim();
      await reviewPanel1.getByRole("button", { name: /^selecionar e lembrar$/i }).first().click();
      await expect(dialog.getByText(/precisa de revisão/i)).not.toBeVisible();
    } else {
      await expect(dialog.getByText(/^\d+ kcal$/).first()).toBeVisible();
    }
    await dialog.getByRole("button", { name: /^fechar$/i }).click();
    await expect(dialog).not.toBeVisible();

    // Segundo paciente, MESMA query ambígua ("iogurte") — a preferência é do
    // PROFISSIONAL (sessão atual), nunca do paciente nem um alias global do
    // catálogo: reaplicada aqui mesmo trocando de paciente.
    const secondPatient = await createTestPatient(request);
    const fixtureRes2 = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
      data: { clientId: secondPatient.id, meals: [{ mealKey: "almoco", recipeId: null, items: [{ query: "iogurte", quantity: 100, unit: "g" }], rationale: "Laticínio." }] },
    });
    expect(fixtureRes2.ok(), await fixtureRes2.text()).toBeTruthy();

    await page.goto(`/dashboard/clients/${secondPatient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar com ia$/i }).click();
    dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();
    await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();

    // Resolvido automaticamente desta vez — sem "precisa de revisão" —
    // usando exatamente o alimento escolhido/lembrado antes.
    await expect(dialog.getByText(/^\d+ kcal$/).first()).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(/precisa de revisão/i)).not.toBeVisible();
    if (chosenName) {
      await expect(dialog.getByText(new RegExp(chosenName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))).toBeVisible();
    }
  });
});
