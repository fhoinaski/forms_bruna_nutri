import { test, expect } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";
import { countSubmissionsByEmail, uniqueSuffix } from "./helpers/test-data";

/**
 * Pré-consulta dinâmica (E2E real de UI).
 *
 * A decisão interna IA/tradicional é testada aqui:
 * - IA ativa: abre o formulário dinâmico por tópicos, SEM chooser.
 * - Sem IA: abre o formulário tradicional automaticamente.
 * - Falha da IA: volta ao tradicional preservando respostas.
 * - Refresh: restaura o estado da sessão.
 *
 * O provedor determinístico de E2E (INTAKE_AI_TEST_PROVIDER=deterministic +
 * E2E_TEST_MODE=1, definidos em webserver-entrypoint.mjs) responde por campo
 * sem depender de chave real. A disponibilidade respeita o flag
 * `patient_intake_mode` — alternado via API administrativa autenticada.
 */

test.use({ storageState: ADMIN_STORAGE_STATE });

async function setIntakeAi(request: APIRequestContext, enabled: boolean): Promise<void> {
  const res = await request.put("/api/admin/settings/ai", {
    data: {
      provider: "openai",
      model: "gpt-4o",
      patient_intake_mode: enabled ? "smart" : "traditional",
    },
  });
  expect(res.ok(), `setIntakeAi(${enabled}) falhou: ${await res.text()}`).toBe(true);
}

