import { test, expect } from "./fixtures";
import { createTestSubmission } from "./helpers/test-data";

/**
 * Pré-consulta — contratos públicos determinísticos (não dependem do flag
 * mutável de IA). A jornada guiada por IA e os cenários de disponibilidade
 * (dinâmico vs tradicional) ficam em pre-consultation-dynamic.spec.ts, que
 * controla `patient_intake_mode` de forma serial e isolada.
 */

test.describe("pré-consulta — contratos públicos", () => {
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
});