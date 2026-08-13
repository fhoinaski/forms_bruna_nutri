import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./helpers/auth";

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
});