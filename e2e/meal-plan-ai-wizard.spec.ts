import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

/**
 * Assistente guiado "Criar com IA" (wizard de pre-plano). O ambiente de
 * E2E nunca tem um provedor de IA real configurado (mesma convencao do
 * resto da suite — ver e2e/ai-guardrails.spec.ts) — este teste prova a
 * PARTE deterministica do fluxo: contexto do paciente carrega de
 * repositorios reais, o wizard nunca persiste nada sozinho, e uma falha
 * do provedor de IA produz o fallback correto (secao 35 do pedido:
 * "Tentar novamente" / "Continuar manualmente"), nunca uma tela quebrada
 * nem um plano fantasma. A geracao real por LLM (schema estruturado,
 * resolucao de alimentos, seguranca clinica) ja tem cobertura unitaria
 * completa e determinística em tests/ai-meal-plan-draft-agent.test.ts.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("assistente guiado de criacao de plano com IA", () => {
  test("wizard carrega contexto real do paciente, nunca ativa automaticamente, e falha graciosamente sem provedor de IA configurado", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();

    // Nenhum plano existe ainda para este paciente de teste.
    const plansBefore = (await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json()) as unknown[];
    expect(plansBefore).toHaveLength(0);

    await page.getByRole("button", { name: /^criar com ia$/i }).click();
    const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    await expect(dialog).toBeVisible();

    // Etapa 1: contexto do paciente — 100% deterministico (sem chamar IA).
    await expect(dialog.getByText(/vou usar os dados clínicos/i)).toBeVisible();
    await expect(dialog.getByText(/dados considerados/i)).toBeVisible();
    await expect(dialog.getByText(/nenhum dado antropométrico cadastrado/i)).toBeVisible();

    // Nada foi persistido so por abrir o wizard e ver o contexto.
    const plansAfterContext = (await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json()) as unknown[];
    expect(plansAfterContext).toHaveLength(0);

    await dialog.getByRole("button", { name: /^continuar$/i }).click();

    // Etapa 2: objetivo e meta.
    await expect(dialog.getByText(/qual objetivo deste plano/i)).toBeVisible();
    await expect(dialog.getByText(/meta energética ainda não definida/i)).toBeVisible();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();

    // Etapa 3: refeicoes — checkboxes default (cafe/almoco/lanche da tarde/jantar marcados).
    await expect(dialog.getByText(/quais refeições este plano deve ter/i)).toBeVisible();
    const almocoCheckbox = dialog.locator("#meal-toggle-almoco");
    await expect(almocoCheckbox).toBeChecked();
    const ceiaCheckbox = dialog.locator("#meal-toggle-ceia");
    await expect(ceiaCheckbox).not.toBeChecked();
    await dialog.getByRole("button", { name: /^continuar$/i }).click();

    // Etapa 4: preferencias.
    await expect(dialog.getByText(/alimentos para priorizar/i)).toBeVisible();

    // Gerar -> sem provedor de IA configurado nesta suite -> fallback correto.
    await dialog.getByRole("button", { name: /^gerar pré-plano$/i }).click();
    await expect(dialog.getByText(/não conseguimos estruturar o pré-plano/i)).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByRole("button", { name: /^tentar novamente$/i })).toBeVisible();
    const continueManuallyButton = dialog.getByRole("button", { name: /^continuar manualmente$/i });
    await expect(continueManuallyButton).toBeVisible();

    // Nunca criou/ativou nenhum plano so por a geracao ter falhado.
    const plansAfterFailure = (await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json()) as unknown[];
    expect(plansAfterFailure).toHaveLength(0);

    await continueManuallyButton.click();
    await expect(dialog).not.toBeVisible();

    // O profissional continua exatamente onde sempre esteve — pode criar por modelo normalmente.
    await expect(page.getByRole("button", { name: /^criar por modelo$/i })).toBeVisible();
  });

  test("contexto do wizard reflete restrições clínicas reais cadastradas", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    // v1 e criada de forma lazy na primeira leitura (mesmo padrao de
    // e2e/nutrition-record-versioning.spec.ts).
    const initialRecord = await request.get(`/api/admin/clients/${patient.id}/nutrition-record`);
    expect(initialRecord.ok()).toBe(true);
    const nutritionResponse = await request.patch(`/api/admin/clients/${patient.id}/nutrition-record`, {
      data: { current_weight_kg: "70", height_cm: "170", allergies: "Amendoim", expectedVersion: (await initialRecord.json()).version },
    });
    expect(nutritionResponse.ok(), await nutritionResponse.text()).toBeTruthy();

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Plano alimentar" }).click();
    await page.getByRole("button", { name: /^criar com ia$/i }).click();

    const dialog = page.getByRole("dialog", { name: /criar plano com ia/i });
    await expect(dialog.getByText("70 kg")).toBeVisible();
    await expect(dialog.getByText("170 cm")).toBeVisible();
    await expect(dialog.getByText(/amendoim/i)).toBeVisible();
  });
});
