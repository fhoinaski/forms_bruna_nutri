import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

async function createTemplatePlan(request: APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, {
    data: { targetGroup: "ADULTO_SAUDAVEL", title },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ id: string; version: number; status: string }>;
}

test.describe("R3 meal plan editor UX", () => {
  test("rascunho usa linhas compactas, edita um item e revisa trocas em drawer", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    await createTemplatePlan(request, patient.id, "R3 UX compacto");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();

    await expect(page.getByRole("button", { name: /^rascunho - v1$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /revisar trocas de Pao de forma integral/i })).toBeVisible();
    await expect(page.locator("#meal-plan-title")).toBeEnabled();
    await expect(page.locator('input[aria-label="Quantidade"]').first()).toBeHidden();

    await page.getByRole("button", { name: /mais ações do alimento/i }).first().click();
    await page.getByRole("button", { name: /^editar$/i }).click();
    await expect(page.locator('input[aria-label="Alimento"]').first()).toBeVisible();
    await page.getByRole("button", { name: /concluir edição/i }).click();
    await expect(page.locator('input[aria-label="Alimento"]').first()).toBeHidden();

    await page.getByRole("button", { name: /revisar trocas/i }).first().click();
    await expect(page.getByRole("dialog", { name: /pao de forma integral/i })).toBeVisible();
    await page.screenshot({ path: `reports/screenshots/meal-plan-r3-drawer-${testInfo.project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: /fechar trocas/i }).first().click();
    await expect(page.getByRole("dialog", { name: /pao de forma integral/i })).toHaveCount(0);
  });

  test("plano ativo fica compacto e somente leitura; mobile nao sobrepoe controles", async ({ page, request }, testInfo) => {
    const patient = await createTestPatient(request);
    const draft = await createTemplatePlan(request, patient.id, "R3 ativo");
    const publish = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${draft.id}`, {
      data: {
        title: "R3 ativo",
        status: "active",
        meals: [
          {
            name: "Cafe da manha",
            suggested_time: "08:00",
            notes: "Teste R3",
            items: [
              { food: "Pao de forma integral", quantity: "50", unit: "g", food_source: "TACO", food_ref_id: "52" },
              { food: "Ovo de galinha inteiro cozido", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "489" },
            ],
          },
        ],
        substitutions: [],
        supplements: [],
        expectedVersion: draft.version,
      },
    });
    expect(publish.ok(), await publish.text()).toBeTruthy();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();

    await expect(page.getByRole("button", { name: /^ativo - v2$/i })).toBeVisible();
    await expect(page.locator("#meal-plan-title")).toBeDisabled();
    await expect(page.getByRole("button", { name: /^editar$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /mais ações do alimento/i })).toHaveCount(0);
    await expect(page.getByText("50 g", { exact: true })).toBeVisible();
    await page.screenshot({ path: `reports/screenshots/meal-plan-r3-active-${testInfo.project.name}.png`, fullPage: true });
  });
});
