import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

/**
 * MealPlanEditor UX 2.0 (increment 1): reordenar, duplicar refeicao/item,
 * duplicar plano atual, e o caminho de conflito de versao (409) agora
 * exercitado pela UI pela primeira vez (expectedVersion passou a ser
 * enviado no PUT). Nao mexe no motor nutricional nem no versionamento
 * imutavel — so cobre a nova UX construida em cima deles.
 *
 * Roda tanto em chromium-desktop quanto em mobile-chrome (Pixel 5) —
 * mesmo arquivo, sem viewport especial: a suite completa ja e executada
 * uma vez por projeto.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

function fieldAfterLabel(page: Page, label: string, tag: "input" | "textarea" = "input") {
  return page.locator(`xpath=//label[normalize-space()="${label}"]/following-sibling::${tag}[1]`);
}

async function createPlan(request: APIRequestContext, patientId: string, title = "Plano UX2 E2E") {
  const res = await request.post(`/api/admin/clients/${patientId}/meal-plans`, {
    data: { targetGroup: "ADULTO_SAUDAVEL", title },
  });
  expect(res.ok()).toBe(true);
  return res.json();
}

async function addMealWithArroz(page: Page, name: string) {
  await page.getByRole("button", { name: /^refeicao$/i }).click();
  const meal = page.locator("article").last();
  await meal.getByPlaceholder("Nome da refeicao").fill(name);
  const foodInput = meal.getByPlaceholder("Digite para buscar na TACO").last();
  await foodInput.fill("Arroz");
  const suggestion = page.locator("button", { hasText: /arroz/i }).first();
  await expect(suggestion).toBeVisible();
  await suggestion.click();
  await meal.getByPlaceholder("Qtd.").last().fill("100");
  return meal;
}

test.describe("plano alimentar — UX 2.0", () => {
  test("reordena refeicoes com as setas para cima/baixo", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    await addMealWithArroz(page, "Refeicao Um");
    await addMealWithArroz(page, "Refeicao Dois");

    // A ultima refeicao ("Refeicao Dois") sobe uma posicao, trocando de lugar com "Refeicao Um".
    // Titulo do botao de refeicao ("Mover refeicao para cima") e mais especifico que o de item
    // ("Mover para cima") para nao colidir com os botoes de mover ALIMENTO dentro da mesma refeicao.
    await page.locator("article").last().getByTitle("Mover refeicao para cima").click();
    await expect(page.locator("article").nth(-2).getByPlaceholder("Nome da refeicao")).toHaveValue("Refeicao Dois");
    await expect(page.locator("article").last().getByPlaceholder("Nome da refeicao")).toHaveValue("Refeicao Um");

    // A ordem persiste apos salvar e recarregar.
    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.locator("article").nth(-2).getByPlaceholder("Nome da refeicao")).toHaveValue("Refeicao Dois");
    await expect(page.locator("article").last().getByPlaceholder("Nome da refeicao")).toHaveValue("Refeicao Um");
  });

  test("duplica uma refeicao com os itens", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    await addMealWithArroz(page, "Lanche da tarde");
    const articlesBefore = await page.locator("article").count();

    await page.locator("article").last().getByRole("button", { name: /duplicar lanche da tarde/i }).click();
    await expect(page.locator("article")).toHaveCount(articlesBefore + 1);

    const duplicated = page.locator("article").last();
    await expect(duplicated.getByPlaceholder("Nome da refeicao")).toHaveValue("Lanche da tarde (cópia)");
    await expect(duplicated.getByPlaceholder("Digite para buscar na TACO").last()).toHaveValue(/arroz/i);
    await expect(duplicated.getByPlaceholder("Qtd.").last()).toHaveValue("100");
  });

  test("duplica um alimento dentro da refeicao", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    const meal = await addMealWithArroz(page, "Almoco");
    await meal.getByRole("button", { name: /^duplicar alimento$/i }).last().click();

    const foodInputs = meal.getByPlaceholder("Digite para buscar na TACO");
    await expect(foodInputs).toHaveCount(2);
    await expect(foodInputs.last()).toHaveValue(/arroz/i);
    await expect(meal.getByPlaceholder("Qtd.").last()).toHaveValue("100");
  });

  test("duplica o plano atual em um novo rascunho, preservando refeicoes e itens", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    await addMealWithArroz(page, "Refeicao Original");
    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();

    const planPillsBefore = await page.locator("button", { hasText: /^(Ativo|Rascunho) - v\d+$/ }).count();
    await page.getByRole("button", { name: /^duplicar este plano$/i }).click();
    await expect(page.getByText(/plano duplicado a partir do selecionado/i)).toBeVisible();
    await expect(page.locator("button", { hasText: /^(Ativo|Rascunho) - v\d+$/ })).toHaveCount(planPillsBefore + 1);

    // O plano recem-duplicado (agora selecionado) traz titulo marcado e o conteudo pre-preenchido, sem ter sido salvo ainda.
    await expect(fieldAfterLabel(page, "Titulo do plano")).toHaveValue(/\(cópia\)$/);
    await expect(page.locator("article", { hasText: "Refeicao Original" })).toBeVisible();
    await expect(page.getByPlaceholder("Digite para buscar na TACO").last()).toHaveValue(/arroz/i);

    // Revisar e salvar o duplicado persiste normalmente, como qualquer plano novo.
    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();
  });

  test("mostra aviso amigavel com opcao de recarregar quando o plano foi atualizado em outra sessao (409)", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const plan = await createPlan(request, patient.id);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByRole("button", { name: /^rascunho - v1$/i })).toBeVisible();
    await addMealWithArroz(page, "Cafe da manha");

    // Outra sessao salva por cima enquanto esta aba segue com plan.version=1 em memoria.
    const bump = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: {
        title: "Editado em outra sessao",
        status: "draft",
        meals: [{ name: "Cafe", items: [{ food: "Arroz", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "3" }] }],
        substitutions: [],
        supplements: [],
        expectedVersion: 1,
      },
    });
    expect(bump.ok()).toBe(true);

    // Salvar na aba desatualizada -> 409 amigavel (nao o banner de erro generico).
    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/atualizado em outra sessao/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /recarregar plano/i })).toBeVisible();

    // Recarregar traz o conteudo mais recente do servidor.
    await page.getByRole("button", { name: /recarregar plano/i }).click();
    await expect(fieldAfterLabel(page, "Titulo do plano")).toHaveValue("Editado em outra sessao");
    await expect(page.getByText(/atualizado em outra sessao/i)).toHaveCount(0);
  });

  test("busca de alimento nao gera overflow horizontal ao abrir o dropdown", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const foodInput = page.locator("article").last().getByPlaceholder("Digite para buscar na TACO").last();
    await foodInput.fill("Arroz");
    await expect(page.locator("button", { hasText: /arroz/i }).first()).toBeVisible();

    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);
  });
});
