import { test, expect } from "./fixtures";
import { adminFixtures } from "./helpers/auth";
import { createTestAppointment, createTestPatient, createTestTask, enablePortalAccess, seedAiProposal } from "./helpers/test-data";

/**
 * Portal do paciente (secao "Portal" do pedido FASE 1): autenticacao,
 * visualizacao do proprio plano/consultas/tarefas, envio de solicitacao de
 * revisao (confirmada pelo proprio canal do portal), e o teste mandatorio
 * de isolamento entre pacientes.
 *
 * Nao usa test.use({storageState: ADMIN_STORAGE_STATE}) neste arquivo — a
 * maioria dos testes autentica como PACIENTE pelo formulario real do
 * portal. Quando um teste precisa também de uma acao administrativa (criar
 * paciente, semear uma proposta), loga o `request` fixture como admin
 * diretamente via POST /api/auth/login (mesmo mecanismo do global-setup),
 * mantendo os dois papeis (admin no `request`, paciente no `page`)
 * claramente separados dentro do mesmo teste.
 */
async function loginRequestAsAdmin(request: import("@playwright/test").APIRequestContext) {
  const { admin } = adminFixtures();
  const response = await request.post("/api/auth/login", { data: { email: admin.email, password: admin.password } });
  if (!response.ok()) throw new Error(`login admin falhou (${response.status()}): ${await response.text()}`);
}

async function activateMealPlan(request: import("@playwright/test").APIRequestContext, clientId: string) {
  const plan = await (await request.post(`/api/admin/clients/${clientId}/meal-plans`, { data: { targetGroup: "ADULTO_SAUDAVEL" } })).json();
  const meals = plan.meals.map((meal: { name: string; suggested_time?: string | null; notes?: string | null; items?: Array<{ food: string; quantity?: string | null; unit?: string | null; notes?: string | null; food_source?: string | null; food_ref_id?: string | null; household_measure_id?: string | null; canonical_food_id?: string | null; quantity_locked?: boolean | null; substitutions_locked?: boolean | null; template_slot_id?: string | null; slot_food_group?: string | null; slot_food_subgroup?: string | null; slot_nutritional_role?: string | null; slot_exchange_eligible?: boolean | null }> }) => ({
    name: meal.name,
    suggested_time: meal.suggested_time ?? "",
    notes: meal.notes ?? "",
    items: (meal.items ?? []).map((item) => ({
      food: item.food,
      quantity: item.quantity ?? "",
      unit: item.unit ?? "g",
      notes: item.notes ?? "",
      food_source: item.food_source ?? null,
      food_ref_id: item.food_ref_id ?? null,
      household_measure_id: item.household_measure_id ?? null,
      canonical_food_id: item.canonical_food_id ?? null,
      quantity_locked: item.quantity_locked ?? false,
      substitutions_locked: item.substitutions_locked ?? false,
      template_slot_id: item.template_slot_id ?? null,
      slot_food_group: item.slot_food_group ?? null,
      slot_food_subgroup: item.slot_food_subgroup ?? null,
      slot_nutritional_role: item.slot_nutritional_role ?? null,
      slot_exchange_eligible: item.slot_exchange_eligible ?? null,
    })),
  }));
  const activateResponse = await request.put(`/api/admin/clients/${clientId}/meal-plans/${plan.id}`, {
    data: {
      title: plan.title,
      status: "active",
      notes: plan.notes,
      meals,
      weekly_slots: [],
      substitutions: [],
      supplements: [],
    },
  });
  if (!activateResponse.ok()) throw new Error(`ativar plano falhou (${activateResponse.status()}): ${await activateResponse.text()}`);
  return plan;
}

