import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient, enablePortalAccess, seedAiProposal } from "./helpers/test-data";

/**
 * Guardrails de IA (secao "IA — Guardrails" do pedido FASE 1): testa o
 * ENFORCEMENT em nivel de codigo — nao a qualidade do texto do modelo.
 *
 * O ambiente de E2E nunca tem um provedor de IA real configurado (mesma
 * convencao ja usada no resto da suite: nao depender de uma chamada
 * paga/nao deterministica a um LLM). Por isso este arquivo prova o gate
 * proposta -> confirmacao -> execucao pelas ROTAS HTTP REAIS de confirm/
 * cancel, semeando a proposta via app/api/admin/ai/proposals/test-seed
 * (mesma persistProposedAction que o orquestrador real usa depois de uma
 * tool call — so troca a origem da tool call, nunca a persistencia nem a
 * classificacao de risco). O caminho "texto do usuario -> LLM decide chamar
 * uma tool -> proposedAction so nasce de um evento de tool-call real" ja
 * tem cobertura dedicada em tests/ai-proposal-*.test.ts e
 * tests/ai-prompt-injection.test.ts (nivel unitario, com o provider
 * mockado) — nao duplicado aqui.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("guardrails de IA", () => {
  test("chat do admin e do portal nunca respondem sem um provedor de IA configurado", async ({ request }) => {
    const adminChat = await request.post("/api/admin/ai/chat", { data: { messages: [{ role: "user", content: "oi" }] } });
    expect(adminChat.status()).toBe(409);

    const portalChat = await request.post("/api/portal/ai/chat", { data: { messages: [{ role: "user", content: "oi" }] } });
    // Sem sessao de portal no contexto admin -> 401 antes mesmo do gate de IA (ordem de checagem correta).
    expect(portalChat.status()).toBe(401);
  });

  test("risco e exigencia de confirmacao sao sempre calculados pelo servidor a partir do nome real da tool — nunca aceitos do chamador", async ({ request }) => {
    const patient = await createTestPatient(request);

    const readTool = await seedAiProposal(request, { toolName: "findClient", action: { kind: "read_probe" }, clientId: patient.id });
    expect(readTool.risk).toBe("read");
    expect(readTool.requiresConfirmation).toBe(false);

    const lowTool = await seedAiProposal(request, { toolName: "navigate", action: { kind: "low_probe" }, clientId: patient.id });
    expect(lowTool.risk).toBe("low");
    expect(lowTool.requiresConfirmation).toBe(false);

    // Simula uma tentativa de injecao: o payload "finge" ser de baixo risco
    // mesmo a tool sendo clinica — o servidor ignora esses campos e usa
    // getToolRisk(toolName)/requiresConfirmation() como unica fonte de verdade.
    const spoofed = await seedAiProposal(request, {
      toolName: "proposeMealPlanChange",
      clientId: patient.id,
      action: { kind: "meal_plan_change", risk: "read", requiresConfirmation: false },
    });
    expect(spoofed.risk).toBe("clinical");
    expect(spoofed.requiresConfirmation).toBe(true);
  });

  test("tool sensitive (agendamento): proposta pendente nao cria nada; so a confirmacao explicita grava, e confirmar duas vezes nao duplica", async ({ request }) => {
    const patient = await createTestPatient(request);
    const startsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const proposal = await seedAiProposal(request, {
      toolName: "proposeNewAppointment",
      clientId: patient.id,
      action: {
        kind: "new_appointment",
        clientId: patient.id,
        fields: { title: "Consulta sugerida pela IA (E2E)", appointment_type: "consulta", starts_at_display: startsAt },
      },
    });
    expect(proposal.risk).toBe("sensitive");
    expect(proposal.requiresConfirmation).toBe(true);

    const before = await (await request.get(`/api/admin/appointments?clientId=${patient.id}`)).json();
    expect(before.items).toHaveLength(0);

    const confirmResponse = await request.post(`/api/admin/ai/proposals/${proposal.proposalId}/confirm`);
    expect(confirmResponse.ok()).toBe(true);
    const confirmBody = await confirmResponse.json();
    expect(confirmBody.status).toBe("completed");
    expect(confirmBody.appointmentId).toBeTruthy();

    const after = await (await request.get(`/api/admin/appointments?clientId=${patient.id}`)).json();
    expect(after.items).toHaveLength(1);
    expect(after.items[0].title).toBe("Consulta sugerida pela IA (E2E)");

    const secondConfirm = await request.post(`/api/admin/ai/proposals/${proposal.proposalId}/confirm`);
    expect(secondConfirm.status()).toBe(409);
    const afterSecond = await (await request.get(`/api/admin/appointments?clientId=${patient.id}`)).json();
    expect(afterSecond.items).toHaveLength(1);
  });

  test("tool clinical (alteração do plano alimentar): proposta pendente não altera o plano; confirmação revalida a versão e só então grava", async ({ request }) => {
    const patient = await createTestPatient(request);
    const plan = await (await request.post(`/api/admin/clients/${patient.id}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL" } })).json();

    const proposal = await seedAiProposal(request, {
      toolName: "proposeMealPlanChange",
      clientId: patient.id,
      action: {
        kind: "meal_plan_change",
        clientId: patient.id,
        mealPlanId: plan.id,
        baseVersion: plan.version,
        changes: [{ operation: "add_meal", name: "Refeição sugerida pela IA (E2E)" }],
        preview: {
          mealPlanTitle: plan.title,
          changeSummaries: [{ operation: "add_meal", mealName: "Refeição sugerida pela IA (E2E)", before: null, after: "Refeição sugerida pela IA (E2E)" }],
          totalImpact: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
        },
      },
    });
    expect(proposal.risk).toBe("clinical");
    expect(proposal.requiresConfirmation).toBe(true);

    type PlanSummary = { id: string; version: number; meals: { name: string }[] };
    const beforePlans = (await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json()) as PlanSummary[];
    const beforePlan = beforePlans.find((item) => item.id === plan.id)!;
    expect(beforePlan.version).toBe(plan.version);
    expect(beforePlan.meals.some((meal) => meal.name === "Refeição sugerida pela IA (E2E)")).toBe(false);

    const confirmResponse = await request.post(`/api/admin/ai/proposals/${proposal.proposalId}/confirm`);
    expect(confirmResponse.ok()).toBe(true);

    const afterPlans = (await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json()) as PlanSummary[];
    const afterPlan = afterPlans.find((item) => item.id === plan.id)!;
    expect(afterPlan.version).toBe(plan.version + 1);
    expect(afterPlan.meals.some((meal) => meal.name === "Refeição sugerida pela IA (E2E)")).toBe(true);
  });

  test("cancelar uma proposta pendente impede a confirmação depois e não deixa nenhum rastro no banco", async ({ request }) => {
    const patient = await createTestPatient(request);
    const startsAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();

    const proposal = await seedAiProposal(request, {
      toolName: "proposeNewAppointment",
      clientId: patient.id,
      action: { kind: "new_appointment", clientId: patient.id, fields: { title: "Nunca deve ser criada", starts_at_display: startsAt } },
    });

    const cancelResponse = await request.post(`/api/admin/ai/proposals/${proposal.proposalId}/cancel`);
    expect(cancelResponse.ok()).toBe(true);
    expect((await cancelResponse.json()).status).toBe("cancelled");

    const confirmResponse = await request.post(`/api/admin/ai/proposals/${proposal.proposalId}/confirm`);
    expect(confirmResponse.status()).toBe(409);

    const items = (await (await request.get(`/api/admin/appointments?clientId=${patient.id}`)).json()).items;
    expect(items).toHaveLength(0);
  });

  test("confirmar/cancelar exige sessão admin válida e um id de proposta que exista", async ({ request, browser }) => {
    const patient = await createTestPatient(request);
    const proposal = await seedAiProposal(request, {
      toolName: "proposeNewAppointment",
      clientId: patient.id,
      action: { kind: "new_appointment", clientId: patient.id, fields: { title: "Auth check", starts_at_display: new Date(Date.now() + 86_400_000).toISOString() } },
    });

    // storageState:undefined e necessario mesmo aqui — o test runner aplica o
    // test.use({storageState: ADMIN_STORAGE_STATE}) do arquivo como default
    // tambem para browser.newContext() manual, nao so para os fixtures
    // page/context/request.
    const anonymousContext = await browser.newContext({ storageState: undefined });
    const anonymousResponse = await anonymousContext.request.post(`/api/admin/ai/proposals/${proposal.proposalId}/confirm`);
    expect(anonymousResponse.status()).toBe(401);
    await anonymousContext.close();

    const notFoundResponse = await request.post("/api/admin/ai/proposals/does-not-exist/confirm");
    expect(notFoundResponse.status()).toBe(404);
  });

  test("uma proposta gerada pelo admin nunca pode ser confirmada pelo canal do portal do paciente, mesmo pertencendo ao mesmo paciente (isolamento entre canais)", async ({ request, browser }) => {
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);

    const proposal = await seedAiProposal(request, {
      toolName: "proposeMealPlanChange",
      clientId: patient.id,
      action: {
        kind: "meal_plan_change",
        clientId: patient.id,
        mealPlanId: "irrelevante-para-este-teste",
        baseVersion: 1,
        changes: [{ operation: "add_meal", name: "x" }],
        preview: { mealPlanTitle: "x", changeSummaries: [], totalImpact: { kcal: 0, protein: 0, carbs: 0, fat: 0 } },
      },
    });

    const portalContext = await browser.newContext();
    const loginResponse = await portalContext.request.post("/api/portal/login", { data: { email: patient.email, code } });
    expect(loginResponse.ok()).toBe(true);

    const portalConfirm = await portalContext.request.post(`/api/portal/ai/proposals/${proposal.proposalId}/confirm`);
    expect(portalConfirm.status()).toBe(404);
    await portalContext.close();

    // A proposta administrativa continua pendente e confirmavel normalmente pelo canal certo.
    const adminConfirm = await request.post(`/api/admin/ai/proposals/${proposal.proposalId}/confirm`);
    expect(adminConfirm.ok()).toBe(true);
  });
});
