import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures";
import { ADMIN_STORAGE_STATE, suppressDailyBriefingPopup } from "./helpers/auth";
import { createTestPatient } from "./helpers/test-data";

/**
 * Prova real de concorrencia otimista no MealPlanEditor: DUAS ABAS de
 * verdade (duas Page do Playwright no MESMO contexto/sessao, como duas abas
 * reais de um mesmo usuario), cada uma dirigindo a UI de verdade (preencher
 * campo, clicar Salvar) — nunca uma chamada de API artificial simulando "a
 * outra sessao" (isso ja existe em e2e/meal-plan-ux2.spec.ts e cobre outro
 * angulo: a UI reagindo a uma mudanca vinda de fora da UI. Este arquivo
 * cobre o cenario pedido explicitamente: duas ABAS REAIS brigando pelo
 * mesmo plano).
 *
 * Cenario:
 * 1. Aba A e aba B abrem o MESMO plano, ambas carregam v1.
 * 2. Aba A edita e salva -> v2 (via clique real no botao Salvar).
 * 3. SEM recarregar, aba B edita algo diferente e salva.
 * 4. Esperado: aba B recebe o aviso de conflito (409) da UI, com opcao de
 *    recarregar; nao ha sobrescrita silenciosa; o conteudo da aba A
 *    permanece; a aba B, ao recarregar, ve exatamente o que a aba A salvou.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

async function createPlan(request: APIRequestContext, patientId: string, title = "Plano concorrencia E2E") {
  const res = await request.post(`/api/admin/clients/${patientId}/meal-plans`, {
    data: { targetGroup: "ADULTO_SAUDAVEL", title },
  });
  expect(res.ok()).toBe(true);
  return res.json();
}

function fieldAfterLabel(page: import("@playwright/test").Page, label: string, tag: "input" | "textarea" = "input") {
  return page.locator(`xpath=//label[normalize-space()="${label}"]/following-sibling::${tag}[1]`);
}

test.describe("plano alimentar — concorrencia real entre duas abas (optimistic concurrency)", () => {
  test("aba B recebe 409 amigavel e reconciliacao segura quando aba A salva primeiro", async ({ page: pageA, context, request }) => {
    const patient = await createTestPatient(request);
    // Plano criado via API só como setup (mesmo padrão do arquivo irmão
    // meal-plan-ux2.spec.ts) — o mecanismo de concorrência em si, abaixo, é
    // 100% guiado pela UI nas duas abas.
    const plan = await createPlan(request, patient.id);

    // Aba A.
    await pageA.goto(`/dashboard/clients/${patient.id}`);
    await pageA.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(pageA.getByRole("button", { name: /^rascunho - v1$/i })).toBeVisible();

    // Aba B — segunda Page no MESMO contexto (mesma sessao logada), como um
    // usuario real abrindo uma segunda aba do navegador no mesmo plano.
    const pageB = await context.newPage();
    await suppressDailyBriefingPopup(pageB);
    await pageB.goto(`/dashboard/clients/${patient.id}`);
    await pageB.getByRole("tab", { name: "Plano alimentar" }).click();
    await expect(pageB.getByRole("button", { name: /^rascunho - v1$/i })).toBeVisible();

    // Aba A edita o titulo e salva de verdade pela UI -> v2.
    await fieldAfterLabel(pageA, "Titulo do plano").fill("Editado pela aba A");
    await pageA.getByRole("button", { name: /^salvar rascunho$/i }).click();
    await expect(pageA.getByText(/^plano alimentar salvo\.$/i)).toBeVisible();
    await expect(pageA.getByRole("button", { name: /^rascunho - v2$/i })).toBeVisible();

    // Aba B, SEM recarregar (ainda acredita estar em v1), edita algo
    // diferente do que a aba A mudou e tenta salvar.
    await fieldAfterLabel(pageB, "Orientacoes gerais para o cliente", "textarea").fill("Edicao diferente feita pela aba B, sem reload.");
    await pageB.getByRole("button", { name: /^salvar rascunho$/i }).click();

    // Esperado: aviso de conflito amigavel na aba B (nao um erro generico),
    // com a opcao segura de recarregar — nunca uma sobrescrita silenciosa.
    await expect(pageB.getByText(/atualizado em outra sessao/i)).toBeVisible();
    await expect(pageB.getByRole("button", { name: /recarregar plano/i })).toBeVisible();
    // A aba B continua mostrando v1 (nao avancou, nao sobrescreveu nada).
    await expect(pageB.getByRole("button", { name: /^rascunho - v1$/i })).toBeVisible();

    // O conteudo da aba A continua o que ela salvou (nenhuma sobrescrita
    // silenciosa pela tentativa da aba B) — verificado direto no servidor,
    // fonte de verdade independente das duas UIs. (Rota do plano so tem PUT;
    // a lista de planos do cliente e a forma de ler o estado atual.)
    const afterConflict = await request.get(`/api/admin/clients/${patient.id}/meal-plans`);
    const afterConflictPlans = await afterConflict.json();
    const afterConflictPlan = afterConflictPlans.find((p: { id: string }) => p.id === plan.id);
    expect(afterConflictPlan.version).toBe(2);
    expect(afterConflictPlan.title).toBe("Editado pela aba A");

    // Aba B recarrega (acao segura oferecida pela propria UI) e passa a ver
    // exatamente o que a aba A salvou — sua propria edicao descartada de
    // forma visivel, nunca mesclada as escondidas.
    await pageB.getByRole("button", { name: /recarregar plano/i }).click();
    await expect(fieldAfterLabel(pageB, "Titulo do plano")).toHaveValue("Editado pela aba A");
    await expect(pageB.getByRole("button", { name: /^rascunho - v2$/i })).toBeVisible();
    await expect(pageB.getByText(/atualizado em outra sessao/i)).toHaveCount(0);

    // Historico de versoes: exatamente 2 (v1 original, v2 da aba A) — sem
    // versao fantasma da tentativa rejeitada da aba B.
    const versions = await request.get(`/api/admin/clients/${patient.id}/meal-plans/${plan.id}/versions`);
    const versionsBody = await versions.json();
    expect(versionsBody.items.map((item: { version: number }) => item.version).sort()).toEqual([1, 2]);

    await pageB.close();
  });
});
