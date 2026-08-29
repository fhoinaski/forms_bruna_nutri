import { execSync } from "node:child_process";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient, seedNutritionRecordForReadiness } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

async function generate(page: import("@playwright/test").Page, patientId: string) {
  await page.goto(`/dashboard/clients/${patientId}`);
  await page.getByRole("tab", { name: "Plano alimentar" }).click();
  await page.getByRole("button", { name: /^criar com ia$/i }).click();
  const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
  await dialog.getByRole("button", { name: /^continuar$/i }).click();
  await dialog.getByRole("button", { name: /^continuar$/i }).click();
  await dialog.getByRole("button", { name: /^continuar$/i }).click();
  await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();
  return dialog;
}

async function saveAndReload(page: import("@playwright/test").Page, dialog: import("@playwright/test").Locator) {
  await dialog.getByRole("button", { name: /^aplicar ao editor$/i }).click();
  await page.getByRole("button", { name: /^salvar rascunho$/i }).click();
  await expect(page.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Plano alimentar" }).click();
}

test.describe("Clinical Copilot R1.2.6 — build freshness", () => {
  test("R1.2.6 build freshness: servidor E2E executa o changeset atual", async ({ request }) => {
    const localSha = execSync("git rev-parse HEAD").toString().trim();
    const response = await request.get("/api/admin/e2e/build-info");
    expect(response.ok(), await response.text()).toBeTruthy();
    const info = (await response.json()) as { buildId: string | null; gitSha: string | null; builtAt: string | null };
    expect(info.gitSha, "servidor E2E rodando sem .next/e2e-build-info.json — rode `npm run build` antes de `npm run test:e2e`.").toBe(localSha);
    expect(info.buildId).toBeTruthy();
    console.log(`CLINICAL_COPILOT_R1_2_6_BUILD_ID=${info.buildId}`);
  });
});

test.describe("Clinical Copilot R1.2.6 — SIMPLE smoke", () => {
  test("SIMPLE full flow: fixture -> gateway -> resolução -> nutrição -> editor -> salvar -> recarregar", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await seedNutritionRecordForReadiness(request, patient.id);
    const fixture = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
      data: { clientId: patient.id, meals: [{ mealKey: "almoco", recipeId: null, structure: "SIMPLE", items: [{ query: "Arroz, tipo 1, cozido", quantity: 100, unit: "g", preparation: "cozido" }] }] },
    });
    expect(fixture.ok(), await fixture.text()).toBeTruthy();
    const dialog = await generate(page, patient.id);
    await expect(dialog.getByText(/^\d+ kcal$/).first()).toBeVisible();
    await saveAndReload(page, dialog);
    const plans = (await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json()) as Array<{ meals: Array<{ meal_structure?: string | null }> }>;
    expect(plans[0]?.meals.some((meal) => !meal.meal_structure || meal.meal_structure === "SIMPLE")).toBe(true);
  });
});

