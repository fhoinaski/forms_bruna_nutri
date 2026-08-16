import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Central de Alimentos", () => {
  test("busca no catalogo unificado, abre detalhes e respeita permissao por source", async ({ page, request }) => {
    await suppressDailyBriefingPopup(page);
    const seed = await request.post("/api/admin/e2e/seed-usda-food");
    expect(seed.ok(), `seed-usda-food falhou (${seed.status()}): ${await seed.text()}`).toBeTruthy();

    const customName = `Central Custom ${Date.now()}`;
    const custom = await request.post("/api/admin/custom-foods", {
      data: {
        name: customName,
        brand: "E2E",
        source: "CUSTOM",
        portion_base_grams: 100,
        energy_kcal: 312,
        protein_g: 11,
        carbohydrate_g: 44,
        fat_g: 9,
        fiber_g: 0,
      },
    });
    expect(custom.ok(), `custom-food falhou (${custom.status()}): ${await custom.text()}`).toBeTruthy();

    await page.goto("/dashboard/alimentos");
    await expect(page.getByRole("heading", { name: "Central de Alimentos" })).toBeVisible();
    await expect(page.getByLabel("Buscar alimento")).toBeVisible();

    await page.getByLabel("Buscar alimento").fill("arroz");
    await expect(page.getByRole("button", { name: /arroz/i }).first()).toBeVisible();
    await page.getByRole("button", { name: /arroz/i }).first().click();
    await expect(page.getByRole("heading", { name: /arroz/i })).toBeVisible();
    await expect(page.getByText("TACO").first()).toBeVisible();
    await expect(page.getByText("Somente leitura para esta fonte.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Referencia por 100g" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Calculadora de quantidade" })).toBeVisible();
    await expect(page.getByText(/Gramas resolvidos:/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Minerais" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Porcoes" })).toBeVisible();

    await page.getByLabel("Buscar alimento").fill("rice");
    await expect(page.getByRole("button", { name: /rice pilot e2e cooked/i })).toBeVisible();
    await page.getByRole("button", { name: /rice pilot e2e cooked/i }).click();
    await expect(page.getByRole("heading", { name: /rice pilot e2e cooked/i })).toBeVisible();
    await expect(page.getByText("USDA").first()).toBeVisible();
    await expect(page.getByText(/Perfil clinico estruturado ainda nao disponivel/i)).toBeVisible();
    await expect(page.getByText("Cálcio")).toBeVisible();
    await expect(page.getByText("10 mg")).toBeVisible();
    await expect(page.getByText("Sem medidas caseiras cadastradas.")).toBeVisible();

    await page.getByRole("button", { name: "Personalizados" }).click();
    await page.getByLabel("Buscar alimento").fill(customName);
    await expect(page.getByRole("button", { name: new RegExp(customName, "i") })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(customName, "i") }).click();
    await expect(page.getByText("Editavel para esta fonte.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^editar$/i })).toBeVisible();
  });
});
