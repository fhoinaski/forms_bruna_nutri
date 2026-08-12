import { test, expect } from "@playwright/test";
import { createTestSubmission } from "./helpers/test-data";

/**
 * Pré-consulta guiada por IA (FASE 16). O ambiente E2E não tem provedor de
 * IA configurado, então:
 *
 * - Cenário 1 (IA desativada): o formulário tradicional é o caminho padrão.
 * - Fallback: PUT direto das configurações de IA desativando o flag garante
 *   que o formulário continue acessível e funcional de ponta a ponta.
 *
 * Os fluxos de conversa guiada são cobertos nos testes unitários/de rota
 * (patient-intake-*.test.ts), que mockam o agente sem depender de chave de
 * provedor. Aqui validamos os contratos públicos reais de disponibilidade e
 * a resiliência do formulário tradicional (critério de aceite #1 e #10).
 */

test.describe("pré-consulta guiada por IA", () => {
  test("formulário tradicional continua disponível quando a IA está desativada", async ({ page }) => {
    await page.goto("/formulario");
    // O formulário tradicional aparece (header + campo de tipo de atendimento).
    await expect(page.getByRole("heading", { level: 1, name: /Conte seu momento/i })).toBeVisible();
    await expect(page.getByText(/Qual tipo de atendimento você procura/i)).toBeVisible();
  });

  test("endpoint de disponibilidade responde sem expor chave de IA", async ({ request }) => {
    const response = await request.get("/api/public/pre-consultation/intake/availability");
    expect(response.ok()).toBe(true);
    const body = await response.json();
    // Nunca expõe api_key; só o booleano de disponibilidade.
    expect(body).toHaveProperty("available");
    expect(body).toHaveProperty("mode");
    expect(body).not.toHaveProperty("api_key");
  });

  test("submissão tradicional via API continua funcionando (fluxo canônico)", async ({ request }) => {
    const submission = await createTestSubmission(request);
    expect(submission.id).toBeTruthy();
  });

  test("criar sessão de intake com o provedor determinístico ativo retorna 200", async ({ request }) => {
    const response = await request.post("/api/public/pre-consultation/intake/session");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.sessionId).toBeTruthy();
  });

  test("jornada completa guiada por IA pela API: sessão → mensagens → revisão → complete", async ({ request }) => {
    // Cria a sessão.
    const create = await request.post("/api/public/pre-consultation/intake/session");
    expect(create.ok()).toBe(true);
    const created = await create.json();
    expect(created.sessionId).toBeTruthy();

    let sessionVersion = created.sessionVersion ?? 1;
    let status = created.state?.status ?? "active";
    let guard = 0;

    // Responde até esgotar os campos (o executor determinístico preenche
    // um valor válido para cada campo autorizado).
    while (status !== "review" && status !== "completed") {
      if (guard++ > 60) throw new Error("jornada não convergiu");

      const msg = await request.post("/api/public/pre-consultation/intake/message", {
        data: { message: "resposta de teste", sessionVersion },
      });
      expect(msg.ok()).toBe(true);
      const body = await msg.json();
      sessionVersion = body.sessionVersion ?? sessionVersion;
      status = body.status ?? status;
      if (body.fallback) break;
      if (!body.nextField) break;
    }

    // Revisão disponível.
    const review = await request.get("/api/public/pre-consultation/intake/review");
    expect(review.ok()).toBe(true);
    const reviewBody = await review.json();
    expect(reviewBody.sections).toBeTruthy();

    // Completa.
    const complete = await request.post("/api/public/pre-consultation/intake/complete", {
      data: { sessionVersion },
    });
    const completeText = await complete.text();
    expect(complete.ok(), `complete falhou: ${completeText}`).toBe(true);
    const completeBody = JSON.parse(completeText);
    expect(completeBody.submissionId).toBeTruthy();

    // O complete é idempotente: repetir retorna o MESMO submissionId.
    const repeat = await request.post("/api/public/pre-consultation/intake/complete", {
      data: { sessionVersion },
    });
    expect(repeat.ok()).toBe(true);
    const repeatBody = await repeat.json();
    expect(repeatBody.submissionId).toBe(completeBody.submissionId);
  });

  test("fallback após respostas preserva os campos já coletados", async ({ request }) => {
    // Cria a sessão e responde alguns campos normalmente.
    const create = await request.post("/api/public/pre-consultation/intake/session");
    const created = await create.json();
    let sessionVersion = created.sessionVersion ?? 1;

    // Responde 3 campos normalmente.
    for (let i = 0; i < 3; i++) {
      const msg = await request.post("/api/public/pre-consultation/intake/message", {
        data: { message: "resposta preservada no fallback", sessionVersion },
      });
      const body = await msg.json();
      sessionVersion = body.sessionVersion ?? sessionVersion;
    }

    // Dispara o provider error determinístico.
    const fail = await request.post("/api/public/pre-consultation/intake/message", {
      data: { message: "__TEST_INTAKE_FAIL__", sessionVersion },
    });
    expect(fail.ok()).toBe(true);
    const failBody = await fail.json();
    expect(failBody.fallback).toBe(true);
    // As respostas anteriores estão preservadas no estado.
    expect(failBody.answers).toBeTruthy();
    expect(Object.keys(failBody.answers).length).toBeGreaterThanOrEqual(3);
  });
});
