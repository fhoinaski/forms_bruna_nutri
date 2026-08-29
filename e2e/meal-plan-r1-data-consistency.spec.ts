import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient, enablePortalAccess } from "./helpers/test-data";

test.use({ storageState: ADMIN_STORAGE_STATE });

async function createTemplatePlan(request: APIRequestContext, patientId: string, title: string) {
  const response = await request.post(`/api/admin/clients/${patientId}/meal-plans`, {
    data: { targetGroup: "ADULTO_SAUDAVEL", title },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{ id: string; version: number; status: string }>;
}

function planPayload(status: "draft" | "active", expectedVersion: number, quantities: { bread: string; egg: string; rice: string }) {
  return {
    title: "Plano ativo antigo",
    status,
    meals: [
      {
        name: "Cafe da manha",
        suggested_time: null,
        notes: null,
        items: [
          { food: "Pao de forma integral", quantity: quantities.bread, unit: "g", food_source: "TACO", food_ref_id: "52" },
          { food: "Ovo de galinha inteiro cozido", quantity: quantities.egg, unit: "g", food_source: "TACO", food_ref_id: "489" },
        ],
      },
      {
        name: "Almoco",
        suggested_time: null,
        notes: null,
        items: [
          { food: "Arroz integral cozido", quantity: quantities.rice, unit: "g", food_source: "TACO", food_ref_id: "1" },
        ],
      },
    ],
    substitutions: [],
    supplements: [],
    expectedVersion,
  };
}

test.describe("R1 data consistency", () => {
  test("active antigo e draft por modelo ficam explícitos; portal/print oficial não usam draft antes da publicação", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);

    const activeDraft = await createTemplatePlan(request, patient.id, "Plano ativo antigo");
    const publishActive = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${activeDraft.id}`, {
      data: planPayload("active", activeDraft.version, { bread: "100", egg: "200", rice: "240" }),
    });
    expect(publishActive.ok()).toBeTruthy();
    const active = await publishActive.json() as { id: string; version: number };
    expect(active.version).toBe(2);

    const draft = await createTemplatePlan(request, patient.id, "Rascunho golden");

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(page.getByRole("button", { name: /^ativo - v2$/i })).toBeVisible();
    await page.getByRole("button", { name: /^rascunho - v1$/i }).click();
    await expect(page.getByText(/portal e impressão oficial continuam usando a versão ativa/i)).toBeVisible();
    await expect(page.locator('input[aria-label="Quantidade"]').first()).toHaveValue("50");

    await page.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar`);
    await expect(page.getByText(/Plano alimentar ativo/i)).toBeVisible();
    await expect(page.getByText("100 g", { exact: true })).toBeVisible();
    await expect(page.getByText("200 g", { exact: true })).toBeVisible();
    await expect(page.getByText("240 g", { exact: true })).toBeVisible();

    await page.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar&planId=${draft.id}`);
    await expect(page.getByText(/Prévia do rascunho do plano alimentar/i)).toBeVisible();
    await expect(page.getByText("50 g", { exact: true })).toBeVisible();
    await expect(page.getByText("100 g", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("120 g", { exact: true }).first()).toBeVisible();

    await page.goto("/portal");
    await page.getByPlaceholder("seunome@email.com").fill(patient.email);
    await page.getByLabel("Senha").fill(code);
    await page.getByRole("button", { name: /acessar meu portal/i }).click();
    await expect(page.getByText("Plano alimentar", { exact: true })).toBeVisible();
    await expect(page.getByText("v2", { exact: true })).toBeVisible();
    await expect(page.getByText("240 g", { exact: true })).toBeVisible();

    const publishDraft = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${draft.id}`, {
      data: {
        title: "Rascunho golden publicado",
        status: "active",
        meals: [
          {
            name: "Cafe da manha",
            suggested_time: null,
            notes: null,
            items: [
              { food: "Pao de forma integral", quantity: "50", unit: "g", food_source: "TACO", food_ref_id: "52" },
              { food: "Ovo de galinha inteiro cozido", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "489" },
              { food: "Banana prata", quantity: "80", unit: "g", food_source: "TACO", food_ref_id: "182" },
            ],
          },
          {
            name: "Almoco",
            suggested_time: null,
            notes: null,
            items: [
              { food: "Arroz integral cozido", quantity: "120", unit: "g", food_source: "TACO", food_ref_id: "1" },
            ],
          },
        ],
        substitutions: [],
        supplements: [],
        expectedVersion: draft.version,
      },
    });
    expect(publishDraft.ok()).toBeTruthy();

    await page.goto(`/dashboard/clients/${patient.id}/print?secao=plano-alimentar`);
    await expect(page.getByText(/Plano alimentar ativo/i)).toBeVisible();
    await expect(page.getByText("50 g", { exact: true })).toBeVisible();
    await expect(page.getByText("120 g", { exact: true })).toBeVisible();
    await expect(page.getByText("240 g", { exact: true })).toHaveCount(0);
  });
});
