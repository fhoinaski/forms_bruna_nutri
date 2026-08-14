import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

/**
 * Modo Consulta — o fluxo E2E mais importante do sistema (secao 7 do
 * pedido). Cobre: abrir paciente, iniciar consulta, carregar
 * ConsultationWorkspace, briefing, antropometria, notas, plano, protocolo,
 * pendencias, finalizar, recarregar e confirmar persistencia.
 *
 * Nao depende de LLM real: o briefing de IA e opcional/gracioso (sem
 * provedor configurado, o systemData deterministico continua util —
 * comportamento ja existente e coberto por testes unitarios dedicados) e a
 * finalizacao da consulta nunca depende de IA (checklist nao bloqueante).
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Modo Consulta", () => {
  test("fluxo completo: iniciar, preencher, finalizar e persistir", async ({ page, request }) => {
    const patient = await createTestPatient(request);
    await suppressDailyBriefingPopup(page);

    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("button", { name: /iniciar consulta/i }).click();

    await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${patient.id}/consulta$`));
    await expect(page.getByRole("heading", { level: 1, name: patient.name })).toBeVisible();
    await expect(page.getByText(/consulta em andamento/i)).toBeVisible();

    const activeSessionResponse = await page.request.get(`/api/admin/clients/${patient.id}/consultation`);
    const activeSessionId = (await activeSessionResponse.json()).session.id as string;

    // Briefing (dados determinísticos do sistema, sempre disponíveis).
    await expect(page.getByRole("heading", { name: "Resumo para consulta" })).toBeVisible();

    // Antropometria.
    await page.getByRole("tab", { name: "Antropometria" }).click();
    await page.getByRole("button", { name: /registrar medidas/i }).click();
    await page.getByPlaceholder("Ex: 68.5").fill("70.5");
    await page.getByPlaceholder("Ex: 165").fill("165");
    await page.getByRole("button", { name: /^registrar evolu[cç][aã]o$/i }).click();
    // Sucesso fecha o formulário e atualiza o resumo com a nova medida.
    await expect(page.getByRole("button", { name: /registrar medidas/i })).toBeVisible();
    await expect(page.getByText("70.5").first()).toBeVisible();

    // Notas da consulta (aba Consulta).
    await page.getByRole("tab", { name: "Consulta" }).click();
    const notes = page.getByPlaceholder(/Escreva livremente durante o atendimento/i);
    await notes.fill("Paciente relata boa adesão ao plano. Sem intercorrências.");
    await expect(page.getByText(/^salvo$/i)).toBeVisible({ timeout: 10_000 });

    // Plano alimentar (reaproveita o MealPlanEditor real).
    await page.getByRole("tab", { name: "Plano" }).click();
    await expect(page.getByRole("button", { name: /criar por modelo/i })).toBeVisible();

    // Protocolo (read-only nesta fase).
    await page.getByRole("tab", { name: "Protocolo" }).click();
    await expect(page.getByText(/nenhum protocolo ativo/i)).toBeVisible();

    // Pendências visíveis no cabeçalho/resumo (paciente novo: tudo zerado).
    // {exact:true} evita colidir com o "0" que aparece como substring dentro
    // de um id de cliente (uuid) em outro lugar da página — achado real ao
    // rodar a suíte em viewport mobile, onde a ordem/composição do DOM
    // muda o suficiente para esse falso-positivo aparecer no primeiro match.
    await page.getByRole("tab", { name: "Consulta" }).click();
    await expect(page.getByText("Tarefas pendentes")).toBeVisible();
    await expect(page.getByText("0", { exact: true }).first()).toBeVisible();

    // Finalizar consulta.
    await page.getByRole("button", { name: /^finalizar consulta$/i }).click();
    await page.getByRole("button", { name: /^finalizar consulta$/i }).last().click();
    await expect(page.getByText(/consulta finalizada/i)).toBeVisible();

    // Persistência: a sessão de consulta real ficou marcada como concluída.
    // (GET /api/admin/clients/[id]/consultation só retorna sessão 'in_progress' —
    // usa-se aqui o endpoint por id, que retorna a sessão em qualquer status.)
    const sessionResponse = await page.request.get(`/api/admin/consultation-sessions/${activeSessionId}`);
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
    await page.getByRole("button", { name: /iniciar consulta/i }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${patient.id}/consulta$`));

    const firstResponse = await page.request.get(`/api/admin/clients/${patient.id}/consultation`);
    const firstSession = (await firstResponse.json()).session;

    // Sai e tenta iniciar de novo — nunca cria uma segunda sessão in_progress.
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("button", { name: /iniciar consulta/i }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${patient.id}/consulta$`));

    const secondResponse = await page.request.get(`/api/admin/clients/${patient.id}/consultation`);
    const secondSession = (await secondResponse.json()).session;
    expect(secondSession.id).toBe(firstSession.id);
  });
});
