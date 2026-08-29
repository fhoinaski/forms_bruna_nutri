import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

/**
 * Modo Consulta — o fluxo E2E mais importante do sistema (secao 7 do
 * pedido). Cobre: abrir paciente, iniciar consulta, carregar
 * ConsultationWorkspace, registro clínico, ações para antropometria/plano,
 * protocolo, finalizar, recarregar e confirmar persistencia.
 *
 * Nao depende de LLM real: o briefing de IA e opcional/gracioso (sem
 * provedor configurado, o systemData deterministico continua util —
 * comportamento ja existente e coberto por testes unitarios dedicados) e a
 * finalizacao da consulta nunca depende de IA (checklist nao bloqueante).
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

function clinicalField(page: import("@playwright/test").Page, label: string) {
  return page.locator("label").filter({ has: page.locator("span:first-child").filter({ hasText: label }) }).locator("textarea");
}

test.describe("Modo Consulta", () => {
  test("fluxo completo: iniciar, preencher, finalizar e persistir", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("button", { name: "Iniciar primeira consulta" }).click();

    await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${patient.id}/consulta\\?sessionId=`));
    await expect(page.getByRole("heading", { level: 1, name: patient.name })).toBeVisible();
    await expect(page.getByText(/em atendimento/i)).toBeVisible();

    const activeSessionResponse = await page.request.get(`/api/admin/clients/${patient.id}/consultation`);
    const activeSessionId = (await activeSessionResponse.json()).session.id as string;

    // P6 consolidou a consulta em um registro clínico e ações de navegação;
    // as tabs antigas de antropometria, consulta, plano e protocolo não são
    // mais parte do contrato.
    await expect(page.getByRole("complementary", { name: "Contexto do paciente" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Visão clínica" })).toBeVisible();
    await expect(page.getByLabel("Contexto do paciente").getByText("Sem avaliação registrada")).toBeVisible();
    await expect(page.getByLabel("Contexto do paciente").getByText("Nenhum plano ativo")).toBeVisible();
    await expect(page.getByText("Nenhum protocolo ativo")).toBeVisible();
    await expect(page.getByRole("button", { name: "Nova avaliação" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Abrir plano alimentar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ver anamnese" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Abrir protocolos" })).toBeVisible();

    // O registro clínico fica organizado pelas etapas Mudanças e Recomendações.
    const stepNavigation = page.getByRole("navigation", { name: "Etapas da consulta" });
    await stepNavigation.getByRole("button", { name: /Mudanças$/ }).click();
    await clinicalField(page, "Evolução desde a última consulta").fill("Paciente relata boa adesão ao plano.");
    await clinicalField(page, "Adesão").fill("Sem intercorrências.");
    page.once("dialog", (dialog) => dialog.accept());
    await stepNavigation.getByRole("button", { name: /Recomendações$/ }).click();
    await clinicalField(page, "Conduta").fill("Manter organização das refeições.");
    await expect(page.getByText("Alterações não salvas").first()).toBeVisible();
    await page.getByRole("button", { name: "Salvar" }).first().click();
    await expect(page.getByText("Salvo").first()).toBeVisible();
    await page.reload();
    await stepNavigation.getByRole("button", { name: /Mudanças$/ }).click();
    await expect(clinicalField(page, "Evolução desde a última consulta")).toHaveValue("Paciente relata boa adesão ao plano.");
    await stepNavigation.getByRole("button", { name: /Recomendações$/ }).click();
    await expect(clinicalField(page, "Conduta")).toHaveValue("Manter organização das refeições.");

    // Ações P6 substituem as tabs e preservam o vínculo de retorno da sessão.
    await page.getByRole("button", { name: "Nova avaliação" }).click();
    await expect(page).toHaveURL(new RegExp(`tab=antropometria.*consultationId=${activeSessionId}`));
    await page.goto(`/dashboard/clients/${patient.id}/consulta?sessionId=${activeSessionId}`);
    await expect(page.getByRole("heading", { name: "Visão clínica" })).toBeVisible();

    await page.getByRole("button", { name: "Abrir plano alimentar" }).click();
    await expect(page).toHaveURL(new RegExp(`tab=plano-alimentar.*consultationId=${activeSessionId}`));
    await expect(page.getByRole("link", { name: "Voltar à consulta" })).toBeVisible();
    await page.getByRole("link", { name: "Voltar à consulta" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${patient.id}/consulta\\?sessionId=${activeSessionId}`));

    // Finalizar consulta.
    await page.getByRole("button", { name: /^finalizar consulta$/i }).click();
    await page.getByRole("button", { name: /^finalizar consulta$/i }).last().click();
    await expect(page.getByText(/consulta finalizada/i)).toBeVisible();

    // Persistência: a sessão de consulta real ficou marcada como concluída.
    // (GET /api/admin/clients/[id]/consultation só retorna sessão 'in_progress' —
    // usa-se aqui o endpoint por id, que retorna a sessão em qualquer status.)
    const sessionResponse = await page.request.get(`/api/admin/consultation-sessions/${activeSessionId}?clientId=${patient.id}`);
    expect(sessionResponse.ok()).toBe(true);
    const sessionBody = await sessionResponse.json();
    expect(sessionBody.session?.status).toBe("completed");

    // Voltar para a ficha e recarregar confirma que nada quebrou.
    await page.getByRole("button", { name: /voltar para a ficha/i }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${patient.id}$`));
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: patient.name })).toBeVisible();
  });

  test("reabrir o Modo Consulta de uma sessão já em andamento retoma a mesma sessão (idempotente)", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("button", { name: "Iniciar primeira consulta" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${patient.id}/consulta\\?sessionId=`));

    const firstResponse = await page.request.get(`/api/admin/clients/${patient.id}/consultation`);
    const firstSession = (await firstResponse.json()).session;

    // Sai e tenta iniciar de novo — nunca cria uma segunda sessão in_progress.
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.locator(".brand-card > header").getByRole("button", { name: "Continuar consulta" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${patient.id}/consulta\\?sessionId=`));

    const secondResponse = await page.request.get(`/api/admin/clients/${patient.id}/consultation`);
    const secondSession = (await secondResponse.json()).session;
    expect(secondSession.id).toBe(firstSession.id);
  });

  test("navega pelas sete etapas preservando sessão, deep link, reload e histórico", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("button", { name: "Iniciar primeira consulta" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${patient.id}/consulta\\?sessionId=`));

    const sessionId = new URL(page.url()).searchParams.get("sessionId");
    expect(sessionId).not.toBeNull();
    const steps = ["Resumo", "Mudanças", "Anamnese", "Antropometria", "Plano", "Recomendações", "Retorno"];
    const stepIds = ["resumo", "mudancas", "anamnese", "antropometria", "plano", "recomendacoes", "retorno"];
    const stepNavigation = page.getByRole("navigation", { name: "Etapas da consulta" });

    await expect(stepNavigation).toBeVisible();
    await expect(stepNavigation.getByRole("button", { name: /Resumo$/ })).toHaveAttribute("aria-current", "step");

    for (const [index, step] of steps.entries()) {
      const stepButton = stepNavigation.getByRole("button", { name: new RegExp(`${step}$`) });
      await stepButton.click();
      await expect(page).toHaveURL(new RegExp(`sessionId=${sessionId}.*step=${stepIds[index]}`));
      await expect(stepButton).toHaveAttribute("aria-current", "step");
    }

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`sessionId=${sessionId}.*step=retorno`));
    await expect(stepNavigation.getByRole("button", { name: /Retorno$/ })).toHaveAttribute("aria-current", "step");

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`sessionId=${sessionId}.*step=recomendacoes`));
    await expect(stepNavigation.getByRole("button", { name: /Recomendações$/ })).toHaveAttribute("aria-current", "step");

    await page.goto(`/dashboard/clients/${patient.id}/consulta?sessionId=${sessionId}&step=antropometria`);
    await expect(stepNavigation.getByRole("button", { name: /Antropometria$/ })).toHaveAttribute("aria-current", "step");
  });
});
