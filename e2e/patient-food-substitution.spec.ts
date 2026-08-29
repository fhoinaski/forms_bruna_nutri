import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient, enablePortalAccess, seedAiProposal } from "./helpers/test-data";

/**
 * Killer Feature 4 — substituicao alimentar segura no portal (PASSO 8 do
 * pedido, E2E). O ambiente de E2E nunca tem provedor de IA configurado
 * (mesma razao documentada em ai-guardrails.spec.ts), entao a mensagem em
 * texto livre -> tool call real via /api/portal/ai/chat nao e alcancavel
 * aqui. Testamos a fronteira real e determinística: a proposta chega
 * estruturada (como o orquestrador real produziria a partir de uma tool
 * call) e o fluxo de CONFIRMACAO — onde o recalculo determinístico e o
 * guardrail de "nunca aplica automaticamente" realmente acontecem — roda
 * contra a aplicacao real, ponta a ponta.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

async function createPlanWithRice(request: import("@playwright/test").APIRequestContext, clientId: string) {
  const created = await (await request.post(`/api/admin/clients/${clientId}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL" } })).json();
  const updated = await (
    await request.put(`/api/admin/clients/${clientId}/meal-plans/${created.id}`, {
      data: {
        title: "Plano E2E substituição",
        status: "active",
        meals: [{ name: "Almoço", items: [{ food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "3" }] }],
        substitutions: [],
        supplements: [],
        expectedVersion: created.version,
      },
    })
  ).json();
  return updated as { id: string; version: number; meals: { id: string; name: string; items: { id: string; food: string }[] }[] };
}

test.describe("substituição alimentar segura no portal", () => {
  test("paciente pede troca, engine calcula a quantidade, nada no plano muda automaticamente", async ({ request, browser }) => {
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);
    const plan = await createPlanWithRice(request, patient.id);
    const meal = plan.meals[0];
    const item = meal.items[0];

    const proposal = await seedAiProposal(request, {
      toolName: "requestProfessionalReview",
      clientId: patient.id,
      asPatient: true,
      action: {
        kind: "patient_change_request",
        clientId: patient.id,
        requestType: "food_substitution",
        patientText: "Posso trocar o arroz por batata?",
        mealPlanId: plan.id,
        mealId: meal.id,
        itemId: item.id,
        desiredFood: "batata, inglesa, cozida",
        preview: { title: "Substituição alimentar", details: `${meal.name}: ${item.food} → batata` },
      },
    });

    // 1-3. Paciente autentica e confirma a proposta pelo canal do portal.
    const portalContext = await browser.newContext({ storageState: undefined });
    const loginResponse = await portalContext.request.post("/api/portal/login", { data: { email: patient.email, password: code } });
    expect(loginResponse.ok()).toBe(true);

    const confirmResponse = await portalContext.request.post(`/api/portal/ai/proposals/${proposal.proposalId}/confirm`);
    expect(confirmResponse.ok()).toBe(true);
    await portalContext.close();

    // 4-6. A quantidade calculada aparece no resumo visível à nutricionista, vinda da engine — nunca do texto do paciente.
    const requestsResponse = await request.get(`/api/admin/patient-requests?clientId=${patient.id}`);
    const { items } = await requestsResponse.json();
    const created = items.find((row: { requestType: string }) => row.requestType === "food_substitution");
    expect(created).toBeTruthy();
    expect(created.status).toBe("pending_review");
    expect(created.aiSummary).toMatch(/g de Arroz.*g de Batata/i);
    expect(created.aiSummary).toContain(`versão ${plan.version} do plano`);

    // 7. Nenhuma alteração automática no plano — mesma versão de antes.
    const planAfter = await (await request.get(`/api/admin/clients/${patient.id}/meal-plans`)).json();
    const currentPlan = planAfter.find((candidate: { id: string }) => candidate.id === plan.id);
    expect(currentPlan.version).toBe(plan.version);
    expect(currentPlan.meals[0].items[0].food).toBe("Arroz, tipo 1, cozido");
  });

  test("pedido com sinal clínico não é resolvido automaticamente — vira solicitação para a nutricionista analisar", async ({ request, browser }) => {
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);

    const proposal = await seedAiProposal(request, {
      toolName: "requestProfessionalReview",
      clientId: patient.id,
      asPatient: true,
      action: {
        kind: "patient_change_request",
        clientId: patient.id,
        requestType: "symptom_or_complaint",
        patientText: "Estou passando muito mal depois do almoço, tive uma reação estranha.",
        preview: { title: "Relato de sintoma ou queixa", details: null },
      },
    });

    const portalContext = await browser.newContext({ storageState: undefined });
    const loginResponse = await portalContext.request.post("/api/portal/login", { data: { email: patient.email, password: code } });
    expect(loginResponse.ok()).toBe(true);

    const confirmResponse = await portalContext.request.post(`/api/portal/ai/proposals/${proposal.proposalId}/confirm`);
    expect(confirmResponse.ok()).toBe(true);
    await portalContext.close();

    // A nutricionista consegue ver a solicitação pendente pelo fluxo já existente — nenhum sistema paralelo.
    const requestsResponse = await request.get(`/api/admin/patient-requests?clientId=${patient.id}&status=pending_review`);
    const { items } = await requestsResponse.json();
    const created = items.find((row: { requestType: string }) => row.requestType === "symptom_or_complaint");
    expect(created).toBeTruthy();
    expect(created.patientText).toContain("passando muito mal");
  });
});
