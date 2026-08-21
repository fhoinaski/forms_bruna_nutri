import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

/**
 * "Sugerir com IA" no painel de substituições (V3 do fechamento de gaps,
 * FASE 13) — usa o provider determinístico de E2E
 * (lib/ai/gateway/e2e-fixtures.ts, ligado na fronteira do AI gateway) pra
 * controlar SÓ os nomes que a IA "responde". Tudo depois disso
 * (resolveFoodCandidates, substitution engine, cálculo de quantidade,
 * qualidade de equivalência) é o código real de produção — nada mockado.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("sugestão de substituição via IA (provider determinístico)", () => {
  test("nomes da fixture são resolvidos contra o catálogo real e calculados pela engine real — nada persistido ainda", async ({ request }) => {
    const patient = await createTestPatient(request);

    const createRes = await request.post(`/api/admin/clients/${patient.id}/meal-plans`, {
      data: { targetGroup: "ADULTO_SAUDAVEL", title: "Plano sugestão IA" },
    });
    expect(createRes.ok()).toBeTruthy();
    const planId = (await createRes.json()).id as string;

    const putRes = await request.put(`/api/admin/clients/${patient.id}/meal-plans/${planId}`, {
      data: {
        title: "Plano sugestão IA",
        status: "draft",
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
    const beforeSuggest = await putRes.json();

    // Registra a fixture — a PRÓXIMA chamada de suggestSubstitutionCandidates
    // pra este clientId recebe estes nomes, sem chamar nenhum provider real.
    // Um nome exatamente no formato do catálogo ("Alimento, atributo,
    // atributo") resolve com confiança total; o outro, em linguagem natural
    // sem as vírgulas do catálogo (como um modelo real tende a responder —
    // confirmado ao vivo na V3 do fechamento de gaps), fica de baixa
    // confiança por design do resolver (lib/nutrition/food-resolver.ts:
     // "rank 3+ nunca aceita sozinho") — os dois caminhos reais são cobertos.
    const fixtureRes = await request.post("/api/admin/e2e/set-substitution-suggestion-fixture", {
      data: { clientId: patient.id, candidates: ["Batata, inglesa, cozida", "mandioca cozida"] },
    });
    expect(fixtureRes.ok(), await fixtureRes.text()).toBeTruthy();

    const suggestAiRes = await request.post(`/api/admin/clients/${patient.id}/meal-plans/substitutions/suggest-ai`, {
      data: { baseFoodName: "Arroz, tipo 1, cozido" },
    });
    expect(suggestAiRes.ok(), await suggestAiRes.text()).toBeTruthy();
    const suggestAiBody = await suggestAiRes.json();
    expect(suggestAiBody.candidates).toEqual(["Batata, inglesa, cozida", "mandioca cozida"]);

    // Passo 2: os NOMES (nunca números) vão pro motor determinístico real —
    // exatamente o que o painel de substituições faz depois de "Sugerir com IA".
    const suggestRes = await request.post(`/api/admin/clients/${patient.id}/meal-plans/substitutions/suggest`, {
      data: {
        baseFoodSource: "TACO",
        baseFoodRefId: "3",
        baseQuantity: 100,
        mode: "energy",
        candidateQueries: suggestAiBody.candidates,
      },
    });
    expect(suggestRes.ok(), await suggestRes.text()).toBeTruthy();
    const suggestBody = await suggestRes.json();

    // "Batata, inglesa, cozida" (formato exato do catálogo) resolve com
    // confiança total e vira um resultado calculado pela engine real.
    expect(suggestBody.results.length).toBeGreaterThan(0);
    for (const result of suggestBody.results) {
      expect(["TACO", "CUSTOM", "MANUFACTURER"]).toContain(result.foodSource);
      expect(result.foodRefId).toBeTruthy();
      expect(result.quantityGrams).toBeGreaterThan(0);
      expect(["EXCELLENT", "GOOD", "REVIEW", "UNSUITABLE"]).toContain(result.quality);
    }
    const names = suggestBody.results.map((r: { displayName: string }) => r.displayName.toLowerCase());
    expect(names.some((n: string) => n.includes("batata"))).toBe(true);

    // "mandioca cozida" (linguagem natural, sem as vírgulas do catálogo)
    // fica de baixa confiança por design — nunca escolhida sozinha, nunca
    // vira um resultado calculado sem revisão humana.
    expect(suggestBody.needsReview.length).toBeGreaterThan(0);
    expect(suggestBody.needsReview.some((r: { query: string }) => r.query === "mandioca cozida")).toBe(true);

    // Nada foi persistido — as duas rotas de sugestão nunca gravam no plano.
    const afterRes = await request.get(`/api/admin/clients/${patient.id}/meal-plans`);
    const afterPlan = (await afterRes.json()).find((p: { id: string }) => p.id === planId);
    expect(afterPlan.version).toBe(beforeSuggest.version);
    expect(afterPlan.substitutions).toEqual([]);
  });

  test("fixture nunca é reaproveitada entre chamadas (one-shot) — segunda chamada sem fixture cai no comportamento real (sem provider, 409)", async ({ request }) => {
    const patient = await createTestPatient(request);

    const fixtureRes = await request.post("/api/admin/e2e/set-substitution-suggestion-fixture", {
      data: { clientId: patient.id, candidates: ["batata inglesa cozida"] },
    });
    expect(fixtureRes.ok()).toBeTruthy();

    const first = await request.post(`/api/admin/clients/${patient.id}/meal-plans/substitutions/suggest-ai`, {
      data: { baseFoodName: "Arroz, tipo 1, cozido" },
    });
    expect(first.ok()).toBeTruthy();

    const second = await request.post(`/api/admin/clients/${patient.id}/meal-plans/substitutions/suggest-ai`, {
      data: { baseFoodName: "Arroz, tipo 1, cozido" },
    });
    // Sem fixture (consumida) e sem provider configurado nesta suite → 409, nunca um resultado fantasma.
    expect(second.status()).toBe(409);
  });
});
