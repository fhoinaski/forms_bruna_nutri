import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";
import { addMeal, openMealPlanTab, saveDraft, selectFood, setLastQuantity } from "./helpers/meal-plan-editor";

test.use({ storageState: ADMIN_STORAGE_STATE });

async function createDraftPlan(request: APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ id: string }>;
}

async function openLibrary(page: Page) {
  await page.getByRole("button", { name: "Usar modelo" }).click();
  const drawer = page.getByRole("dialog", { name: "Biblioteca de reuso" });
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe("Meal Plan Reuse R4 — Biblioteca de reuso", () => {
  test("alimento recente: usar um alimento no editor e reabrir a biblioteca mostra em Recentes", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createDraftPlan(request, patient.id, "R4 recent food");
    await openMealPlanTab(page, patient.id);

    const meal = await addMeal(page, "Café R4");
    await selectFood(page, meal, "Arroz, tipo 1, cozido", /arroz/i);
    await setLastQuantity(meal, "100");

    const drawer = await openLibrary(page);
    await expect(drawer.getByText(/arroz/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("favoritar um alimento em Recentes e ele aparece em Favoritos e persiste após reabrir", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createDraftPlan(request, patient.id, "R4 favorite food");
    await openMealPlanTab(page, patient.id);

    const meal = await addMeal(page, "Café R4 fav");
    await selectFood(page, meal, "Arroz, tipo 1, cozido", /arroz/i);
    await setLastQuantity(meal, "100");

    let drawer = await openLibrary(page);
    await expect(drawer.getByText(/arroz/i).first()).toBeVisible({ timeout: 10_000 });
    await drawer.getByRole("button", { name: /favoritar/i }).first().click();
    await drawer.getByRole("tab", { name: "Favoritos" }).click();
    await expect(drawer.getByText(/arroz/i).first()).toBeVisible({ timeout: 10_000 });

    // Fecha e reabre — favorito continua lá (persistiu no banco, não só em memória).
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    drawer = await openLibrary(page);
    await drawer.getByRole("tab", { name: "Favoritos" }).click();
    await expect(drawer.getByText(/arroz/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("refeição salva: salvar, aplicar num novo draft, salvar/reload preserva a estrutura", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createDraftPlan(request, patient.id, "R4 saved meal source");
    await openMealPlanTab(page, patient.id);

    const meal = await addMeal(page, "Refeição modelo R4");
    await selectFood(page, meal, "Arroz, tipo 1, cozido", /arroz/i);
    await setLastQuantity(meal, "100");

    await meal.getByRole("button", { name: /mais ações para/i }).click();
    await page.getByRole("button", { name: "Salvar como refeição favorita" }).click();
    const saveDialog = page.getByRole("dialog", { name: "Salvar refeição favorita" });
    await expect(saveDialog).toBeVisible();
    await saveDialog.getByLabel("Nome").fill("Refeição modelo R4 salva");
    await saveDialog.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Refeição salva na biblioteca de reuso.")).toBeVisible({ timeout: 10_000 });

    // Novo plano/draft — aplica a refeição salva nele.
    const patient2 = await createTestPatient(request);
    await createDraftPlan(request, patient2.id, "R4 saved meal target");
    await openMealPlanTab(page, patient2.id);

    const drawer = await openLibrary(page);
    await drawer.getByRole("tab", { name: "Minhas refeições" }).click();
    // O nome exibido na biblioteca é o rótulo dado ao salvar ("... salva");
    // o nome DA REFEIÇÃO em si (meal.name) é preservado como estava — só a
    // estrutura é reaproveitada, nunca renomeia a refeição capturada.
    await drawer.getByRole("button", { name: /refeição modelo r4 salva/i }).click();
    await expect(drawer).not.toBeVisible();

    const insertedMeal = page.locator("article").filter({ hasText: "Refeição modelo R4" }).last();
    await expect(insertedMeal).toBeVisible();
    // O item recém-inserido entra em modo de edição (mesmo padrão de
    // "adicionar refeição") — o nome do alimento aparece no VALOR do campo,
    // não como texto estático.
    await expect(insertedMeal.locator('input[aria-label="Alimento"]').first()).toHaveValue(/arroz/i);
    await saveDraft(page);

    // Verifica a persistência real via API (mais robusto que reler o DOM
    // após reload) — a estrutura (nome do alimento, identidade canônica)
    // sobreviveu ao ciclo salvar/recarregar.
    const plansAfter = await (await request.get(`/api/admin/clients/${patient2.id}/meal-plans`)).json() as Array<{ meals: Array<{ name: string; items: Array<{ food: string; food_source?: string | null; food_ref_id?: string | null }> }> }>;
    const persistedMeal = plansAfter[0]?.meals.find((m) => m.name === "Refeição modelo R4");
    expect(persistedMeal).toBeTruthy();
    expect(persistedMeal!.items.some((item) => /arroz/i.test(item.food) && item.food_source === "TACO")).toBe(true);
  });

  test("copiar refeição de outro plano do mesmo paciente", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createDraftPlan(request, patient.id, "R4 copy source");
    await openMealPlanTab(page, patient.id);
    const sourceMeal = await addMeal(page, "Refeição de origem R4");
    await selectFood(page, sourceMeal, "Arroz, tipo 1, cozido", /arroz/i);
    await setLastQuantity(sourceMeal, "100");
    await saveDraft(page);

    // Novo draft do MESMO paciente — o mais recente fica selecionado ao reabrir a aba.
    await createDraftPlan(request, patient.id, "R4 copy target");
    await openMealPlanTab(page, patient.id);

    const drawer = await openLibrary(page);
    await drawer.getByRole("tab", { name: "Planos anteriores" }).click();
    await expect(drawer.getByText("R4 copy source")).toBeVisible({ timeout: 10_000 });
    await drawer.getByText("R4 copy source").click();
    await drawer.getByRole("button", { name: /refeição de origem r4/i }).click();
    await expect(drawer).not.toBeVisible();
    await expect(page.locator("article").filter({ hasText: "Refeição de origem R4" })).toBeVisible();
  });

  test("modelos de plano: aplicar insere as refeições do modelo no draft atual", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createDraftPlan(request, patient.id, "R4 template apply");
    await openMealPlanTab(page, patient.id);

    const drawer = await openLibrary(page);
    await drawer.getByRole("tab", { name: "Modelos de planos" }).click();
    const firstTemplate = drawer.locator("li button").first();
    await expect(firstTemplate).toBeVisible({ timeout: 10_000 });
    await firstTemplate.click();
    await expect(drawer).not.toBeVisible();
    // Ao menos uma refeição nova foi inserida no draft (nunca auto-salva).
    await expect(page.locator("article").first()).toBeVisible();
  });

  test("acessibilidade: Escape fecha a biblioteca e devolve o foco ao botão que abriu", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createDraftPlan(request, patient.id, "R4 accessibility");
    await openMealPlanTab(page, patient.id);

    const trigger = page.getByRole("button", { name: "Usar modelo" });
    await trigger.click();
    const drawer = page.getByRole("dialog", { name: "Biblioteca de reuso" });
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("mobile: biblioteca abre como folha inferior", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const patient = await createTestPatient(request);
    await createDraftPlan(request, patient.id, "R4 mobile");
    await openMealPlanTab(page, patient.id);

    const drawer = await openLibrary(page);
    const box = await drawer.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(340);
  });

  test("estado vazio: sem recentes/modelos mostra mensagem clara, nunca quebra o Composer", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await createDraftPlan(request, patient.id, "R4 empty state");
    await openMealPlanTab(page, patient.id);

    const drawer = await openLibrary(page);
    await drawer.getByRole("tab", { name: "Planos anteriores" }).click();
    await expect(drawer.getByText(/nenhum outro plano/i)).toBeVisible({ timeout: 10_000 });
  });
});