test.describe("pré-consulta dinâmica", () => {
  test.describe.configure({ mode: "serial" });

  test("IA ativa → formulário dinâmico abre sem chooser", async ({ page, request }) => {
    await setIntakeAi(request, true);

    await page.goto("/formulario");

    // Não existe chooser IA/tradicional.
    await expect(page.getByRole("button", { name: /começar pré-consulta guiada/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /usar formulário tradicional/i })).toHaveCount(0);

    // Formulário dinâmico por tópicos abre no primeiro passo (momento atual).
    await expect(page.getByTestId("pre-consultation-dynamic")).toBeVisible();
    await expect(page.locator("[data-intake-input='textarea']")).toBeVisible();
    await expect(page.getByText(/O que fez você procurar acompanhamento nutricional/i)).toBeVisible();
  });

  test("branches mudam o fluxo (tipo de atendimento define tópicos)", async ({ page, request }) => {
    await setIntakeAi(request, true);

    await page.goto("/formulario");

    // Tópico 1 — momento atual: pergunta aberta.
    await page.locator("[data-intake-input='textarea']").fill("Quero cuidar da minha saúde.");
    await page.getByRole("button", { name: /continuar/i }).click();

    // Objetivo (chips, avança sozinho ao tocar).
    await page.getByRole("button", { name: "Rotina mais leve" }).click();

    // Tipo de atendimento (chips) — seleciona um branch clínico.
    await page.getByRole("button", { name: "Bariátrico" }).click();

    // Identidade: nome é o próximo passo.
    await expect(page.getByRole("textbox", { name: /nome completo/i })).toBeVisible();

    await page.getByRole("textbox", { name: /nome completo/i }).fill("Paciente E2E Dinâmico");
    await page.getByRole("button", { name: /continuar/i }).click();

    // Continua na identidade (whatsapp), sem voltar ao início.
    await expect(page.getByRole("textbox", { name: /whatsapp/i })).toBeVisible();
  });

  test("refresh restaura o estado da sessão", async ({ page, request }) => {
    await setIntakeAi(request, true);

    await page.goto("/formulario");

    await page.locator("[data-intake-input='textarea']").fill("Quero melhorar minha rotina.");
    await page.getByRole("button", { name: /continuar/i }).click();
    await page.getByRole("button", { name: "Rotina mais leve" }).click();
    await page.getByRole("button", { name: "Emagrecimento" }).click();
    await expect(page.getByRole("textbox", { name: /nome completo/i })).toBeVisible();

    await page.reload();

    // Estado restaurado: permanece na identidade (nome), sem voltar ao início.
    await expect(page.getByRole("textbox", { name: /nome completo/i })).toBeVisible();
  });

  test("sem IA → formulário tradicional abre automaticamente", async ({ page, request }) => {
    await setIntakeAi(request, false);
    try {
      await page.goto("/formulario");

      // Formulário tradicional (não o dinâmico, sem chooser).
      await expect(page.getByTestId("pre-consultation-dynamic")).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1, name: /Conte seu momento/i })).toBeVisible();
      await expect(page.getByText(/Qual tipo de atendimento você procura/i)).toBeVisible();
    } finally {
      await setIntakeAi(request, true);
    }
  });

  test("falha da IA → fallback para o tradicional preservando resposta", async ({ page, request }) => {
    await setIntakeAi(request, true);

    await page.goto("/formulario");

    // Dispara o provider error determinístico no primeiro turno (texto livre).
    await page.locator("[data-intake-input='textarea']").fill("__TEST_INTAKE_FAIL__");
    await page.getByRole("button", { name: /continuar/i }).click();

    // Fallback: tradicional assume (sem chooser, sem dinâmico).
    await expect(page.getByTestId("pre-consultation-dynamic")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: /Conte seu momento/i })).toBeVisible();
  });

  test("resposta estruturada inválida 1x é recuperada (smart continua)", async ({ page, request }) => {
    await setIntakeAi(request, true);

    await page.goto("/formulario");
    await page.locator("[data-intake-input='textarea']").fill("__TEST_INTAKE_INVALID_ONCE__");
    await page.getByRole("button", { name: /continuar/i }).click();

    // Continua smart: próximo passo (objetivo) aparece; tradicional não.
    await expect(page.getByTestId("pre-consultation-dynamic")).toBeVisible();
    await expect(page.getByText(/E o que você mais gostaria de melhorar hoje/i)).toBeVisible();
  });

  test("resposta estruturada inválida 2x é recuperada (smart continua)", async ({ page, request }) => {
    await setIntakeAi(request, true);

    await page.goto("/formulario");
    await page.locator("[data-intake-input='textarea']").fill("__TEST_INTAKE_INVALID_TWICE__");
    await page.getByRole("button", { name: /continuar/i }).click();

    await expect(page.getByTestId("pre-consultation-dynamic")).toBeVisible();
    await expect(page.getByText(/E o que você mais gostaria de melhorar hoje/i)).toBeVisible();
  });

  test("falha persistente de formato → reformula e continua smart (sem tradicional)", async ({ page, request }) => {
    await setIntakeAi(request, true);

    await page.goto("/formulario");
    await page.locator("[data-intake-input='textarea']").fill("__TEST_INTAKE_ALWAYS_INVALID__");
    await page.getByRole("button", { name: /continuar/i }).click();

    // NÃO cai no tradicional; mostra a reformulação determinística; pode re-responder.
    await expect(page.getByTestId("pre-consultation-dynamic")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /Conte seu momento/i })).toHaveCount(0);
    await expect(page.getByText(/Não consegui organizar essa resposta/i)).toBeVisible();

    // Re-responde normalmente e continua.
    await page.locator("[data-intake-input='textarea']").fill("Quero melhorar minha rotina");
    await page.getByRole("button", { name: /continuar/i }).click();
    await expect(page.getByText(/E o que você mais gostaria de melhorar hoje/i)).toBeVisible();
  });

  test("provider error após várias respostas → fallback preservando dados", async ({ page, request }) => {
    await setIntakeAi(request, true);

    await page.goto("/formulario");

    await page.locator("[data-intake-input='textarea']").fill("Quero cuidar da minha saúde.");
    await page.getByRole("button", { name: /continuar/i }).click();

    await page.getByRole("button", { name: "Rotina mais leve" }).click(); // objetivo
    await page.getByRole("button", { name: "Emagrecimento" }).click(); // tipo de atendimento

    // Nome (texto direto) — dispara provider error e derruba para o tradicional.
    await page.getByRole("textbox", { name: /nome completo/i }).fill("__TEST_INTAKE_FAIL__");
    await page.getByRole("button", { name: /continuar/i }).click();

    // Fallback → tradicional, com prefill.
    await expect(page.getByTestId("pre-consultation-dynamic")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: /Conte seu momento/i })).toBeVisible();

    // Respostas anteriores preservadas e a falha NÃO vazou para nome.
    await expect(page.locator('textarea[name="motivacao"]')).toHaveValue("ok");
    await expect(page.locator('input[name="nome"]')).toHaveValue("");
  });

  test("erro inesperado NÃO é mascarado como falha de IA (sem fallback)", async ({ page, request }) => {
    await setIntakeAi(request, true);

    await page.goto("/formulario");
    await page.locator("[data-intake-input='textarea']").fill("__TEST_INTAKE_UNEXPECTED__");
    await page.getByRole("button", { name: /continuar/i }).click();

    // Continua no dinâmico (não faz fallback silencioso); mensagem de erro, sem stack.
    await expect(page.getByTestId("pre-consultation-dynamic")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /Conte seu momento/i })).toHaveCount(0);
    await expect(page.getByText(/Não foi possível processar sua mensagem/i)).toBeVisible();
  });

  test("fallback preserva todos os tipos de dados (text, single, multi, branch)", async ({ page, request }) => {
    await setIntakeAi(request, true);

    await page.goto("/formulario");

    // text (nome) + single (objetivo) + single (tipo → branch gestação) + text (whatsapp/email)
    await page.locator("[data-intake-input='textarea']").fill("Quero cuidar da minha saúde.");
    await page.getByRole("button", { name: /continuar/i }).click();

    await page.getByRole("button", { name: "Rotina mais leve" }).click(); // objetivo (single)
    await page.getByRole("button", { name: "Gestação", exact: true }).click(); // tipo (single → branch)

    await page.getByRole("textbox", { name: /nome completo/i }).fill("Paciente E2E Prefill");
    await page.getByRole("button", { name: /continuar/i }).click();
    await page.getByRole("textbox", { name: /whatsapp/i }).fill("11999999999");
    await page.getByRole("button", { name: /continuar/i }).click();
    await page.getByRole("textbox", { name: /e-mail/i }).fill("prefill-e2e@test.local");
    await page.getByRole("button", { name: /continuar/i }).click();

    // multi_choice (sintomas)
    await page.locator("[data-intake-input='textarea']").fill("Sem diagnósticos.");
    await page.getByRole("button", { name: /continuar/i }).click();
    await page.getByRole("button", { name: "Cansaço" }).click();
    await page.getByRole("button", { name: "Inchaço" }).click();
    await page.getByRole("button", { name: /continuar/i }).click();

    // branch (gestação → gestational_details)
    await page.locator("[data-intake-input='textarea']").fill("Segundo trimestre de gestação.");
    await page.getByRole("button", { name: /continuar/i }).click();

    // Provider error na rotina (campo posterior) → fallback.
    await page.locator("[data-intake-input='textarea']").fill("__TEST_INTAKE_FAIL__");
    await page.getByRole("button", { name: /continuar/i }).click();

    // Fallback → tradicional.
    await expect(page.getByTestId("pre-consultation-dynamic")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: /Conte seu momento/i })).toBeVisible();

    // Prefill: text, single, multi e branch (valores reais de input).
    await expect(page.locator('input[name="nome"]')).toHaveValue("Paciente E2E Prefill");
    await expect(page.getByRole("button", { name: "Rotina mais leve" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Gestação", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Cansaço" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Inchaço" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('textarea[name="gestational_details"]')).toHaveValue("ok");
    // O campo que falhou (rotina) NÃO vazou.
    await expect(page.locator('textarea[name="rotina"]')).toHaveValue("");
  });

  test("fallback + submit gera exatamente uma submission", async ({ page, request }) => {
    await setIntakeAi(request, true);
    const email = `e2e-unique-${uniqueSuffix()}@test.local`;

    await page.goto("/formulario");

    await page.locator("[data-intake-input='textarea']").fill("Quero cuidar da minha saúde.");
    await page.getByRole("button", { name: /continuar/i }).click();
    await page.getByRole("button", { name: "Rotina mais leve" }).click();
    await page.getByRole("button", { name: "Emagrecimento" }).click();

    await page.getByRole("textbox", { name: /nome completo/i }).fill("Paciente E2E Submit");
    await page.getByRole("button", { name: /continuar/i }).click();
    await page.getByRole("textbox", { name: /whatsapp/i }).fill("11988887777");
    await page.getByRole("button", { name: /continuar/i }).click();
    await page.getByRole("textbox", { name: /e-mail/i }).fill(email);
    await page.getByRole("button", { name: /continuar/i }).click();

    // Provider error na saúde (texto livre) → fallback.
    await page.locator("[data-intake-input='textarea']").fill("__TEST_INTAKE_FAIL__");
    await page.getByRole("button", { name: /continuar/i }).click();

    // Fallback → tradicional.
    await expect(page.getByTestId("pre-consultation-dynamic")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: /Conte seu momento/i })).toBeVisible();

    // Aceita privacidade e envia.
    await page.locator("#privacyAccepted").check();
    await page.getByRole("button", { name: /enviar pr[eé]-consulta/i }).click();

    // Sucesso.
    await expect(page.getByText(/Obrigada por compartilhar/i)).toBeVisible();

    // Exatamente 1 submission para este e-mail.
    const total = await countSubmissionsByEmail(request, email);
    expect(total).toBe(1);
  });
});