test.describe("Clinical Copilot R1.2.6 — nested REVIEW_REQUIRED / NOT_FOUND", () => {
  test("OPTIONS com um item ambíguo aninhado gera REVIEW_REQUIRED só naquele item, em caminho estável, sem achatar a estrutura", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await seedNutritionRecordForReadiness(request, patient.id);
    const fixture = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
      data: {
        clientId: patient.id,
        meals: [
          {
            mealKey: "almoco",
            structure: "OPTIONS",
            options: [
              { label: "Opção arroz", items: [{ query: "Arroz, tipo 1, cozido", quantity: 100, unit: "g", preparation: "cozido" }] },
              // "batata" (sem qualificador) é genuinamente ambígua no catálogo real
              // — bate em vários tipos de batata, nunca escolhida sozinha.
              { label: "Opção batata", items: [{ query: "batata", quantity: 100, unit: "g" }] },
            ],
          },
        ],
      },
    });
    expect(fixture.ok(), await fixture.text()).toBeTruthy();
    const dialog = await generate(page, patient.id);

    await expect(dialog.getByText("Opção arroz")).toBeVisible();
    await expect(dialog.getByText("Opção batata").first()).toBeVisible();
    await expect(dialog.getByText("Precisa de revisão")).toBeVisible();
    await expect(dialog.getByText(/^"batata"/)).toBeVisible();
    // O item AUTO_MATCH (arroz) nunca aparece na lista de revisão — só o ambíguo.
    await expect(dialog.getByText(/^"Arroz/)).not.toBeVisible();

    // Aplicar fica bloqueado enquanto há pendência (seção 31).
    const applyButton = dialog.getByRole("button", { name: /^aplicar ao editor$/i });
    await expect(applyButton).toBeDisabled();

    // O parágrafo com a query é filho direto do container do item de revisão
    // (ver AiMealPlanWizard.tsx) — subir um nível dá exatamente a linha do
    // item ambíguo, nunca o painel inteiro (que tem outras linhas/candidatos).
    const reviewRow = dialog.getByText(/^"batata"/).locator("..");
    await reviewRow.getByRole("button", { name: /^selecionar$/i }).first().click();

    // Estrutura OPTIONS sobrevive à resolução — continua OPTIONS, nunca achatada.
    await expect(dialog.getByText("Precisa de revisão")).not.toBeVisible();
    await expect(dialog.getByText("Opção arroz")).toBeVisible();
    await expect(dialog.getByText("Opção batata").first()).toBeVisible();
    // Nutrição recalculada após a resolução (kcal segue visível/atualizado).
    await expect(dialog.getByText(/^\d+ kcal$/).first()).toBeVisible();
    await expect(applyButton).toBeEnabled();

    await saveAndReload(page, dialog);
    const plans = (await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json()) as Array<{ meals: Array<{ meal_structure?: string; options?: unknown[] }> }>;
    const meal = plans[0]?.meals.find((entry) => entry.meal_structure === "OPTIONS");
    expect(meal?.options).toHaveLength(2);
  });

  test("item aninhado sem candidato vira NOT_FOUND visível, bloqueia aplicar até ser resolvido/removido", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await seedNutritionRecordForReadiness(request, patient.id);
    const fixture = await request.post("/api/admin/e2e/set-meal-plan-draft-fixture", {
      data: {
        clientId: patient.id,
        meals: [
          {
            mealKey: "almoco",
            structure: "COMBINATION",
            fixed_items: [{ query: "Arroz, tipo 1, cozido", quantity: 80, unit: "g", preparation: "cozido" }],
            choice_groups: [
              {
                title: "Escolha uma proteína",
                min_selections: 1,
                max_selections: 1,
                items: [
                  { query: "Frango, peito, sem pele, grelhado", quantity: 100, unit: "g" },
                  // Query sem nenhuma correspondência real no catálogo canônico.
                  { query: "xyzabc alimento inexistente 12345", quantity: 100, unit: "g", optional: true },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(fixture.ok(), await fixture.text()).toBeTruthy();
    const dialog = await generate(page, patient.id);

    await expect(dialog.getByText("Escolha uma proteína").first()).toBeVisible();
    await expect(dialog.getByText("Precisa de revisão")).toBeVisible();
    await expect(dialog.getByText(/^"xyzabc alimento inexistente 12345"/)).toBeVisible();

    const applyButton = dialog.getByRole("button", { name: /^aplicar ao editor$/i });
    await expect(applyButton).toBeDisabled();

    // Fluxo já existente de resolução manual: remover o item sem correspondência.
    const reviewRow = dialog.getByText(/^"xyzabc alimento inexistente 12345"/).locator("..");
    await reviewRow.getByRole("button", { name: /remover/i }).click();

    await expect(dialog.getByText("Precisa de revisão")).not.toBeVisible();
    await expect(applyButton).toBeEnabled();
    await expect(dialog.getByText("Escolha uma proteína").first()).toBeVisible();
  });
});
