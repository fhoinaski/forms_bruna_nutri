import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestPatient, seedAiProposal } from "./helpers/test-data";

/**
 * E2E do versionamento imutável do prontuário (P0). Usa a sessão admin pronta
 * (storageState); a edição vai pela API (determinística) e a UI do histórico
 * (a funcionalidade nova) é validada no navegador.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("versionamento do prontuário", () => {
  test("CENÁRIO A: editar cria novas versões e a versão anterior é read-only no histórico", async ({ page, request }) => {
    const patient = await createTestPatient(request);

    // v1 (criação lazy ao ler pela primeira vez)
    const rec = await request.get(`/api/admin/clients/${patient.id}/nutrition-record`);
    expect(rec.ok()).toBe(true);
    expect((await rec.json()).version).toBe(1);

    // edição 1 → v2
    const p1 = await request.patch(`/api/admin/clients/${patient.id}/nutrition-record`, {
      data: { chief_complaint: "Queixa inicial E2E", expectedVersion: 1 },
    });
    expect(p1.ok()).toBe(true);
    expect((await p1.json()).version).toBe(2);

    // edição 2 → v3
    const p2 = await request.patch(`/api/admin/clients/${patient.id}/nutrition-record`, {
      data: { chief_complaint: "Queixa nova E2E", expectedVersion: 2 },
    });
    expect(p2.ok()).toBe(true);
    expect((await p2.json()).version).toBe(3);

    // UI: abre a ficha, aba Anamnese, vê o histórico.
    await suppressDailyBriefingPopup(page);
    await page.goto(`/dashboard/clients/${patient.id}`);
    await page.getByRole("tab", { name: "Anamnese" }).click();
    await expect(page.getByText("Histórico de alterações")).toBeVisible();
    await expect(page.getByText("Versão 3")).toBeVisible();
    await expect(page.getByText("Versão 2")).toBeVisible();
    await expect(page.getByText("Versão 1")).toBeVisible();

    // Abre a versão 2 (read-only) e confirma o conteúdo daquela versão.
    await page.getByRole("button", { name: /Versão 2/ }).click();
    await expect(page.getByText("Versão 2 (somente leitura)")).toBeVisible();
    await expect(page.getByText("Queixa inicial E2E")).toBeVisible();
    // O snapshot da v2 não pode conter o conteúdo mais novo (v3), que só existe
    // no editor atual (atrás do modal) — escopa a checagem ao <dl> do snapshot.
    const historicalSnapshot = page.locator("dl").filter({ hasText: "Queixa inicial E2E" });
    await expect(historicalSnapshot).toContainText("Queixa inicial E2E");
    await expect(historicalSnapshot).not.toContainText("Queixa nova E2E");
  });

  test("CENÁRIO B: expectedVersion obsoleto retorna 409 e não sobrescreve", async ({ request }) => {
    const patient = await createTestPatient(request);
    await request.get(`/api/admin/clients/${patient.id}/nutrition-record`); // v1

    // Sessão A salva → v2.
    const a = await request.patch(`/api/admin/clients/${patient.id}/nutrition-record`, {
      data: { chief_complaint: "Conteúdo da sessão A", expectedVersion: 1 },
    });
    expect(a.ok()).toBe(true);

    // Sessão B tenta salvar com expectedVersion antigo → 409.
    const b = await request.patch(`/api/admin/clients/${patient.id}/nutrition-record`, {
      data: { chief_complaint: "Conteúdo da sessão B", expectedVersion: 1 },
    });
    expect(b.status()).toBe(409);

    // Conteúdo de A preservado; V2 criada uma única vez.
    const current = await request.get(`/api/admin/clients/${patient.id}/nutrition-record`);
    const cur = await current.json();
    expect(cur.version).toBe(2);
    expect(cur.chief_complaint).toBe("Conteúdo da sessão A");

    const history = await request.get(`/api/admin/clients/${patient.id}/nutrition-record/versions`);
    const hist = await history.json();
    expect(hist.items.length).toBe(2);
    expect(hist.items[0].version).toBe(2);
    expect(hist.items[1].version).toBe(1);
  });

  test("CENÁRIO C: proposta IA confirmada grava source=ai_proposal com nutricionista responsável", async ({ request }) => {
    const patient = await createTestPatient(request);
    await request.get(`/api/admin/clients/${patient.id}/nutrition-record`); // v1

    const proposal = await seedAiProposal(request, {
      toolName: "proposeNutritionRecordUpdate",
      action: { kind: "nutrition_record", clientId: patient.id, fields: { clinical_history: "Histórico clínico E2E (IA)" } },
      clientId: patient.id,
    });
    expect(proposal.requiresConfirmation).toBe(true);

    const confirm = await request.post(`/api/admin/ai/proposals/${proposal.proposalId}/confirm`);
    expect(confirm.ok()).toBe(true);

    // Última versão: source=ai_proposal, autor = admin que confirmou (nunca "IA").
    const history = await request.get(`/api/admin/clients/${patient.id}/nutrition-record/versions`);
    const hist = await history.json();
    const latest = hist.items[0];
    expect(latest.version).toBe(2);
    expect(latest.source).toBe("ai_proposal");
    expect(latest.changed_by_admin_id).toBeTruthy();

    // v1 permanece imutável (sem o campo da IA).
    const v1 = await request.get(`/api/admin/clients/${patient.id}/nutrition-record/versions/1`);
    const v1body = await v1.json();
    expect(v1body.version).toBe(1);
    expect(v1body.snapshot.clinical_history).toBe(null);
  });
});
