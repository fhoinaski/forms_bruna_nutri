import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/d1/client", () => ({ d1Query: vi.fn().mockResolvedValue([]), d1Execute: vi.fn(), d1Batch: vi.fn().mockResolvedValue([]) }));
import { resolveFoodCandidate } from "@/lib/nutrition/food-resolver";

/**
 * Food Resolver V2 (fechamento de gaps — nomenclatura trivial em
 * linguagem natural). Auditoria real contra o catálogo (offline, sem
 * USDA/CUSTOM via rede — resultados de USDA/CUSTOM não entram aqui):
 * 16 nomes comuns reportados como falhando no wizard, cada um com o
 * status ANTES e DEPOIS das correções (stopwords/abreviação/alias/
 * ranking) medido de verdade, não suposto.
 *
 *   QUERY                              ANTES        DEPOIS      SOURCE  RESOLUTION METHOD
 *   café coado sem açúcar              NOT_FOUND    NOT_FOUND   —       — (não existe no catálogo offline; gap real, não forçado)
 *   pão de forma integral              AMBIGUOUS    AMBIGUOUS   —       — (2 candidatos reais: TACO + COMPLEMENTARY, corretamente não escolhido sozinho)
 *   ovo de galinha cozido              AMBIGUOUS    RESOLVED    TACO    RANKED (único candidato em todo o catálogo)
 *   mamão papaia                       AMBIGUOUS    RESOLVED    TACO    RANKED
 *   arroz branco cozido                NOT_FOUND    RESOLVED    TACO    ALIAS ("arroz branco"->"arroz tipo 1") + RANKED
 *   feijão preto cozido                AMBIGUOUS    RESOLVED    TACO    RANKED
 *   peito de frango grelhado           NOT_FOUND    RESOLVED    TACO    NORMALIZED (stopword "de" removido do match de tokens) + RANKED
 *   brócolis cozido                    AMBIGUOUS    RESOLVED    TACO    RANKED
 *   azeite de oliva extra virgem       AMBIGUOUS    RESOLVED    TACO    RANKED
 *   iogurte natural integral           NOT_FOUND    NOT_FOUND   —       — (TACO não distingue "integral" pra iogurte; gap real)
 *   granola sem açúcar                 NOT_FOUND    NOT_FOUND   —       — (TACO só tem "s/ óleo e s/ mel"; "açúcar" não é sinônimo, gap real)
 *   banana prata                       AMBIGUOUS    RESOLVED    TACO    RANKED
 *   filé de tilápia assado             NOT_FOUND    NOT_FOUND   —       — (tilápia não existe na TACO; gap real de catálogo, precisa de USDA/CUSTOM)
 *   batata doce cozida                 AMBIGUOUS    RESOLVED    TACO    RANKED
 *   alface americana                   AMBIGUOUS    RESOLVED    TACO    RANKED
 *   tomate cereja                      NOT_FOUND    NOT_FOUND   —       — (tomate cereja não existe na TACO; gap real)
 *
 * 10/16 passaram a resolver automaticamente (sem nenhum caso de escolha
 * errada — os 5 que continuam NOT_FOUND/AMBIGUOUS são gaps reais do
 * catálogo TACO offline ou ambiguidade genuína, nunca mascarados).
 */
describe("Food Resolver V2 — nomes comuns em linguagem natural (matriz real)", () => {
  it.each([
    ["ovo de galinha cozido", "RESOLVED"],
    ["mamão papaia", "RESOLVED"],
    ["arroz branco cozido", "RESOLVED"],
    ["feijão preto cozido", "RESOLVED"],
    ["peito de frango grelhado", "RESOLVED"],
    ["brócolis cozido", "RESOLVED"],
    ["azeite de oliva extra virgem", "RESOLVED"],
    ["banana prata", "RESOLVED"],
    ["batata doce cozida", "RESOLVED"],
    ["alface americana", "RESOLVED"],
  ] as const)('"%s" -> %s (antes era NOT_FOUND ou AMBIGUOUS)', async (query, expected) => {
    const resolution = await resolveFoodCandidate(query, []);
    expect(resolution.status).toBe(expected);
  });

  it('"pão de forma integral" continua AMBIGUOUS — 2 candidatos reais (TACO + COMPLEMENTARY), nunca escolhido sozinho', async () => {
    const resolution = await resolveFoodCandidate("pão de forma integral", []);
    expect(resolution.status).toBe("AMBIGUOUS");
    expect(resolution.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    "café coado sem açúcar",
    "iogurte natural integral",
    "granola sem açúcar",
    "filé de tilápia assado",
    "tomate cereja",
  ])('"%s" continua NOT_FOUND — gap real do catálogo TACO offline, nunca mascarado com um alias inventado', async (query) => {
    const resolution = await resolveFoodCandidate(query, []);
    expect(resolution.status).toBe("NOT_FOUND");
  });
});

describe("Food Resolver V2 — testes negativos (nunca resolve errado)", () => {
  it.each([
    "tilápia",
    "frango",
    "arroz branco",
    "leite integral",
    "batata doce",
    "peixe",
    "carne",
  ])('query genérica/ambígua "%s" NUNCA resolve sozinha (nem AMBIGUOUS nem NOT_FOUND viram RESOLVED por acidente)', async (query) => {
    const resolution = await resolveFoodCandidate(query, []);
    expect(resolution.status).not.toBe("RESOLVED");
  });

  it("nunca troca espécie/preparo diferente silenciosamente: tilápia nunca resolve pra merluza ou qualquer outro peixe", async () => {
    const resolution = await resolveFoodCandidate("tilápia", []);
    expect(resolution.status).not.toBe("RESOLVED");
  });

  it('o alias "arroz branco" nunca aponta pra "arroz integral" — são alimentos diferentes, não um alias', async () => {
    const resolution = await resolveFoodCandidate("arroz branco cozido", []);
    expect(resolution.status).toBe("RESOLVED");
    expect(resolution.name?.toLowerCase()).not.toContain("integral");
    expect(resolution.name).toBe("Arroz, tipo 1, cozido");
  });
});
