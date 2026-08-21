import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

/**
 * Assistente real + command router determinístico (V3 do fechamento de
 * gaps, FASE 20) — cobre write/read/stale via API, sem depender de nenhum
 * provider de IA: lib/ai/nutrition/substitution-command-router.ts classifica
 * add/remove/approve_substitution de forma 100% determinística e NUNCA chama
 * o LLM para esses casos (só READ/consulta ainda usa o modelo, que nesta
 * suite não tem provider configurado — comportamento de fallback já coberto
 * por e2e/meal-plan-ai-wizard.spec.ts, não repetido aqui).
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

async function createActivePlanWithRice(request: import("@playwright/test").APIRequestContext, clientId: string) {
  const createRes = await request.post(`/api/admin/clients/${clientId}/meal-plans`, {
    data: { targetGroup: "ADULTO_SAUDAVEL", title: "Plano assistente" },
  });
  expect(createRes.ok(), await createRes.text()).toBeTruthy();
  const planId = (await createRes.json()).id as string;

  const putRes = await request.put(`/api/admin/clients/${clientId}/meal-plans/${planId}`, {
    data: {
      title: "Plano assistente",
      status: "active",
      notes: null,
      meals: [
        {
          name: "Almoço",
          suggested_time: null,
          notes: null,
          source_recipe_id: null,
          items: [{ food: "Arroz, tipo 1, cozido", quantity: "100", unit: "g", food_source: "TACO", food_ref_id: "3" }],
        },
      ],
      substitutions: [],
      supplements: [],
    },
  });
  expect(putRes.ok(), await putRes.text()).toBeTruthy();
  return planId;
}

async function getPlan(request: import("@playwright/test").APIRequestContext, clientId: string, planId: string) {
  const res = await request.get(`/api/admin/clients/${clientId}/meal-plans`);
  const plans = await res.json();
  return plans.find((p: { id: string }) => p.id === planId);
}

test.describe("command router de substituições — Assistente (determinístico, sem depender de IA)", () => {
  test("READ nunca cria proposta nem altera o plano", async ({ request }) => {
    const patient = await createTestPatient(request);
    const planId = await createActivePlanWithRice(request, patient.id);
    const before = await getPlan(request, patient.id, planId);

    const chatRes = await request.post("/api/admin/ai/chat", {
      data: {
        messages: [{ role: "user", content: "Quais alternativas tenho para o arroz?" }],
        context: { clientId: patient.id, currentPage: `/dashboard/clients/${patient.id}` },
      },
    });
    expect(chatRes.status()).toBeLessThan(500);
    const body = await chatRes.json();
    expect(body.proposedUpdate).toBeFalsy();

    const after = await getPlan(request, patient.id, planId);
    expect(after.version).toBe(before.version);
    expect(after.substitutions).toEqual(before.substitutions);
  });

  test("WRITE inequívoco cria proposal, nada muda antes do confirm, persiste depois — quantidade vem da engine, nunca do texto", async ({ request }) => {
    const patient = await createTestPatient(request);
    const planId = await createActivePlanWithRice(request, patient.id);
    const before = await getPlan(request, patient.id, planId);

    const chatRes = await request.post("/api/admin/ai/chat", {
      data: {
        messages: [{ role: "user", content: "Troque por 500 g de batata inglesa cozida como substituição do arroz." }],
        context: { clientId: patient.id, currentPage: `/dashboard/clients/${patient.id}` },
      },
    });
    expect(chatRes.status()).toBe(200);
    const body = await chatRes.json();

    // "Troque" não bate no verbo reconhecido pelo router — vira esclarecimento
    // (nunca aceita a gramatura ditada, nunca finge que vai executar).
    // Reenvia com a frase reconhecida pelo router pra seguir o teste.
    let proposalId = body.proposedUpdate?.proposalId;
    if (!proposalId) {
      const retryRes = await request.post("/api/admin/ai/chat", {
        data: {
          messages: [{ role: "user", content: "Adicione batata inglesa cozida como substituição do arroz." }],
          context: { clientId: patient.id, currentPage: `/dashboard/clients/${patient.id}` },
        },
      });
      expect(retryRes.status()).toBe(200);
      const retryBody = await retryRes.json();
      proposalId = retryBody.proposedUpdate?.proposalId;
      expect(proposalId, `esperava proposta; reply foi: ${retryBody.reply}`).toBeTruthy();

      const change = retryBody.proposedUpdate.changes[0];
      expect(change.operation).toBe("add_substitution");
      // A quantidade NUNCA aparece no operation — só é calculada depois,
      // server-side, pela substitution engine (nunca aceita do usuário/LLM).
      expect(change).not.toHaveProperty("quantity");
      expect(change.optionFood.source).toBe("TACO");
      expect(change.optionFood.refId).toBeTruthy();
    }

    // Nada mudou entre a proposta e o confirm.
    const mid = await getPlan(request, patient.id, planId);
    expect(mid.version).toBe(before.version);
    expect(mid.substitutions).toEqual(before.substitutions);

    const confirmRes = await request.post(`/api/admin/ai/proposals/${proposalId}/confirm`);
    expect(confirmRes.ok(), await confirmRes.text()).toBeTruthy();

    const after = await getPlan(request, patient.id, planId);
    expect(after.version).toBe(before.version + 1);
    expect(after.substitutions).toHaveLength(1);
    const sub = after.substitutions[0];
    expect(sub.option_food_source).toBe("TACO");
    expect(sub.option_food_ref_id).toBe("91");
    expect(Number(sub.quantity)).not.toBe(500); // nunca o número que o texto sugeriu
    expect(Number(sub.quantity)).toBeGreaterThan(0);
    expect(sub.approved_by_professional).toBe(false); // pendente até aprovação explícita
  });

  test("stale proposal (plano mudou depois da proposta) → 409, nenhuma substituição aplicada", async ({ request }) => {
    const patient = await createTestPatient(request);
    const planId = await createActivePlanWithRice(request, patient.id);

    const chatRes = await request.post("/api/admin/ai/chat", {
      data: {
        messages: [{ role: "user", content: "Adicione batata inglesa cozida como substituição do arroz." }],
        context: { clientId: patient.id, currentPage: `/dashboard/clients/${patient.id}` },
      },
    });
    const body = await chatRes.json();
    const proposalId = body.proposedUpdate?.proposalId;
    expect(proposalId, `esperava proposta; reply foi: ${body.reply}`).toBeTruthy();

    // Altera o plano manualmente (fora da proposta) — a baseVersion capturada na proposta fica desatualizada.
    const plan = await getPlan(request, patient.id, planId);
    const staleRes = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${planId}`, {
      data: {
        title: "Plano assistente (editado manualmente)",
        status: "active",
        notes: null,
        meals: [
          {
            name: "Almoço",
            suggested_time: null,
            notes: null,
            source_recipe_id: null,
            items: [{ food: "Arroz, tipo 1, cozido", quantity: "150", unit: "g", food_source: "TACO", food_ref_id: "3" }],
          },
        ],
        substitutions: [],
        supplements: [],
        expectedVersion: plan.version,
      },
    });
    expect(staleRes.ok(), await staleRes.text()).toBeTruthy();

    const confirmRes = await request.post(`/api/admin/ai/proposals/${proposalId}/confirm`);
    expect(confirmRes.status()).toBe(409);

    const after = await getPlan(request, patient.id, planId);
    expect(after.substitutions).toEqual([]);
  });
});
