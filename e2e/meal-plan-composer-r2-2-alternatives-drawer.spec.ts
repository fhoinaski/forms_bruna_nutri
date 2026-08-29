import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

type PlanResponse = {
  id: string;
  meals: Array<{ name: string; items: Array<{ food: string; quantity?: string | null; unit?: string | null }> }>;
};

async function createTemplatePlan(request: APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, {
    data: { targetGroup: "ADULTO_SAUDAVEL", title },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<PlanResponse>;
}

async function openDrawerFor(page: Page, buttonName: RegExp, dialogName: RegExp) {
  await page.getByRole("button", { name: buttonName }).click();
  const drawer = page.getByRole("dialog", { name: dialogName });
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe("Meal Plan Composer R2.2 — Food Alternatives Drawer", () => {
  test("pesquisar, comparar e adicionar uma troca manual sem sair do Composer", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "R2.2 drawer manual add");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();

    const drawer = await openDrawerFor(page, /revisar trocas de Arroz integral cozido/i, /arroz integral cozido/i);

    // Não navega para fora do Composer (seção 35) — a URL do dashboard do
    // paciente continua a mesma.
    await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${patient.id}$`));

    await drawer.getByRole("button", { name: /adicionar outra/i }).click();
    await drawer.getByLabel("Pesquisar alimento").fill("mandioca");

    const firstResult = drawer.locator("button", { hasText: /mandioca/i }).first();
    await expect(firstResult).toBeVisible({ timeout: 10_000 });
    await firstResult.click();

    // Preview: candidato + quantidade editável + delta vs alimento principal
    // — nunca adiciona no clique do resultado (seção 15/23).
    await expect(drawer.getByLabel("Quantidade (g)")).toBeVisible();
    await expect(drawer.getByRole("cell", { name: "Energia", exact: true })).toBeVisible();
    await expect(drawer.getByRole("columnheader", { name: "Diferença" })).toBeVisible();
    // Linguagem da R2 (seção 9): a comparação simples nunca chamava nada de
    // "equivalente" — o Substitution Engine R3 introduziu deliberadamente
    // esse vocabulário (quantidade equivalente por critério), então esta
    // restrição foi superada por design a partir da R3 e não se aplica mais.

    const addButton = drawer.getByRole("button", { name: /^adicionar$/i });
    await expect(addButton).toBeEnabled({ timeout: 10_000 });
    await addButton.click();

    // Volta pra lista/drawer atualizado com a nova sugestão persistida —
    // nunca fecha o drawer sozinho, nunca sai do Composer (seção 34/35).
    await expect(drawer.getByLabel("Quantidade (g)")).toHaveCount(0);
    await expect(drawer.getByText(/mandioca/i).first()).toBeVisible();

    // Domain test (seção 51): a troca é um item aninhado no exchange group
    // do alimento principal — a refeição continua SIMPLE, nunca virou
    // OPTIONS/COMBINATION por causa de uma troca.
    const plans = await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json() as Array<{ meals: Array<{ meal_structure?: string | null; name: string }> }>;
    const meal = plans[0]?.meals.find((entry) => entry.name === "Almoço" || /almo/i.test(entry.name));
    if (meal) expect(meal.meal_structure === "SIMPLE" || !meal.meal_structure).toBe(true);
  });

  test("Escape fecha o drawer e devolve o foco ao botão que abriu", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "R2.2 drawer keyboard");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();

    const trigger = page.getByRole("button", { name: /revisar trocas de Arroz integral cozido/i });
    await trigger.click();
    const drawer = page.getByRole("dialog", { name: /arroz integral cozido/i });
    await expect(drawer).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("mobile: drawer abre como folha inferior sem quebrar o Composer", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "R2.2 drawer mobile");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    const drawer = await openDrawerFor(page, /revisar trocas de Arroz integral cozido/i, /arroz integral cozido/i);

    const box = await drawer.boundingBox();
    expect(box).toBeTruthy();
    // Folha inferior: ocupa a largura toda e termina perto do fim da tela.
    expect(box!.width).toBeGreaterThan(340);
    expect(box!.y + box!.height).toBeGreaterThan(700);

    await page.getByRole("button", { name: /fechar trocas/i }).click();
    await expect(drawer).not.toBeVisible();
  });
});
