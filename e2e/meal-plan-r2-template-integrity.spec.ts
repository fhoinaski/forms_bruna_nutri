import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient, enablePortalAccess } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

type PlanResponse = {
  id: string;
  version: number;
  meals: Array<{
    name: string;
    meal_context?: string | null;
    items: Array<{
      food: string;
      quantity?: string | null;
      unit?: string | null;
      food_source?: string | null;
      food_ref_id?: string | null;
      slot_nutritional_role?: string | null;
      slot_food_group?: string | null;
      template_slot_id?: string | null;
      slot_exchange_eligible?: boolean | null;
    }>;
  }>;
};

function findItem(plan: PlanResponse, food: RegExp) {
  for (const meal of plan.meals) {
    const item = meal.items.find((row) => food.test(row.food));
    if (item) return { meal, item };
  }
  throw new Error(`Item não encontrado: ${food}`);
}

test.describe("R2 template integrity", () => {
  test("Adulto saudável cria plano íntegro, preserva save/reload e publica com roles/quantidades corretas", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);

    const create = await request.post(`/api/admin/clients/${patient.id}/meal-plans`, {
      data: { targetGroup: "ADULTO_SAUDAVEL", title: "R2 Adulto saudável" },
    });
    expect(create.ok(), await create.text()).toBeTruthy();
    const plan = (await create.json()) as PlanResponse;

    const bread = findItem(plan, /Pao de forma integral/i);
    expect(bread.meal.meal_context).toBe("BREAKFAST");
    expect(bread.item).toMatchObject({ quantity: "50", unit: "g", food_source: "TACO", food_ref_id: "52", slot_nutritional_role: "BREAKFAST_CARB" });

    const rice = findItem(plan, /Arroz integral cozido/i);
    expect(rice.meal.meal_context).toBe("LUNCH");
    expect(rice.item).toMatchObject({ quantity: "120", unit: "g", food_source: "TACO", food_ref_id: "1", slot_nutritional_role: "MAIN_STARCH" });

    expect(findItem(plan, /Feijao carioca cozido/i).item).toMatchObject({ quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "561", slot_nutritional_role: "LEGUME" });
    expect(findItem(plan, /Peito de frango grelhado/i).item.slot_nutritional_role).toBe("MAIN_PROTEIN");
    expect(findItem(plan, /Brocolis cozido/i).item.slot_nutritional_role).toBe("VEGETABLE");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByRole("button", { name: /^rascunho - v1$/i })).toBeVisible();
    await expect(page.getByText("Leguminosa", { exact: true })).toBeVisible();
    await expect(async () => {
      const quantities = await page.locator('input[aria-label="Quantidade"]').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
      expect(quantities).toContain("120");
    }).toPass();

    await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByText("Leguminosa", { exact: true })).toBeVisible();
    await expect(async () => {
      const quantities = await page.locator('input[aria-label="Quantidade"]').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
      expect(quantities).toContain("120");
    }).toPass();

    await page.getByRole("button", { name: /^revisar e publicar$/i }).click();
    await expect(page.getByRole("dialog", { name: /revisão do plano/i })).toBeVisible();
    await expect(page.getByText("Plano pronto para publicação.")).toBeVisible();
    await page.getByRole("button", { name: /publicar plano/i }).click();
    await expect(page.getByText(/^plano ativado no portal do cliente\.$/i)).toBeVisible();

    await page.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar`);
    await expect(page.getByText(/Plano alimentar ativo/i)).toBeVisible();
    await expect(page.getByText("50 g", { exact: true })).toBeVisible();
    await expect(page.getByText("120 g", { exact: true }).first()).toBeVisible();

    await page.goto("/portal");
    await page.getByPlaceholder("seunome@email.com").fill(patient.email);
    await page.getByLabel("Senha").fill(code);
    await page.getByRole("button", { name: /acessar meu portal/i }).click();
    await expect(page.getByText("Plano alimentar", { exact: true })).toBeVisible();
    await expect(page.getByText("50 g", { exact: true })).toBeVisible();
    await expect(page.getByText("120 g", { exact: true }).first()).toBeVisible();
  });
});
