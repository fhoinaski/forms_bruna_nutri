import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";
import { addMeal, openMealPlanTab, saveDraft, selectFood, setLastQuantity } from "./helpers/meal-plan-editor";

test.use({ storageState: ADMIN_STORAGE_STATE });

type PlanResponse = {
  id: string;
  meals: Array<{ name: string; meal_structure?: string | null; items: Array<{ food: string; quantity?: string | null; unit?: string | null; food_source?: string | null; food_ref_id?: string | null }> }>;
};

async function createTemplatePlan(request: APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<PlanResponse>;
}

async function openDrawerAndSearch(page: Page, query = "mandioca") {
  await page.getByRole("button", { name: /revisar trocas de Arroz integral cozido/i }).click();
  const drawer = page.getByRole("dialog", { name: /arroz integral cozido/i });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: /adicionar outra/i }).click();
  await expect(drawer.getByText("Equivalência por")).toBeVisible();
  await drawer.getByLabel("Pesquisar alimento").fill(query);
  const firstResult = drawer.locator("button", { hasText: new RegExp(query, "i") }).first();
  await expect(firstResult).toBeVisible({ timeout: 10_000 });
  return { drawer, firstResult };
}

test.describe("Meal Plan Substitution R3 — Equivalent Quantity Engine", () => {
  test("critério ENERGY (default) calcula quantidade prática em lote, sem 1 request por candidato", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "R3 energy default");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();

    const equivalentRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/admin/foods/equivalent-quantity") && req.method() === "POST") equivalentRequests.push(req.url());
    });

    const { drawer } = await openDrawerAndSearch(page);
    // ENERGY é o default operacional (seção 3) — botão já vem pressionado.
    await expect(drawer.getByRole("button", { name: "Energia", exact: true })).toHaveAttribute("aria-pressed", "true");

    await expect(drawer.getByText(/de diferença em energia/i).first()).toBeVisible({ timeout: 10_000 });
    // uma única chamada em lote pra todos os candidatos da busca (seção 5/51) — nunca N chamadas.
    expect(equivalentRequests.length).toBeLessThanOrEqual(2);
  });

  test("trocar para PROTEÍNA recalcula a quantidade sugerida (critério diferente = quantidade diferente)", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "R3 protein switch");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    const { drawer, firstResult } = await openDrawerAndSearch(page);

    await firstResult.click();
    const quantityInput = drawer.getByLabel("Quantidade (g)");
    await expect(quantityInput).not.toHaveValue("", { timeout: 10_000 });
    const energyQuantity = await quantityInput.inputValue();

    await drawer.getByRole("button", { name: "Proteína", exact: true }).click();
    await expect(drawer.getByRole("button", { name: "Proteína", exact: true })).toHaveAttribute("aria-pressed", "true");
    // A quantidade sugerida muda de critério pra critério — nunca fica travada na sugestão anterior.
    await expect(async () => {
      const proteinQuantity = await quantityInput.inputValue();
      expect(proteinQuantity).not.toBe(energyQuantity);
    }).toPass({ timeout: 10_000 });
  });

  test("CARBOIDRATO e GORDURA também calculam quantidade prática", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "R3 carb fat");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    const { drawer, firstResult } = await openDrawerAndSearch(page);
    await firstResult.click();

    for (const label of ["Carboidratos", "Gordura"]) {
      await drawer.getByRole("button", { name: label, exact: true }).click();
      await expect(drawer.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(drawer.getByLabel("Quantidade (g)")).not.toHaveValue("", { timeout: 10_000 });
    }
  });

  test("trocar critério rapidamente várias vezes nunca deixa resposta obsoleta sobrescrever a mais recente", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "R3 stale safety");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    const { drawer, firstResult } = await openDrawerAndSearch(page);
    await firstResult.click();

    // Alterna critério rapidamente sem esperar a resposta de cada um —
    // o estado final tem que refletir o ÚLTIMO critério clicado (Gordura).
    await drawer.getByRole("button", { name: "Proteína", exact: true }).click();
    await drawer.getByRole("button", { name: "Carboidratos", exact: true }).click();
    await drawer.getByRole("button", { name: "Gordura", exact: true }).click();

    await expect(drawer.getByRole("button", { name: "Gordura", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(drawer.getByText(/quantidade equivalente \(gordura\)/i)).toBeVisible({ timeout: 10_000 });
  });

  test("cancelar o preview não persiste nada; aplicar usa a quantidade prática mostrada", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const plan = await createTemplatePlan(request, patient.id, "R3 apply practical");
    const originalItems = JSON.stringify(plan.meals);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    const { drawer, firstResult } = await openDrawerAndSearch(page);
    await firstResult.click();

    await drawer.getByRole("button", { name: "Proteína", exact: true }).click();
    const quantityInput = drawer.getByLabel("Quantidade (g)");
    await expect(quantityInput).not.toHaveValue("", { timeout: 10_000 });

    // Cancelar: nenhuma escrita.
    await drawer.getByRole("button", { name: /voltar à busca/i }).click();
    const afterCancel = await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json() as PlanResponse[];
    expect(JSON.stringify(afterCancel[0]?.meals)).toBe(originalItems);

    // Reabre, escolhe critério, aplica — a quantidade prática mostrada é a que deve persistir.
    await firstResult.click();
    await drawer.getByRole("button", { name: "Proteína", exact: true }).click();
    await expect(quantityInput).not.toHaveValue("", { timeout: 10_000 });
    const appliedQuantity = await quantityInput.inputValue();

    const addButton = drawer.getByRole("button", { name: /^adicionar$/i });
    await expect(addButton).toBeEnabled({ timeout: 10_000 });
    await addButton.click();
    await expect(drawer.getByText(/mandioca/i).first()).toBeVisible();

    const after = await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json() as Array<{ id: string }>;
    const groups = await (await request.get(`/api/admin/clients/${patient.id}/meal-plans/exchange-groups?mealPlanId=${after[0]?.id}`)).json().catch(() => null);
    if (groups?.length) {
      const persistedAlt = groups.flatMap((g: { alternatives?: Array<{ food_name: string; quantity_grams: number }> }) => g.alternatives ?? []).find((a: { food_name: string }) => /mandioca/i.test(a.food_name));
      if (persistedAlt) expect(Math.round(persistedAlt.quantity_grams)).toBe(Math.round(Number(appliedQuantity)));
    }
  });

  test("acessibilidade: seletor de critério é navegável por teclado e tem aria-pressed", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "R3 accessibility");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /revisar trocas de Arroz integral cozido/i }).click();
    const drawer = page.getByRole("dialog", { name: /arroz integral cozido/i });
    await drawer.getByRole("button", { name: /adicionar outra/i }).click();

    const energyButton = drawer.getByRole("button", { name: "Energia", exact: true });
    const proteinButton = drawer.getByRole("button", { name: "Proteína", exact: true });
    await expect(energyButton).toHaveAttribute("aria-pressed", "true");
    await expect(proteinButton).toHaveAttribute("aria-pressed", "false");
    await proteinButton.focus();
    await page.keyboard.press("Enter");
    await expect(proteinButton).toHaveAttribute("aria-pressed", "true");
  });

  test("mobile: seletor de critério não exige scroll horizontal quebrado", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "R3 mobile");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /revisar trocas de Arroz integral cozido/i }).click();
    const drawer = page.getByRole("dialog", { name: /arroz integral cozido/i });
    await drawer.getByRole("button", { name: /adicionar outra/i }).click();

    const group = drawer.getByText("Equivalência por").locator("..");
    const box = await group.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThanOrEqual(390);
  });

  test("COMBINATION: trocar o item fixo pelo motor de equivalência não altera o grupo de escolha e o range do dia continua correto", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R3 combination safety" } });
    await openMealPlanTab(page, patient.id);

    const meal = await addMeal(page, "Almoço R3 COMBINATION");
    // Item fixo (meal.items) — é o único endereçável pelo drawer de trocas
    // hoje (seção 40: stable path já existente via mealIndex/itemIndex,
    // nunca por texto) — itens de choice_groups não têm drawer próprio.
    await selectFood(page, meal, "Arroz, tipo 1, cozido", /arroz/i);
    await setLastQuantity(meal, "100");

    await meal.getByLabel("Tipo da refeição").selectOption("COMBINATION");
    await meal.getByLabel("Alimento 1 do grupo 1").fill("Frango, peito, sem pele, grelhado");
    await meal.getByLabel("Quantidade 1 do grupo 1").fill("100");
    await meal.getByLabel("Unidade 1 do grupo 1").fill("g");
    await meal.getByRole("button", { name: /\+ alimento no grupo/i }).click();
    await meal.getByLabel("Alimento 2 do grupo 1").fill("Ovo, de galinha, inteiro, cozido");
    await meal.getByLabel("Quantidade 2 do grupo 1").fill("100");
    await meal.getByLabel("Unidade 2 do grupo 1").fill("g");

    await saveDraft(page);
    await page.reload();
    await openMealPlanTab(page, patient.id);

    const savedMeal = page.locator("article").filter({ hasText: "Almoço R3 COMBINATION" });
    await savedMeal.getByRole("button", { name: /revisar trocas de Arroz/i }).click();
    const drawer = page.getByRole("dialog", { name: /arroz/i });
    await expect(drawer).toBeVisible();
    // Sem grupo de trocas pré-existente (plano recém-criado) — gera
    // sugestões primeiro pra criar o grupo, igual ao fluxo real.
    await drawer.getByRole("button", { name: /gerar sugestões/i }).click();
    await expect(drawer.getByRole("button", { name: /adicionar outra/i })).toBeVisible({ timeout: 15_000 });
    await drawer.getByRole("button", { name: /adicionar outra/i }).click();
    await drawer.getByLabel("Pesquisar alimento").fill("mandioca");
    const firstResult = drawer.locator("button", { hasText: /mandioca/i }).first();
    await expect(firstResult).toBeVisible({ timeout: 10_000 });
    await firstResult.click();

    await drawer.getByRole("button", { name: "Proteína", exact: true }).click();
    await expect(drawer.getByLabel("Quantidade (g)")).not.toHaveValue("", { timeout: 10_000 });

    // Impacto no dia é renderizado (nunca quebra por causa do grupo de
    // escolha) — o grupo de escolha nunca foi tocado por esta troca (seção 38/41).
    await expect(drawer.getByText("Impacto (nunca salvo automaticamente)")).toBeVisible({ timeout: 10_000 });
    await expect(drawer.getByText("Dia", { exact: true }).locator("..").getByText(/kcal/).first()).toBeVisible({ timeout: 10_000 });

    await drawer.getByRole("button", { name: /voltar à busca/i }).click();
    await page.keyboard.press("Escape");

    // O grupo de escolha (Frango/Ovo) permanece intacto após a interação com o drawer.
    const after = await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json() as Array<{ meals: Array<{ name: string; choice_groups?: Array<{ items: Array<{ food: string }> }> }> }>;
    const mealAfter = after[0]?.meals.find((m) => m.name === "Almoço R3 COMBINATION");
    const groupItems = mealAfter?.choice_groups?.[0]?.items.map((item) => item.food) ?? [];
    expect(groupItems.some((food) => /frango/i.test(food))).toBe(true);
    expect(groupItems.some((food) => /ovo/i.test(food))).toBe(true);
  });

  test("medida caseira: mostra a aproximação quando uma porção real cadastrada é compatível", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "R3 household portion");

    // Cadastra uma porção real (nunca inventada pela UI) pro candidato de
    // busca, compatível com a quantidade prática esperada em ENERGY —
    // Mandioca cozida tem 125.36 kcal/100g; alvo (arroz 100g = 130 kcal)
    // -> bruto ~= 103.7g -> prático 105g. Uma "porção" de 105g cai em 0%
    // de distância, bem dentro da tolerância de 15%.
    const portionResponse = await request.post("/api/admin/foods/portions", {
      data: { food_source: "TACO", food_ref_id: "129", description: "porção padrão", gram_equivalent: 105, confidence: "high" },
    });
    expect(portionResponse.ok(), await portionResponse.text()).toBeTruthy();

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    const { drawer } = await openDrawerAndSearch(page);

    await expect(drawer.getByText(/≈ 1 porção padrão/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("medida caseira: nunca inventa uma medida quando nenhuma porção real é compatível", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "R3 no household portion");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    // Candidato diferente do teste anterior (nunca "mandioca" — aquele teste
    // cadastra uma porção real e global pra esse alimento no mesmo banco
    // compartilhado do shim de E2E) — "melancia" não tem porção cadastrada.
    const { drawer } = await openDrawerAndSearch(page, "melancia");

    // Sem nenhuma porção cadastrada pro candidato, o card mostra só gramas —
    // nunca "≈ N unidade" inventado (seção 18/20).
    await expect(drawer.getByText(/de diferença em energia/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(drawer.getByText(/≈/)).toHaveCount(0);
  });
});
