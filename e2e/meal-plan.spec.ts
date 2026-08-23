import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { addMeal, fieldAfterLabel, openMealPlanTab, publishPlan, saveDraft, selectFood, selectLastGrams, setLastQuantity } from "./helpers/meal-plan-editor";
import { createTestPatient, enablePortalAccess } from "./helpers/test-data";

/**
 * Planos alimentares (secao 8 do pedido FASE 1): criar, adicionar refeicao e
 * alimento, definir quantidade, confirmar calculo nutricional, salvar,
 * editar, versionar e visualizar a versao ativa no portal. Nao redesenha o
 * motor de medidas caseiras nesta fase — so testa o comportamento atual.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

async function firstKcalValue(page: Page): Promise<number> {
  const text = (await page.getByText(/^\d+ kcal$/).first().textContent()) ?? "";
  return Number(text.replace(/\D/g, "") || "0");
}

async function stableFirstKcalValue(page: Page, minValue: number): Promise<number> {
  let stableValue = 0;

  await expect(async () => {
    const first = await firstKcalValue(page);
    await page.waitForTimeout(150);
    const second = await firstKcalValue(page);

    expect(first).toBe(second);
    expect(second).toBeGreaterThan(minValue);
    stableValue = second;
  }).toPass({ timeout: 5_000 });

  return stableValue;
}

test.describe("plano alimentar", () => {
  test("cria plano por modelo, adiciona alimento com quantidade, confirma cálculo nutricional, salva e a edição persiste", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    await openMealPlanTab(page, patient.id);
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    // Adiciona uma nova refeicao com um alimento reconhecido pela busca TACO.
    const meal = await addMeal(page);
    await selectFood(page, meal, "Arroz", /arroz/i);
    await setLastQuantity(meal, "100");
    // Alimento vinculado (veio da busca TACO): a coluna de unidade agora e um
    // seletor de medida, nunca mais texto livre — "Gramas (g)" ja e o valor
    // padrao, mas seleciona explicitamente para fixar unit="g".
    await selectLastGrams(meal);

    // Macros em tempo real no rodape refletem o alimento adicionado (nao fica zerado).
    const kcalMetric = page.getByText(/^\d+ kcal$/).first();
    await expect(kcalMetric).toBeVisible();
    const kcalText = await kcalMetric.textContent();
    expect(Number(kcalText?.replace(/\D/g, "") ?? "0")).toBeGreaterThan(0);

    // Define meta nutricional e confirma o resumo nutricional primario da mesa de trabalho.
    await fieldAfterLabel(page, "Energia (kcal)").fill("2000");
    await expect(page.getByRole("heading", { name: "Plano do dia" })).toBeVisible();
    await expect(page.getByText(/resumo nutricional/i).first()).toBeVisible();

    await saveDraft(page);

    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.locator("article").last()).toContainText(/Arroz[\s\S]*100 g/);
  });

  test("ativa o plano no portal, versiona ao editar de novo e mostra a versão ativa no portal do paciente", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);

    await openMealPlanTab(page, patient.id);
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^rascunho - v1$/i })).toBeVisible();

    await publishPlan(page);
    await expect(page.getByRole("button", { name: /^ativo - v2$/i })).toBeVisible();

    // Active e read-only: editar cria um rascunho separado; portal so muda apos novo review/publicacao.
    const notes = `Orientação atualizada ${Date.now()}`;
    await page.getByRole("button", { name: /^editar$/i }).click();
    await expect(page.getByRole("button", { name: /^rascunho - v\d+$/i })).toBeVisible();
    await fieldAfterLabel(page, "Orientacoes gerais para o cliente", "textarea").fill(notes);
    await saveDraft(page);
    await publishPlan(page);
    await expect(page.getByRole("button", { name: /^ativo - v\d+$/i })).toBeVisible();
    const plans = (await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json()) as { status: string; version: number }[];
    const activePlan = plans.find((plan) => plan.status === "active");
    expect(activePlan).toBeTruthy();

    // Portal do paciente mostra a versao ativa correta.
    await page.goto("/portal");
    await page.getByPlaceholder("seunome@email.com").fill(patient.email);
    await page.getByPlaceholder("BF-0000-0000").fill(code);
    await page.getByRole("button", { name: /acessar meu portal/i }).click();

    await expect(page.getByRole("heading", { name: "Plano alimentar" })).toBeVisible();
    await expect(page.getByText(`v${activePlan!.version}`, { exact: true })).toBeVisible();
  });

  test("seleciona uma medida caseira específica, altera a quantidade, recarrega e a medida/macro persistem; item sem medida cadastrada é sinalizado como estimativa", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    await openMealPlanTab(page, patient.id);
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();
    const kcalMetric = page.getByText(/^\d+ kcal$/).first();
    const kcalBeforeNewItem = Number(((await kcalMetric.textContent()) ?? "").replace(/\D/g, "") || "0");

    // 1. Escolher um alimento vinculado (Banana, nanica, crua — TACO 179, que
    // tem uma medida caseira semeada pela migration 0034: "1 unidade media").
    // O plano criado por modelo pode ja trazer itens do modelo com unidade
    // generica (ex.: "xicara") sem medida especifica vinculada — por isso a
    // checagem de "sem estimativa" abaixo e escopada so ao card da NOVA
    // refeicao (a ultima da lista), nunca a pagina inteira.
    const newMealCard = await addMeal(page);
    // O dropdown mostra o nome de exibição (sem vírgulas: "Banana nanica
    // crua"), não o nome técnico da fonte ("Banana, nanica, crua") — regex
    // sem vírgula fixa, tolera ambas as formas.
    await selectFood(page, newMealCard, "Banana, nanica", /banana[,\s]+nanica/i);

    // 2. Selecionar a medida especifica (nunca mais um "Un." de texto livre para um alimento vinculado).
    const measureSelect = newMealCard.locator('select[aria-label="Medida"]:visible').last();
    await expect(measureSelect).toBeVisible();
    await measureSelect.selectOption({ label: "1 unidade media" });
    await setLastQuantity(newMealCard, "1");

    const kcalSingle = await stableFirstKcalValue(page, kcalBeforeNewItem);
    expect(kcalSingle).toBeGreaterThan(0);
    // Medida especifica cadastrada -> alta confianca, sem aviso de estimativa para este item.
    await expect(newMealCard.getByText(/valor estimado/i)).toHaveCount(0);

    // 3. Alterar quantidade -> macros mudam.
    await setLastQuantity(newMealCard, "2");
    const kcalDouble = await stableFirstKcalValue(page, kcalSingle);
    expect(kcalDouble).toBeGreaterThan(kcalSingle);

    // 5. Salvar.
    await saveDraft(page);

    // 6. Recarregar.
    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();

    // 7. A medida continua selecionada.
    await page.getByRole("button", { name: /mais ações do alimento/i }).last().click();
    await page.getByRole("button", { name: /^editar$/i }).click();
    const measureSelectAfterReload = page.locator('select[aria-label="Medida"]:visible').last();
    await expect(measureSelectAfterReload.locator("option:checked")).toHaveText("1 unidade media");

    // 8. Macros permanecem iguais.
    await expect(page.getByText(/^\d+ kcal$/).first()).toHaveText(`${kcalDouble} kcal`);

    // 9/10. Um segundo item, digitado livremente sem vinculo a um alimento
    // estruturado (mesmo comportamento de plano legado), com unidade
    // generica sem medida cadastrada, e sinalizado como estimativa na UI —
    // nunca silenciosamente tratado como preciso.
    const freeMeal = await addMeal(page);
    const freeTextFoodInput = freeMeal.locator('input[aria-label="Alimento"]').last();
    await freeTextFoodInput.fill("Petisco caseiro nao cadastrado");
    await freeMeal.locator('input[aria-label="Quantidade"]:visible').last().fill("1");
    await freeMeal.locator('input[aria-label="Unidade"]:visible').last().fill("unidade");
    await expect(page.getByText(/valor estimado/i).last()).toBeVisible();
  });

  test("busca alimento customizado no catalogo unificado, salva e recarrega com referencia estavel", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const customName = `Granola E2E ${Date.now()}`;
    const custom = await request.post("/api/admin/custom-foods", {
      data: {
        name: customName,
        source: "CUSTOM",
        portion_base_grams: 100,
        energy_kcal: 410,
        protein_g: 9,
        carbohydrate_g: 62,
        fat_g: 12,
        fiber_g: null,
        sodium_mg: null,
        calcium_mg: null,
        iron_mg: null,
        potassium_mg: null,
        vitamin_c_mg: null,
      },
    });
    expect(custom.ok()).toBeTruthy();

    await openMealPlanTab(page, patient.id);
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    const meal = await addMeal(page);
    const foodInput = meal.locator('input[aria-label="Alimento"]').last();
    await foodInput.fill(customName);
    const suggestion = page.getByRole("option", { name: new RegExp(customName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toContainText(/Personalizado/i);
    await suggestion.click();
    await setLastQuantity(meal, "50");
    await selectLastGrams(meal);

    await saveDraft(page);

    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.locator("article").last()).toContainText(customName);
    await expect(page.locator("article").last()).toContainText("50 g");
  });

  test("busca alimento USDA piloto, salva e recarrega com referencia estavel", async ({ page, request }) => {
    const seed = await request.post("/api/admin/e2e/seed-usda-food");
    expect(seed.ok(), `seed-usda-food falhou (${seed.status()}): ${await seed.text()}`).toBeTruthy();
    const patient = await createTestPatient(request);

    await openMealPlanTab(page, patient.id);
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    const meal = await addMeal(page);
    const foodInput = meal.locator('input[aria-label="Alimento"]').last();
    await foodInput.fill("rice pilot e2e");
    const suggestion = page.getByRole("option", { name: /rice pilot e2e cooked/i }).first();
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toContainText(/USDA/i);
    await suggestion.click();
    await setLastQuantity(meal, "100");
    await selectLastGrams(meal);

    await expect(page.getByText(/^\d+ kcal$/).first()).toBeVisible();
    await saveDraft(page);

    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.locator("article").last()).toContainText("Rice pilot e2e cooked");
    await expect(page.locator("article").last()).toContainText("100 g");
  });
});
