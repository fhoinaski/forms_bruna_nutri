import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";
import { openMealPlanTab } from "./helpers/meal-plan-editor";

test.use({ storageState: ADMIN_STORAGE_STATE });
test.describe.configure({ timeout: 60_000 });

// IDs TACO reais já usados em outras suítes deste repo (id -> nome real).
const TACO_IDS = ["1", "3", "52", "86", "88", "100", "182", "312", "410", "489", "561"];

function simpleItem(index: number) {
  const id = TACO_IDS[index % TACO_IDS.length];
  return { food: `Alimento TACO ${id}`, quantity: String(80 + (index % 5) * 10), unit: "g", food_source: "TACO" as const, food_ref_id: id };
}

function buildLargePlan() {
  const meals = [];
  let itemCounter = 0;
  const mealNames = ["Café da manhã", "Lanche da manhã", "Almoço", "Lanche da tarde", "Jantar", "Ceia", "Extra"];
  for (let mealIndex = 0; mealIndex < mealNames.length; mealIndex++) {
    const itemsInMeal = 5;
    const items = Array.from({ length: itemsInMeal }, () => simpleItem(itemCounter++));
    if (mealIndex === 2) {
      // Almoço vira OPTIONS.
      meals.push({
        name: mealNames[mealIndex], suggested_time: null, notes: null, source_recipe_id: null,
        meal_structure: "OPTIONS" as const, items,
        options: [
          { label: "Opção A", items: [simpleItem(itemCounter++)] },
          { label: "Opção B", items: [simpleItem(itemCounter++)] },
        ],
      });
    } else if (mealIndex === 4) {
      // Jantar vira COMBINATION.
      meals.push({
        name: mealNames[mealIndex], suggested_time: null, notes: null, source_recipe_id: null,
        meal_structure: "COMBINATION" as const, items,
        choice_groups: [
          { title: "Escolha 1", min_selections: 1, max_selections: 1, items: [simpleItem(itemCounter++), simpleItem(itemCounter++)] },
        ],
      });
    } else {
      meals.push({ name: mealNames[mealIndex], suggested_time: null, notes: null, source_recipe_id: null, items });
    }
  }
  return { meals, totalItems: itemCounter };
}

test.describe("Meal Plan Composer R2 — Large plan / N+1 audit", () => {
  test("plano grande (7 refeições, mistura SIMPLE/OPTIONS/COMBINATION, ~37 itens) renderiza, hidrata e salva sem N+1", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const create = await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL", title: "R2 Large Plan" } });
    expect(create.ok(), await create.text()).toBeTruthy();
    const plan = await create.json() as { id: string; version: number };

    const { meals, totalItems } = buildLargePlan();
    expect(totalItems).toBeGreaterThanOrEqual(30);
    const put = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}`, {
      data: { title: "R2 Large Plan", status: "draft", notes: null, meals, substitutions: [], supplements: [], expectedVersion: plan.version },
    });
    expect(put.ok(), await put.text()).toBeTruthy();

    const resolveRequests: string[] = [];
    const searchRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/admin/foods/resolve")) resolveRequests.push(req.url());
      if (req.url().includes("/api/admin/foods/search")) searchRequests.push(req.url());
    });

    const startedAt = Date.now();
    await openMealPlanTab(page, patient.id);
    const sidebar = page.locator("aside", { hasText: "Plano do dia" });
    await expect(sidebar.getByText(/^\d+(–\d+)? kcal$/)).toBeVisible({ timeout: 20_000 });
    const renderMs = Date.now() - startedAt;

    // N+1 audit (seção 15/21): hidratação estruturada é em lote — não deve
    // crescer proporcionalmente ao número de itens (37 itens, poucas
    // dezenas de refs únicas). Um número pequeno e fixo de chamadas é
    // aceitável (uma por instância do hook que consome a hidratação), nunca
    // 1 request por item.
    expect(resolveRequests.length).toBeLessThan(10);
    expect(searchRequests.length).toBeLessThan(5);

    // Editar quantidade de um item (entra em modo edição pelo menu "Mais
    // ações") e medir o tempo até a Live Nutrition atualizar.
    const before = await sidebar.locator("p.text-lg").first().textContent();
    await page.getByRole("button", { name: /mais ações do alimento/i }).first().click();
    await page.getByRole("button", { name: /^editar$/i }).click();
    const quantityInput = page.locator('input[aria-label="Quantidade"]:visible').first();
    await expect(quantityInput).toBeVisible({ timeout: 10_000 });
    const editStarted = Date.now();
    await quantityInput.fill("999");
    await expect(async () => {
      const after = await sidebar.locator("p.text-lg").first().textContent();
      expect(after).not.toBe(before);
    }).toPass({ timeout: 10_000 });
    const quantityUpdateMs = Date.now() - editStarted;

    // Confirma o save pela resposta real do PUT (mais robusto que esperar o
    // toast, que pode desaparecer antes da checagem num plano grande).
    const savePutPromise = page.waitForResponse((response) => response.url().includes("/meal-plans/") && response.request().method() === "PUT", { timeout: 20_000 });
    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    const saveResponse = await savePutPromise;
    expect(saveResponse.ok(), await saveResponse.text()).toBeTruthy();

    console.log(`MEAL_PLAN_COMPOSER_R2_FINAL_LARGE_PLAN_RENDER_MS=${renderMs}`);
    console.log(`MEAL_PLAN_COMPOSER_R2_FINAL_QUANTITY_MS=${quantityUpdateMs}`);
    console.log(`MEAL_PLAN_COMPOSER_R2_FINAL_RESOLVE_REQUESTS=${resolveRequests.length}`);
    console.log(`MEAL_PLAN_COMPOSER_R2_FINAL_SEARCH_REQUESTS=${searchRequests.length}`);
  });
});
