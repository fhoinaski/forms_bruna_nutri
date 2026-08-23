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
  const foodInput = meal.getByPlaceholder("Buscar alimento").last();
  await foodInput.fill("Arroz");
  const suggestion = page.locator("button", { hasText: /arroz/i }).first();
  await expect(async () => {
    await expect(suggestion).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 15_000 });
  await suggestion.click();
  await meal.getByPlaceholder("Qtd.").last().fill("100");
  return meal;
}

async function addNamedMealWithFreeTextItem(page: Page, name: string) {
  await page.getByRole("button", { name: /^refeicao$/i }).click();
  const meal = page.locator("article").last();
  await meal.getByPlaceholder("Nome da refeicao").fill(name);
  await meal.getByPlaceholder("Buscar alimento").last().fill(`Item ${name}`);
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

    await addNamedMealWithFreeTextItem(page, "Refeicao Um");
    await addNamedMealWithFreeTextItem(page, "Refeicao Dois");

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
    await expect(duplicated.getByPlaceholder("Buscar alimento").last()).toHaveValue(/arroz/i);
    await expect(duplicated.getByPlaceholder("Qtd.").last()).toHaveValue("100");
  });

  test("duplica um alimento dentro da refeicao", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    const meal = await addMealWithArroz(page, "Almoco");
    await meal.getByRole("button", { name: /mais ações do alimento/i }).last().click();
    await meal.getByRole("button", { name: /^duplicar$/i }).click();

    const foodInputs = meal.getByPlaceholder("Buscar alimento");
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
    await expect(page.getByPlaceholder("Buscar alimento").last()).toHaveValue(/arroz/i);

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
    const foodInput = page.locator("article").last().getByPlaceholder("Buscar alimento").last();
    await foodInput.fill("Arroz");
    await expect(page.locator("button", { hasText: /arroz/i }).first()).toBeVisible();

    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);
  });

  // Layout do editor de alimentos (correcao de UX — o campo de alimento
  // estava colapsando pra poucos pixels de largura no desktop porque o
  // grid da linha do item so definia colunas a partir do breakpoint 2xl
  // (1536px) e a coluna de acoes usava "auto" sem teto, competindo pelo
  // espaco do 1fr do alimento antes dele crescer. Ver
  // components/dashboard/MealItemsEditor.tsx.
  test("campo de alimento mantem largura legivel mesmo com todas as acoes do item visiveis (desktop)", async ({ page, request }) => {
    test.skip(test.info().project.name !== "chromium-desktop", "layout de desktop — cobertura mobile e o teste dedicado abaixo");
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    const meal = await addMealWithArroz(page, "Refeicao Layout");
    const foodInput = meal.getByPlaceholder("Buscar alimento").last();

    // Larguras reais medidas manualmente contra a mesma tela (Fase de
    // correcao deste bug): 1440px de viewport nunca deve deixar o campo
    // abaixo do piso de 240px definido no grid (minmax(240px,1fr)/md e
    // minmax(260px,1fr)/xl) — o bug original reduzia isso a poucos pixels.
    const box = await foodInput.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(230);

    // Acoes secundarias continuam presentes e clicaveis no menu compacto,
    // sem competir com a largura do campo de alimento.
    await expect(meal.getByRole("button", { name: /alternativas/i }).last()).toBeVisible();
    await meal.getByRole("button", { name: /mais ações do alimento/i }).last().click();
    await expect(meal.getByRole("button", { name: /^duplicar$/i })).toBeVisible();
    await expect(meal.getByRole("button", { name: /^excluir$/i })).toBeVisible();
  });

  test("nome longo do alimento fica legivel e acessivel via tooltip (title)", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const meal = page.locator("article").last();
    const foodInput = meal.getByPlaceholder("Buscar alimento").last();
    const longName = "Pão integral, forma, tradicional, fatiado, sem casca";
    await foodInput.fill(longName);

    // O valor inteiro continua no input (nunca truncado/perdido) e o
    // title reflete o nome completo — permite ver via tooltip mesmo
    // quando a coluna nao tem espaco pra mostrar tudo sem corte visual.
    await expect(foodInput).toHaveValue(longName);
    await expect(foodInput).toHaveAttribute("title", longName);
  });

  test("mobile: quantidade e unidade ficam lado a lado numa linha propria, abaixo do alimento", async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const patient = await createTestPatient(request);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    const meal = await addMealWithArroz(page, "Refeicao Mobile");
    const foodInput = meal.getByPlaceholder("Buscar alimento").last();
    const qtyInput = meal.getByPlaceholder("Qtd.").last();
    // addMealWithArroz seleciona um resultado de busca real -> o item fica
    // RESOLVIDO, e o segundo campo vira o <select> de medida ("Medida"),
    // nao o <input> de unidade livre ("Unidade") do estado nao resolvido.
    const unitField = meal.getByLabel("Medida").last();

    // Selecionar a comida dispara um fetch assincrono de medidas caseiras
    // pro <select> de "Medida" — medir a posicao ANTES dele resolver pode
    // pegar o layout no meio de um reflow (achado real: sob carga paralela
    // dos outros specs, a leitura ficava ate 100px fora do lugar). Espera a
    // MESMA posicao se repetir em 2 leituras seguidas antes de afirmar nada.
    async function stableBox(locator: typeof foodInput) {
      let previous = await locator.boundingBox();
      for (let attempt = 0; attempt < 10; attempt++) {
        await page.waitForTimeout(100);
        const current = await locator.boundingBox();
        if (previous && current && Math.abs(previous.y - current.y) < 1 && Math.abs(previous.x - current.x) < 1) return current;
        previous = current;
      }
      return previous;
    }

    const foodBox = await stableBox(foodInput);
    const qtyBox = await stableBox(qtyInput);
    const unitBox = await stableBox(unitField);
    expect(foodBox && qtyBox && unitBox).toBeTruthy();

    // Alimento numa linha propria, acima da linha de quantidade/unidade.
    expect(qtyBox!.y).toBeGreaterThan(foodBox!.y + foodBox!.height - 5);
    // Quantidade e unidade compartilham a MESMA linha (lado a lado), nunca empilhadas.
    expect(Math.abs(qtyBox!.y - unitBox!.y)).toBeLessThan(5);
    expect(unitBox!.x).toBeGreaterThan(qtyBox!.x);

    // Sem overflow horizontal em nenhuma etapa (alimento, qtd/unidade e acoes empilhados).
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);
  });
});
