import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/d1/client", () => ({ d1Query: vi.fn().mockResolvedValue([]), d1Execute: vi.fn(), d1Batch: vi.fn().mockResolvedValue([]) }));
import { resolveFoodCandidate } from "@/lib/nutrition/food-resolver";
import { tokenMatchesCandidateText } from "@/lib/nutrition/food-terminology";

/**
 * Testes negativos explícitos (Food Terminology & Catalog Coverage V1,
 * seção 11) — a lista EXATA de trocas proibidas do pedido. Cada um prova
 * que a mudança desta rodada (aliases + tradução USDA + preferência
 * profissional) nunca abre uma dessas portas, mesmo indiretamente.
 */
describe("Food Terminology V1 — testes negativos (nunca resolve errado), lista da seção 11", () => {
  it("tilápia nunca resolve pra merluza (nem qualquer outro peixe) — sem candidato local, USDA nunca testado offline", async () => {
    const resolution = await resolveFoodCandidate("tilápia", []);
    expect(resolution.status).not.toBe("RESOLVED");
    if (resolution.status === "AMBIGUOUS") {
      expect(resolution.candidates.every((c) => !/merluza/i.test(c.name))).toBe(true);
    }
  });

  it("frango nunca resolve pra peru — são espécies diferentes, nenhum alias liga uma à outra", async () => {
    const resolution = await resolveFoodCandidate("frango", []);
    expect(resolution.status).not.toBe("RESOLVED");
    if (resolution.status === "AMBIGUOUS") {
      expect(resolution.candidates.every((c) => !/\bperu\b/i.test(c.name))).toBe(true);
    }
  });

  it('"arroz branco" nunca resolve pra "arroz integral" — o alias aponta só pra "arroz tipo 1"', async () => {
    const resolution = await resolveFoodCandidate("arroz branco cozido", []);
    expect(resolution.status).toBe("RESOLVED");
    expect(resolution.name?.toLowerCase()).not.toContain("integral");
  });

  it('"leite integral" nunca resolve pra "leite desnatado" (e vice-versa) — são produtos nutricionalmente diferentes na TACO', async () => {
    const integral = await resolveFoodCandidate("leite integral", []);
    if (integral.status === "RESOLVED") expect(integral.name?.toLowerCase()).not.toContain("desnatado");
    const desnatado = await resolveFoodCandidate("leite desnatado", []);
    if (desnatado.status === "RESOLVED") expect(desnatado.name?.toLowerCase()).toContain("desnatado");
  });

  it('"tomate cereja" nunca resolve pra tomate comum — variedade ausente do TACO, sem alias de emergência', async () => {
    const resolution = await resolveFoodCandidate("tomate cereja", []);
    // Offline (sem USDA via rede) continua NOT_FOUND — nunca "escorregou"
    // pra qualquer entrada de tomate comum da TACO.
    expect(resolution.status).not.toBe("RESOLVED");
  });

  it('"granola sem açúcar" nunca resolve pra granola com açúcar/mel — TACO não distingue e o resolver nunca inventa', async () => {
    const resolution = await resolveFoodCandidate("granola sem açúcar", []);
    expect(resolution.status).not.toBe("RESOLVED");
  });

  it('"assado" nunca bate com candidato "cru" (e vice-versa) — tradução de preparo é 1:1, nunca cruzada', () => {
    expect(tokenMatchesCandidateText("assado", "fish tilapia raw", true)).toBe(false);
    expect(tokenMatchesCandidateText("cru", "fish tilapia cooked dry heat", true)).toBe(false);
    expect(tokenMatchesCandidateText("cru", "fish tilapia roasted", true)).toBe(false);
  });

  it('alias de "café coado" nunca vaza para "café solúvel" — produto diferente, fora do padrão da regex', async () => {
    const resolution = await resolveFoodCandidate("café solúvel sem açúcar", []);
    if (resolution.status === "RESOLVED") expect(resolution.name).not.toBe("Café, infusão 10%");
  });

  it('alias de "castanha-do-pará" nunca vaza para "castanha-de-caju" — espécies diferentes', async () => {
    const resolution = await resolveFoodCandidate("castanha de caju", []);
    if (resolution.status === "RESOLVED") expect(resolution.name?.toLowerCase()).not.toContain("brasil");
  });
});