test.describe("portal do paciente", () => {
  test("autentica pelo formulário real do portal, vê o próprio plano ativo, a próxima consulta e as tarefas, e conclui uma tarefa", async ({ page, request }) => {
    await loginRequestAsAdmin(request);
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);
    const plan = await activateMealPlan(request, patient.id);
    await createTestAppointment(request, patient.id, { title: "Retorno nutricional E2E" });
    const task = await createTestTask(request, patient.id, { title: "Beber 2L de água por dia" });

    await page.goto("/portal");
    await page.getByPlaceholder("seunome@email.com").fill(patient.email);
    await page.getByPlaceholder("BF-0000-0000").fill(code);
    await page.getByRole("button", { name: /acessar meu portal/i }).click();

    await expect(page.getByText(new RegExp(`ola, ${patient.name.split(" ")[0]}`, "i"))).toBeVisible();

    // Plano alimentar ativo.
    await expect(page.getByRole("heading", { name: plan.title })).toBeVisible();

    // Proxima consulta.
    await expect(page.getByText("Retorno nutricional E2E")).toBeVisible();

    // Tarefas.
    await expect(page.getByText("Beber 2L de água por dia")).toBeVisible();
    await expect(page.getByText("1 pendente(s)")).toBeVisible();

    await page.getByRole("button", { name: /^concluir$/i }).click();
    await expect(page.getByRole("button", { name: /^reabrir$/i })).toBeVisible();
    await expect(page.getByText("0 pendente(s)")).toBeVisible();

    // Persistencia real: recarregar a pagina confirma que a conclusao foi gravada, nao so o estado local do React.
    await page.reload();
    await expect(page.getByRole("button", { name: /^reabrir$/i })).toBeVisible();
  });

  test("solicitação de revisão: paciente confirma a própria proposta pelo canal do portal, e a nutricionista vê a solicitação pendente de revisão", async ({ page, request }) => {
    await loginRequestAsAdmin(request);
    const patient = await createTestPatient(request);
    const { code } = await enablePortalAccess(request, patient.id);

    const proposal = await seedAiProposal(request, {
      toolName: "requestProfessionalReview",
      clientId: patient.id,
      asPatient: true,
      action: {
        kind: "patient_change_request",
        clientId: patient.id,
        requestType: "meal_plan_difficulty",
        patientText: "Não estou conseguindo seguir o cardápio do almoço, fica muito difícil na correria do trabalho.",
        preview: { title: "Dificuldade com o plano alimentar", details: null },
      },
    });
    expect(proposal.risk).toBe("sensitive");
    expect(proposal.requiresConfirmation).toBe(true);

    await page.goto("/portal");
    await page.getByPlaceholder("seunome@email.com").fill(patient.email);
    await page.getByPlaceholder("BF-0000-0000").fill(code);
    await page.getByRole("button", { name: /acessar meu portal/i }).click();
    await expect(page.getByText(/ola,/i)).toBeVisible();

    // Confirmacao explicita pelo canal do proprio paciente — antes disso nao existe nenhuma linha em patient_requests.
    const beforeConfirm = await (await request.get(`/api/admin/patient-requests?clientId=${patient.id}`)).json();
    expect(beforeConfirm.items).toHaveLength(0);

    const confirmResponse = await page.request.post(`/api/portal/ai/proposals/${proposal.proposalId}/confirm`);
    expect(confirmResponse.ok()).toBe(true);
    expect((await confirmResponse.json()).status).toBe("completed");

    const afterConfirm = await (await request.get(`/api/admin/patient-requests?clientId=${patient.id}`)).json();
    expect(afterConfirm.items).toHaveLength(1);
    expect(afterConfirm.items[0].status).toBe("pending_review");
    expect(afterConfirm.items[0].patientText).toContain("cardápio do almoço");
  });

  test("isolamento obrigatório: a paciente A nunca vê dados da paciente B, nem consegue alterar uma tarefa da paciente B via manipulação de id", async ({ browser, request }) => {
    await loginRequestAsAdmin(request);
    const patientA = await createTestPatient(request);
    const patientB = await createTestPatient(request);
    const [accessA, accessB] = await Promise.all([enablePortalAccess(request, patientA.id), enablePortalAccess(request, patientB.id)]);
    const [planA, planB] = await Promise.all([activateMealPlan(request, patientA.id), activateMealPlan(request, patientB.id)]);
    const taskB = await createTestTask(request, patientB.id, { title: "Tarefa exclusiva da paciente B" });

    const contextA = await browser.newContext({ storageState: undefined });
    const loginA = await contextA.request.post("/api/portal/login", { data: { email: patientA.email, code: accessA.code } });
    expect(loginA.ok()).toBe(true);

    const meA = await (await contextA.request.get("/api/portal/me")).json();
    expect(meA.client.id).toBe(patientA.id);
    expect(meA.client.id).not.toBe(patientB.id);
    expect(meA.mealPlan.id).toBe(planA.id);
    expect(meA.mealPlan.id).not.toBe(planB.id);
    expect(meA.tasks.some((task: { title: string }) => task.title === "Tarefa exclusiva da paciente B")).toBe(false);

    // IDOR: paciente A tenta concluir uma tarefa que pertence a paciente B manipulando o id na URL.
    const idorResponse = await contextA.request.patch(`/api/portal/tasks/${taskB.id}`, { data: { status: "concluida" } });
    expect(idorResponse.status()).toBe(404);

    // A tarefa da paciente B continua intacta (pendente) — confirmado pela propria sessao dela.
    const contextB = await browser.newContext({ storageState: undefined });
    const loginB = await contextB.request.post("/api/portal/login", { data: { email: patientB.email, code: accessB.code } });
    expect(loginB.ok()).toBe(true);
    const meB = await (await contextB.request.get("/api/portal/me")).json();
    const taskBAfter = meB.tasks.find((task: { id: string }) => task.id === taskB.id);
    expect(taskBAfter?.status).toBe("pendente");

    await contextA.close();
    await contextB.close();
  });
});
