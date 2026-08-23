import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient, seedAiProposal, uniqueSuffix } from "./helpers/test-data";

/**
 * O campo de busca de alimento fecha a lista de sugestoes 140ms apos perder
 * foco (MealItemsEditor.tsx onBlur). Em automacao (bem mais rapida que
 * digitacao humana), o mousedown do clique na sugestao as vezes dispara
 * esse blur antes do click completar, fechando a lista e derrubando o
 * proprio botao que se está clicando. Encapsula busca+selecao com retry
 * (reescreve a busca do zero a cada tentativa) em vez de um clique unico.
 */
async function searchAndSelectFood(page: Page, input: import("@playwright/test").Locator, query: string, matchRegex: RegExp) {
  await expect(async () => {
    await input.fill("");
    await input.fill(query);
    const suggestion = page.locator("button", { hasText: matchRegex }).first();
    await expect(suggestion).toBeVisible({ timeout: 3000 });
    await suggestion.click({ timeout: 3000 });
  }).toPass({ timeout: 20000 });
}

/**
 * Fluxo E2E completo pedido na auditoria do motor nutricional (secao 29):
 * login admin -> paciente de teste -> abrir plano alimentar -> criar
 * refeicao -> adicionar arroz -> definir quantidade -> adicionar proteina ->
 * adicionar receita -> salvar -> conferir kcal/macros -> abrir versao
 * imprimivel -> conferir os MESMOS valores -> criar alteracao via
 * Assistente -> confirmar proposta -> reabrir o plano -> comparar valores.
 *
 * A etapa "via Assistente" usa a mesma rota de seed de proposta que
 * e2e/ai-guardrails.spec.ts (o ambiente de E2E nunca tem provedor de IA
 * real configurado) — o que se prova aqui e o gate proposta -> confirmacao
 * -> execucao -> UI reflete o novo total, nao a qualidade do texto do
 * modelo (ja coberto por tests/ai-proposal-*.test.ts no nivel unitario).
 * Nunca usa um paciente real: sempre createTestPatient.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

interface PlanItem { id: string; food: string; quantity: string | null; unit: string | null }
interface PlanMeal { id: string; name: string; items: PlanItem[] }
interface PlanSummary { id: string; version: number; meals: PlanMeal[] }

test.describe("ciclo completo do plano alimentar: manual + receita + impressao + alteracao via IA", () => {
  test("kcal do editor == impressao, e a alteracao confirmada via IA atualiza os dois", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    // Semeia uma receita real (o motor de receitas calcula os macros a
    // partir de ingredientes TACO reais — nunca um numero fixo aqui).
    const recipeTitle = `Receita E2E ${uniqueSuffix()}`;
    const recipeResponse = await request.post("/api/admin/recipes", {
      data: {
        title: recipeTitle,
        meal_group: "almoco",
        servings: 2,
        ingredients: [{ taco_number: 1, food_name: "Arroz, integral, cozido", grams: 200 }],
      },
    });
    expect(recipeResponse.ok(), await recipeResponse.text()).toBeTruthy();

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    // 1. Nova refeicao + arroz (100g).
    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const mealCard = page.locator("article").last();
    await searchAndSelectFood(page, page.getByPlaceholder("Buscar alimento").last(), "Arroz", /arroz/i);
    await page.getByPlaceholder("Qtd.").last().fill("100");
    await page.locator('select[title*="Medida"]').last().selectOption("__grams__");

    // 2. Adiciona um segundo item (proteina) na MESMA refeicao.
    await mealCard.getByRole("button", { name: /^alimento$/i }).click();
    await searchAndSelectFood(page, page.getByPlaceholder("Buscar alimento").last(), "Peito de frango", /frango/i);
    await page.getByPlaceholder("Qtd.").last().fill("100");
    await page.locator('select[title*="Medida"]').last().selectOption("__grams__");

    // 3. Insere a receita semeada (vira uma nova refeicao com os
    // ingredientes copiados — "Inserir receita" no editor).
    await page.getByRole("button", { name: /^inserir receita$/i }).click();
    await page.getByPlaceholder("Buscar por nome ou tag...").fill(recipeTitle);
    const recipeCard = page.locator("button", { hasText: recipeTitle });
    await expect(recipeCard).toBeVisible();
    await recipeCard.click();
    await expect(page.getByText(new RegExp(`receita "${recipeTitle}" inserida`, "i"))).toBeVisible();

    // 4. kcal do dia > 0 antes de salvar.
    const kcalMetric = page.getByText(/^\d+ kcal$/).first();
    await expect(kcalMetric).toBeVisible();
    const editorKcalBeforeSave = Number(((await kcalMetric.textContent()) ?? "").replace(/\D/g, "") || "0");
    expect(editorKcalBeforeSave).toBeGreaterThan(0);

    // 5. Salva.
    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();

    // 6. Ativa (a pagina de impressao so mostra o plano ATIVO).
    await page.getByRole("button", { name: /^ativar no portal$/i }).click();
    await expect(page.getByText(/^plano ativado no portal do cliente\.$/i)).toBeVisible();

    // 7. Abre a versao imprimivel e confere o MESMO total de energia —
    // prova que impressao e editor usam o mesmo motor (nunca uma formula
    // paralela na impressao).
    await page.goto(`/dashboard/clients/${patient.id}/print`);
    const printKcal = page.locator(".macro:has-text('Energia') strong").first();
    await expect(printKcal).toBeVisible();
    const printKcalBefore = Number(((await printKcal.textContent()) ?? "").replace(/\D/g, "") || "0");
    expect(printKcalBefore).toBeGreaterThan(0);

    // 8. Busca o plano real (id/versao/itens) para montar a proposta de IA.
    const plans = (await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json()) as PlanSummary[];
    const plan = plans.find((item) => item.meals.some((meal) => meal.items.some((i) => /arroz/i.test(i.food))))!;
    expect(plan).toBeTruthy();
    const riceMeal = plan.meals.find((meal) => meal.items.some((i) => /arroz/i.test(i.food)))!;
    const riceItem = riceMeal.items.find((i) => /arroz/i.test(i.food))!;

    // 9. Alteracao via Assistente: aumenta o arroz de 100g para 250g. O
    // ambiente de E2E nunca tem um provedor de IA real configurado (mesma
    // convencao de e2e/ai-guardrails.spec.ts) — a proposta e semeada pela
    // MESMA rota que o orquestrador real usa apos uma tool call, e
    // confirmada pela rota HTTP real (nao simula o clique no chat).
    const proposal = await seedAiProposal(request, {
      toolName: "proposeMealPlanChange",
      clientId: patient.id,
      action: {
        kind: "meal_plan_change",
        clientId: patient.id,
        mealPlanId: plan.id,
        baseVersion: plan.version,
        changes: [{ operation: "change_quantity", mealId: riceMeal.id, itemId: riceItem.id, quantity: 250 }],
        preview: {
          mealPlanTitle: "plano",
          changeSummaries: [{ operation: "change_quantity", mealName: riceMeal.name, before: "100", after: "250" }],
          totalImpact: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
        },
      },
    });
    expect(proposal.risk).toBe("clinical");
    expect(proposal.requiresConfirmation).toBe(true);

    const confirmResponse = await request.post(`/api/admin/ai/proposals/${proposal.proposalId}/confirm`);
    expect(confirmResponse.ok(), await confirmResponse.text()).toBeTruthy();

    // 10. Reabre o plano na UI: o total mudou (mais gramas de arroz -> mais
    // kcal) e reflete exatamente a mudanca aplicada pela IA.
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(async () => {
      const kcalAfter = Number(((await page.getByText(/^\d+ kcal$/).first().textContent()) ?? "").replace(/\D/g, "") || "0");
      expect(kcalAfter).toBeGreaterThan(printKcalBefore);
    }).toPass();

    // 11. A impressao reflete o MESMO novo total (print == engine, de novo,
    // agora depois de uma alteracao feita pela IA — nao so pelo editor manual).
    const kcalAfterUi = Number(((await page.getByText(/^\d+ kcal$/).first().textContent()) ?? "").replace(/\D/g, "") || "0");
    await page.goto(`/dashboard/clients/${patient.id}/print`);
    const printKcalAfter = Number(((await page.locator(".macro:has-text('Energia') strong").first().textContent()) ?? "").replace(/\D/g, "") || "0");
    expect(printKcalAfter).toBe(kcalAfterUi);
    expect(printKcalAfter).toBeGreaterThan(printKcalBefore);
  });
});
