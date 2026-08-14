import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient, enablePortalAccess } from "./helpers/test-data";

/**
 * Planos alimentares (secao 8 do pedido FASE 1): criar, adicionar refeicao e
 * alimento, definir quantidade, confirmar calculo nutricional, salvar,
 * editar, versionar e visualizar a versao ativa no portal. Nao redesenha o
 * motor de medidas caseiras nesta fase — so testa o comportamento atual.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * Os campos do MealPlanEditor usam <label> sem htmlFor/id (mesmo padrao ja
 * encontrado e corrigido em outro componente nesta fase, mas fora de escopo
 * redesenhar este editor agora) — localiza o input/textarea irmao do label
 * pelo texto exato em vez de getByLabel.
 */
function fieldAfterLabel(page: Page, label: string, tag: "input" | "textarea" = "input") {
  return page.locator(`xpath=//label[normalize-space()="${label}"]/following-sibling::${tag}[1]`);
}

test.describe("plano alimentar", () => {
  test("cria plano por modelo, adiciona alimento com quantidade, confirma cálculo nutricional, salva e a edição persiste", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    // Adiciona uma nova refeicao com um alimento reconhecido pela busca TACO.
    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const foodInput = page.getByPlaceholder("Digite para buscar na TACO").last();
    await foodInput.fill("Arroz");
    const suggestion = page.locator("button", { hasText: /arroz/i }).first();
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await page.getByPlaceholder("Qtd.").last().fill("100");
    // Alimento vinculado (veio da busca TACO): a coluna de unidade agora e um
    // seletor de medida, nunca mais texto livre — "Gramas (g)" ja e o valor
    // padrao, mas seleciona explicitamente para fixar unit="g".
    await page.locator('select[title*="Medida"]').last().selectOption("__grams__");

    // Macros em tempo real no rodape refletem o alimento adicionado (nao fica zerado).
    const kcalMetric = page.getByText(/^\d+ kcal$/).first();
    await expect(kcalMetric).toBeVisible();
    const kcalText = await kcalMetric.textContent();
    expect(Number(kcalText?.replace(/\D/g, "") ?? "0")).toBeGreaterThan(0);

    // Define meta nutricional e confirma o resumo meta x prescrito (motor determinístico da FASE 2).
    await fieldAfterLabel(page, "Energia (kcal)").fill("2000");
    await expect(page.getByRole("heading", { name: "Meta x prescrito" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Energia" })).toBeVisible();

    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByPlaceholder("Digite para buscar na TACO").last()).toHaveValue(/arroz/i);
    await expect(page.getByPlaceholder("Qtd.").last()).toHaveValue("100");
  });

  test("ativa o plano no portal, versiona ao editar de novo e mostra a versão ativa no portal do paciente", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^rascunho - v1$/i })).toBeVisible();

    await page.getByRole("button", { name: /^ativar no portal$/i }).click();
    await expect(page.getByText(/^plano ativado no portal do cliente\.$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^ativo - v2$/i })).toBeVisible();

    // Editar de novo (sem trocar o status) versiona de novo — plano continua ativo.
    const notes = `Orientação atualizada ${Date.now()}`;
    await fieldAfterLabel(page, "Orientacoes gerais para o cliente", "textarea").fill(notes);
    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^ativo - v3$/i })).toBeVisible();

    // Portal do paciente mostra a versao ativa correta.
    await page.goto("/portal");
    await page.getByPlaceholder("seunome@email.com").fill(patient.email);
    await page.getByPlaceholder("BF-0000-0000").fill(code);
    await page.getByRole("button", { name: /acessar meu portal/i }).click();

    await expect(page.getByRole("heading", { name: "Plano alimentar" })).toBeVisible();
    await expect(page.getByText("v3", { exact: true })).toBeVisible();
  });

  test("seleciona uma medida caseira específica, altera a quantidade, recarrega e a medida/macro persistem; item sem medida cadastrada é sinalizado como estimativa", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar por modelo$/i }).click();
    await expect(page.getByText(/plano criado a partir do modelo/i)).toBeVisible();

    // 1. Escolher um alimento vinculado (Banana, nanica, crua — TACO 179, que
    // tem uma medida caseira semeada pela migration 0034: "1 unidade media").
    // O plano criado por modelo pode ja trazer itens do modelo com unidade
    // generica (ex.: "xicara") sem medida especifica vinculada — por isso a
    // checagem de "sem estimativa" abaixo e escopada so ao card da NOVA
    // refeicao (a ultima da lista), nunca a pagina inteira.
    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const newMealCard = page.locator("article").last();
    const foodInput = page.getByPlaceholder("Digite para buscar na TACO").last();
    await foodInput.fill("Banana, nanica");
    const suggestion = page.locator("button", { hasText: /banana, nanica/i }).first();
    await expect(suggestion).toBeVisible();
    await suggestion.click();

    // 2. Selecionar a medida especifica (nunca mais um "Un." de texto livre para um alimento vinculado).
    const measureSelect = page.locator('select[title*="Medida"]').last();
    await expect(measureSelect).toBeVisible();
    await measureSelect.selectOption({ label: "1 unidade media" });
    await page.getByPlaceholder("Qtd.").last().fill("1");

    const kcalMetric = page.getByText(/^\d+ kcal$/).first();
    const kcalSingle = Number(((await kcalMetric.textContent()) ?? "").replace(/\D/g, "") || "0");
    expect(kcalSingle).toBeGreaterThan(0);
    // Medida especifica cadastrada -> alta confianca, sem aviso de estimativa para este item.
    await expect(newMealCard.getByText(/valor estimado/i)).toHaveCount(0);

    // 3. Alterar quantidade -> macros mudam (dobrar a quantidade aproximadamente dobra o impacto — tolerância de arredondamento de exibição).
    await page.getByPlaceholder("Qtd.").last().fill("2");
    await expect(async () => {
      const value = Number(((await kcalMetric.textContent()) ?? "").replace(/\D/g, "") || "0");
      expect(value).toBeGreaterThan(kcalSingle);
      expect(Math.abs(value - kcalSingle * 2)).toBeLessThanOrEqual(2);
    }).toPass();
    const kcalDouble = Number(((await kcalMetric.textContent()) ?? "").replace(/\D/g, "") || "0");

    // 5. Salvar.
    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();

    // 6. Recarregar.
    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();

    // 7. A medida continua selecionada.
    const measureSelectAfterReload = page.locator('select[title*="Medida"]').last();
    await expect(measureSelectAfterReload.locator("option:checked")).toHaveText("1 unidade media");

    // 8. Macros permanecem iguais.
    await expect(page.getByText(/^\d+ kcal$/).first()).toHaveText(`${kcalDouble} kcal`);

    // 9/10. Um segundo item, digitado livremente sem vinculo a um alimento
    // estruturado (mesmo comportamento de plano legado), com unidade
    // generica sem medida cadastrada, e sinalizado como estimativa na UI —
    // nunca silenciosamente tratado como preciso.
    await page.getByRole("button", { name: /^refeicao$/i }).click();
    const freeTextFoodInput = page.getByPlaceholder("Digite para buscar na TACO").last();
    await freeTextFoodInput.fill("Petisco caseiro nao cadastrado");
    await page.getByPlaceholder("Qtd.").last().fill("1");
    await page.getByPlaceholder("Un.").last().fill("unidade");
    await expect(page.getByText(/valor estimado/i).last()).toBeVisible();
  });
});
